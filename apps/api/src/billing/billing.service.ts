import { Injectable } from '@nestjs/common';
import { ErrorCodes, InvoiceItem, InvoiceLineItem, Paginated } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Invoice not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

@Injectable()
export class BillingService {
  constructor(private db: Db, private audit: AuditService) {}

  async createInvoice(
    ctx: AuthContext,
    dto: {
      appointmentId?: string | null;
      customerId?: string | null;
      workerId?: string | null;
      discountPaise?: number;
      items: Array<{
        type: 'service' | 'product';
        itemId?: string | null;
        itemName: string;
        quantity: number;
        unitPricePaise: number;
      }>;
    }
  ): Promise<InvoiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // 1. Calculate totals
      let subtotal = 0;
      for (const it of dto.items) {
        subtotal += it.unitPricePaise * it.quantity;
      }
      const discount = dto.discountPaise ?? 0;
      const finalTotal = Math.max(0, subtotal - discount);

      // 2. Generate unique invoice number: INV-YEAR-NUMBER
      const seqVal = (await c.query(`SELECT nextval('invoice_number_seq') AS num`)).rows[0].num;
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(seqVal).padStart(4, '0')}`;

      // 3. Create invoice record
      const invRes = await c.query(
        `INSERT INTO invoices (
           shop_id, invoice_number, appointment_id, customer_id, worker_id,
           subtotal_paise, discount_paise, final_total_paise, payment_status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         RETURNING id`,
        [ctx.shopId, invoiceNumber, dto.appointmentId ?? null, dto.customerId ?? null, dto.workerId ?? null, subtotal, discount, finalTotal]
      );
      const invoiceId = invRes.rows[0].id;

      // 4. Insert items and decrement product inventory if product
      for (const it of dto.items) {
        const itemTotal = it.unitPricePaise * it.quantity;
        await c.query(
          `INSERT INTO invoice_items (shop_id, invoice_id, type, item_id, item_name, quantity, unit_price_paise, total_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [ctx.shopId, invoiceId, it.type, it.itemId ?? null, it.itemName, it.quantity, it.unitPricePaise, itemTotal]
        );

        if (it.type === 'product' && it.itemId) {
          const prod = (await c.query(
            `SELECT id, name, stock_quantity, cost_price_paise FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
            [it.itemId, ctx.shopId]
          )).rows[0];

          if (prod) {
            const newStock = Number(prod.stock_quantity) - it.quantity;
            await c.query(`UPDATE products SET stock_quantity = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`, [
              newStock,
              it.itemId,
              ctx.shopId,
            ]);

            await c.query(
              `INSERT INTO inventory_transactions (shop_id, product_id, type, quantity_delta, balance_after, unit_cost_paise, reference_id, notes, created_by)
               VALUES ($1, $2, 'sale', $3, $4, $5, $6, $7, $8)`,
              [ctx.shopId, it.itemId, -it.quantity, newStock, prod.cost_price_paise, invoiceId, `Sold via Invoice ${invoiceNumber}`, ctx.userId]
            );
          }
        }
      }

      // 5. If linked to appointment, update appointment status to completed
      if (dto.appointmentId) {
        await c.query(
          `UPDATE appointments SET status = 'completed', updated_at = now() WHERE id = $1 AND shop_id = $2`,
          [dto.appointmentId, ctx.shopId]
        );
        await c.query(
          `INSERT INTO appointment_status_history (shop_id, appointment_id, status, notes, changed_by)
           VALUES ($1, $2, 'completed', 'Completed with invoice generation', $3)`,
          [ctx.shopId, dto.appointmentId, ctx.userId]
        );
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'billing.invoice.create',
        entity: 'invoice',
        entityId: invoiceId,
        newValues: { invoiceNumber, finalTotal, subtotal, discount },
        ip: ctx.ip,
      });

      return this.loadInvoice(c, ctx.shopId!, invoiceId);
    });
  }

  async recordPayment(
    ctx: AuthContext,
    invoiceId: string,
    dto: { method: 'cash' | 'upi_qr'; amountPaise: number; transactionReference?: string | null }
  ): Promise<InvoiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const inv = (await c.query(`SELECT * FROM invoices WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [invoiceId, ctx.shopId])).rows[0];
      if (!inv) throw notFound();

      if (inv.payment_status === 'void') {
        throw badRequest('Cannot record payment against a voided invoice.');
      }

      await c.query(
        `INSERT INTO payments (shop_id, invoice_id, method, amount_paise, status, transaction_reference, recorded_by)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6)`,
        [ctx.shopId, invoiceId, dto.method, dto.amountPaise, dto.transactionReference ?? null, ctx.userId]
      );

      // Check total paid
      const totalPaid = Number(
        (await c.query(`SELECT COALESCE(sum(amount_paise), 0) AS total FROM payments WHERE invoice_id = $1 AND status = 'completed'`, [invoiceId])).rows[0].total
      );

      if (totalPaid >= Number(inv.final_total_paise)) {
        await c.query(`UPDATE invoices SET payment_status = 'paid', updated_at = now() WHERE id = $1 AND shop_id = $2`, [
          invoiceId,
          ctx.shopId,
        ]);
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'billing.payment.record',
        entity: 'invoice',
        entityId: invoiceId,
        newValues: { method: dto.method, amountPaise: dto.amountPaise, totalPaid },
        ip: ctx.ip,
      });

      return this.loadInvoice(c, ctx.shopId!, invoiceId);
    });
  }

  async voidInvoice(ctx: AuthContext, invoiceId: string): Promise<InvoiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const inv = (await c.query(`SELECT * FROM invoices WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [invoiceId, ctx.shopId])).rows[0];
      if (!inv) throw notFound();
      if (inv.payment_status === 'void') throw badRequest('Invoice is already void.');

      await c.query(`UPDATE invoices SET payment_status = 'void', updated_at = now() WHERE id = $1 AND shop_id = $2`, [
        invoiceId,
        ctx.shopId,
      ]);

      // Re-credit product stock
      const productItems = (await c.query(
        `SELECT item_id, quantity, item_name FROM invoice_items WHERE invoice_id = $1 AND type = 'product' AND item_id IS NOT NULL`,
        [invoiceId]
      )).rows;

      for (const p of productItems) {
        const prod = (await c.query(`SELECT stock_quantity, cost_price_paise FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [p.item_id, ctx.shopId])).rows[0];
        if (prod) {
          const restored = Number(prod.stock_quantity) + Number(p.quantity);
          await c.query(`UPDATE products SET stock_quantity = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`, [restored, p.item_id, ctx.shopId]);
          await c.query(
            `INSERT INTO inventory_transactions (shop_id, product_id, type, quantity_delta, balance_after, unit_cost_paise, reference_id, notes, created_by)
             VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7, $8)`,
            [ctx.shopId, p.item_id, p.quantity, restored, prod.cost_price_paise, invoiceId, `Voided invoice ${inv.invoice_number} stock return`, ctx.userId]
          );
        }
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'billing.invoice.void',
        entity: 'invoice',
        entityId: invoiceId,
        oldValues: { paymentStatus: inv.payment_status },
        newValues: { paymentStatus: 'void' },
        ip: ctx.ip,
      });

      return this.loadInvoice(c, ctx.shopId!, invoiceId);
    });
  }

  async list(
    ctx: AuthContext,
    q: { customerId?: string; workerId?: string; paymentStatus?: string; startDate?: string; endDate?: string; page: number; limit: number }
  ): Promise<Paginated<InvoiceItem>> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const conditions = ['inv.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (q.customerId) {
        params.push(q.customerId);
        conditions.push(`inv.customer_id = $${params.length}`);
      }
      if (q.workerId) {
        params.push(q.workerId);
        conditions.push(`inv.worker_id = $${params.length}`);
      }
      if (q.paymentStatus) {
        params.push(q.paymentStatus);
        conditions.push(`inv.payment_status = $${params.length}`);
      }
      if (q.startDate) {
        params.push(q.startDate);
        conditions.push(`inv.created_at >= $${params.length}::timestamptz`);
      }
      if (q.endDate) {
        params.push(q.endDate);
        conditions.push(`inv.created_at <= $${params.length}::timestamptz`);
      }

      const whereClause = conditions.join(' AND ');
      const total = Number((await c.query(`SELECT count(*)::int n FROM invoices inv WHERE ${whereClause}`, params)).rows[0].n);

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit);
      params.push(offset);

      const rows = (await c.query(
        `SELECT inv.id FROM invoices inv WHERE ${whereClause} ORDER BY inv.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )).rows;

      const items: InvoiceItem[] = [];
      for (const r of rows) {
        items.push(await this.loadInvoice(c, ctx.shopId!, r.id));
      }

      return { items, page: q.page, limit: q.limit, total };
    });
  }

  get(ctx: AuthContext, id: string): Promise<InvoiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      return this.loadInvoice(c, ctx.shopId!, id);
    });
  }

  private async loadInvoice(c: any, shopId: string, invoiceId: string): Promise<InvoiceItem> {
    const row = (await c.query(
      `SELECT inv.id, inv.invoice_number, inv.appointment_id, inv.customer_id, c.name AS customer_name,
              inv.worker_id, w.display_name AS worker_name, inv.subtotal_paise, inv.discount_paise,
              inv.final_total_paise, inv.payment_status, inv.created_at, inv.updated_at
       FROM invoices inv
       LEFT JOIN customers c ON c.id = inv.customer_id
       LEFT JOIN workers w ON w.id = inv.worker_id
       WHERE inv.id = $1 AND inv.shop_id = $2`,
      [invoiceId, shopId]
    )).rows[0];

    if (!row) throw notFound();

    const items = (await c.query(
      `SELECT id, type, item_id, item_name, quantity, unit_price_paise, total_paise
       FROM invoice_items
       WHERE invoice_id = $1 AND shop_id = $2`,
      [invoiceId, shopId]
    )).rows;

    const payments = (await c.query(
      `SELECT p.id, p.invoice_id, p.method, p.amount_paise, p.status, p.transaction_reference,
              u.name AS recorded_by_name, p.created_at
       FROM payments p
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.invoice_id = $1 AND p.shop_id = $2
       ORDER BY p.created_at ASC`,
      [invoiceId, shopId]
    )).rows;

    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      appointmentId: row.appointment_id,
      customerId: row.customer_id,
      customerName: row.customer_name ?? null,
      workerId: row.worker_id,
      workerName: row.worker_name ?? null,
      subtotalPaise: Number(row.subtotal_paise),
      discountPaise: Number(row.discount_paise),
      finalTotalPaise: Number(row.final_total_paise),
      paymentStatus: row.payment_status,
      items: items.map((i: any) => ({
        id: i.id,
        type: i.type,
        itemId: i.item_id,
        itemName: i.item_name,
        quantity: Number(i.quantity),
        unitPricePaise: Number(i.unit_price_paise),
        totalPaise: Number(i.total_paise),
      })),
      payments: payments.map((p: any) => ({
        id: p.id,
        invoiceId: p.invoice_id,
        method: p.method,
        amountPaise: Number(p.amount_paise),
        status: p.status,
        transactionReference: p.transaction_reference,
        recordedByName: p.recorded_by_name,
        createdAt: p.created_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
