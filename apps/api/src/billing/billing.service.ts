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
      couponCode?: string | null;
      tipPaise?: number;
      redeemPoints?: number;
      customerMembershipId?: string | null;
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
      let serviceSubtotal = 0;
      let productSubtotal = 0;
      for (const it of dto.items) {
        const lineTotal = it.unitPricePaise * it.quantity;
        subtotal += lineTotal;
        if (it.type === 'service') serviceSubtotal += lineTotal;
        if (it.type === 'product') productSubtotal += lineTotal;
      }
      let discount = dto.discountPaise ?? 0;

      // Handle Points Redemption
      let pointsToRedeem = dto.redeemPoints ?? 0;
      let pointsDiscountPaise = 0;
      let customerRow: any = null;

      if (pointsToRedeem > 0) {
        if (!dto.customerId) throw badRequest('Customer ID is required to redeem loyalty points.');

        customerRow = (
          await c.query(`SELECT id, loyalty_points FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [
            dto.customerId,
            ctx.shopId,
          ])
        ).rows[0];

        if (!customerRow) throw notFound('Customer not found.');

        // Load loyalty settings
        const settings = (await c.query(`SELECT * FROM loyalty_settings WHERE shop_id = $1`, [ctx.shopId])).rows[0] || {
          is_enabled: true,
          earn_per_rupee_paise: 10000,
          point_value_paise: 100,
          min_redeem_points: 50,
          max_discount_percentage: 50,
        };

        if (!settings.is_enabled) {
          throw badRequest('Loyalty points program is not enabled for this shop.');
        }

        const currentPoints = Number(customerRow.loyalty_points || 0);
        if (pointsToRedeem > currentPoints) {
          throw badRequest(`Customer only has ${currentPoints} points; cannot redeem ${pointsToRedeem}.`);
        }

        if (pointsToRedeem < Number(settings.min_redeem_points)) {
          throw badRequest(`Minimum points required to redeem is ${settings.min_redeem_points}.`);
        }

        pointsDiscountPaise = pointsToRedeem * Number(settings.point_value_paise);
        const maxAllowedDiscount = Math.floor(subtotal * (Number(settings.max_discount_percentage) / 100));

        if (pointsDiscountPaise > maxAllowedDiscount) {
          throw badRequest(`Points redemption exceeds maximum allowed ${settings.max_discount_percentage}% of bill total.`);
        }

        discount += pointsDiscountPaise;
      }

      // Handle Coupon Code Discount
      let couponId: string | null = null;
      let couponDiscountPaise = 0;

      if (dto.couponCode) {
        const cleanCode = dto.couponCode.trim().toUpperCase();
        const couponRow = (
          await c.query(`SELECT * FROM coupons WHERE shop_id = $1 AND code = $2 FOR UPDATE`, [
            ctx.shopId,
            cleanCode,
          ])
        ).rows[0];

        if (!couponRow) {
          throw badRequest(`Coupon "${cleanCode}" does not exist.`);
        }
        if (!couponRow.is_active) {
          throw badRequest(`Coupon "${cleanCode}" is no longer active.`);
        }

        const now = new Date();
        if (new Date(couponRow.valid_from) > now) {
          throw badRequest(`Coupon "${cleanCode}" is not yet valid.`);
        }
        if (couponRow.valid_until && new Date(couponRow.valid_until) < now) {
          throw badRequest(`Coupon "${cleanCode}" has expired.`);
        }
        if (
          couponRow.max_redemptions_total &&
          Number(couponRow.times_redeemed) >= Number(couponRow.max_redemptions_total)
        ) {
          throw badRequest(`Coupon "${cleanCode}" has reached its maximum total redemptions limit.`);
        }

        if (dto.customerId) {
          const uses = (
            await c.query(
              `SELECT COALESCE(SUM(CASE WHEN type = 'redemption' THEN 1 WHEN type = 'reversal' THEN -1 ELSE 0 END), 0)::int AS count
               FROM coupon_redemptions WHERE shop_id = $1 AND coupon_id = $2 AND customer_id = $3`,
              [ctx.shopId, couponRow.id, dto.customerId]
            )
          ).rows[0].count;

          if (uses >= Number(couponRow.max_redemptions_per_customer)) {
            throw badRequest(
              `Customer has already redeemed coupon "${cleanCode}" the maximum allowed times (${couponRow.max_redemptions_per_customer}).`
            );
          }
        }

        if (subtotal < Number(couponRow.min_order_paise)) {
          throw badRequest(
            `Minimum order amount of Rs ${(Number(couponRow.min_order_paise) / 100).toFixed(0)} required to use coupon "${cleanCode}".`
          );
        }

        let basePaise = subtotal;
        if (couponRow.applicable_to === 'services') basePaise = serviceSubtotal;
        else if (couponRow.applicable_to === 'products') basePaise = productSubtotal;

        if (basePaise <= 0) {
          throw badRequest(`Coupon "${cleanCode}" is only applicable to ${couponRow.applicable_to}.`);
        }

        if (couponRow.discount_type === 'flat') {
          couponDiscountPaise = Math.min(basePaise, Number(couponRow.discount_value));
        } else {
          const raw = Math.round((basePaise * Number(couponRow.discount_value)) / 100);
          couponDiscountPaise = couponRow.max_discount_paise
            ? Math.min(raw, Number(couponRow.max_discount_paise))
            : raw;
          couponDiscountPaise = Math.min(basePaise, couponDiscountPaise);
        }

        couponId = couponRow.id;
        discount += couponDiscountPaise;
      }

      const tipPaise = Number(dto.tipPaise || 0);
      const finalTotal = Math.max(0, subtotal - discount) + tipPaise;

      // 2. Generate unique invoice number: INV-YEAR-NUMBER
      const seqVal = (await c.query(`SELECT nextval('invoice_number_seq') AS num`)).rows[0].num;
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(seqVal).padStart(4, '0')}`;

      // 3. Create invoice record
      const initialStatus = finalTotal === 0 ? 'paid' : 'pending';
      const invRes = await c.query(
        `INSERT INTO invoices (
           shop_id, invoice_number, appointment_id, customer_id, worker_id,
           subtotal_paise, discount_paise, coupon_id, coupon_discount_paise, tip_paise, final_total_paise, payment_status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          ctx.shopId,
          invoiceNumber,
          dto.appointmentId ?? null,
          dto.customerId ?? null,
          dto.workerId ?? null,
          subtotal,
          discount,
          couponId,
          couponDiscountPaise,
          tipPaise,
          finalTotal,
          initialStatus,
        ]
      );
      const invoiceId = invRes.rows[0].id;

      // Record coupon redemption
      if (couponId && couponDiscountPaise > 0) {
        await c.query(
          `INSERT INTO coupon_redemptions (shop_id, coupon_id, invoice_id, customer_id, type, discount_paise)
           VALUES ($1, $2, $3, $4, 'redemption', $5)`,
          [ctx.shopId, couponId, invoiceId, dto.customerId ?? null, couponDiscountPaise]
        );

        await c.query(
          `UPDATE coupons SET times_redeemed = times_redeemed + 1, updated_at = now()
           WHERE id = $1 AND shop_id = $2`,
          [couponId, ctx.shopId]
        );
      }

      // Deduct loyalty points and log ledger
      if (pointsToRedeem > 0 && customerRow) {
        const remainingPoints = Number(customerRow.loyalty_points) - pointsToRedeem;
        await c.query(`UPDATE customers SET loyalty_points = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`, [
          remainingPoints,
          dto.customerId,
          ctx.shopId,
        ]);

        await c.query(
          `INSERT INTO customer_loyalty_ledger (shop_id, customer_id, points_delta, balance_after, type, invoice_id, notes, created_by)
           VALUES ($1, $2, $3, $4, 'redeem_invoice', $5, $6, $7)`,
          [
            ctx.shopId,
            dto.customerId,
            -pointsToRedeem,
            remainingPoints,
            invoiceId,
            `Redeemed ${pointsToRedeem} points for Rs ${pointsDiscountPaise / 100} discount`,
            ctx.userId,
          ]
        );
      }

      // Handle Customer Membership Included Service Usage
      if (dto.customerMembershipId && dto.customerId) {
        for (const it of dto.items) {
          if (it.type === 'service' && it.itemId && it.unitPricePaise === 0) {
            // Check if this was a 0-paise redeemed service under membership
            await c.query(
              `INSERT INTO customer_membership_service_usages (shop_id, customer_membership_id, service_id, appointment_id, invoice_id)
               VALUES ($1, $2, $3, $4, $5)`,
              [ctx.shopId, dto.customerMembershipId, it.itemId, dto.appointmentId ?? null, invoiceId]
            );
          }
        }
      }

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

        // Award Loyalty Points if customer exists and invoice has positive paid amount
        if (inv.customer_id && Number(inv.final_total_paise) > 0) {
          const settings = (await c.query(`SELECT * FROM loyalty_settings WHERE shop_id = $1`, [ctx.shopId])).rows[0] || {
            is_enabled: true,
            earn_per_rupee_paise: 10000,
          };

          if (settings.is_enabled) {
            // Check active membership multiplier
            const activeMem = (
              await c.query(
                `SELECT p.points_multiplier
                 FROM customer_memberships cm
                 JOIN membership_plans p ON p.id = cm.plan_id
                 WHERE cm.shop_id = $1 AND cm.customer_id = $2 AND cm.status = 'active'
                   AND CURRENT_DATE BETWEEN cm.start_date AND cm.end_date
                 LIMIT 1`,
                [ctx.shopId, inv.customer_id]
              )
            ).rows[0];

            const multiplier = activeMem ? Number(activeMem.points_multiplier) : 1.0;
            const earnRate = Number(settings.earn_per_rupee_paise) || 10000;
            const pointsToAward = Math.floor((Number(inv.final_total_paise) / earnRate) * multiplier);

            if (pointsToAward > 0) {
              const custRow = (
                await c.query(
                  `UPDATE customers
                   SET loyalty_points = loyalty_points + $1, updated_at = now()
                   WHERE id = $2 AND shop_id = $3
                   RETURNING loyalty_points`,
                  [pointsToAward, inv.customer_id, ctx.shopId]
                )
              ).rows[0];

              await c.query(
                `INSERT INTO customer_loyalty_ledger (shop_id, customer_id, points_delta, balance_after, type, invoice_id, notes, created_by)
                 VALUES ($1, $2, $3, $4, 'earn_invoice', $5, $6, $7)`,
                [
                  ctx.shopId,
                  inv.customer_id,
                  pointsToAward,
                  custRow.loyalty_points,
                  invoiceId,
                  `Earned ${pointsToAward} points from Invoice ${inv.invoice_number}`,
                  ctx.userId,
                ]
              );
            }
          }
        }

        // Award Worker Commission & Tip if worker is assigned
        if (inv.worker_id) {
          const worker = (
            await c.query(
              `SELECT id, display_name, commission_rate_percent, product_commission_rate_percent FROM workers WHERE id = $1 AND shop_id = $2`,
              [inv.worker_id, ctx.shopId]
            )
          ).rows[0];

          if (worker) {
            const items = (
              await c.query(
                `SELECT type, item_name, quantity, total_paise FROM invoice_items WHERE invoice_id = $1 AND shop_id = $2`,
                [invoiceId, ctx.shopId]
              )
            ).rows;

            // Service Commission
            const sTotal = items
              .filter((i: any) => i.type === 'service')
              .reduce((acc: number, i: any) => acc + Number(i.total_paise), 0);
            const sRate = Number(worker.commission_rate_percent || 0);
            const sComm = sRate > 0 ? Math.floor(sTotal * (sRate / 100)) : 0;
            if (sComm > 0) {
              await c.query(
                `INSERT INTO worker_commission_ledger (shop_id, worker_id, invoice_id, type, amount_paise, commission_rate_percent, base_amount_paise, notes, created_by)
                 VALUES ($1, $2, $3, 'service_commission', $4, $5, $6, $7, $8)`,
                [
                  ctx.shopId,
                  inv.worker_id,
                  invoiceId,
                  sComm,
                  sRate,
                  sTotal,
                  `${sRate}% commission on service total Rs ${sTotal / 100} (Invoice ${inv.invoice_number})`,
                  ctx.userId,
                ]
              );
            }

            // Product Commission
            const pTotal = items
              .filter((i: any) => i.type === 'product')
              .reduce((acc: number, i: any) => acc + Number(i.total_paise), 0);
            const pRate = Number(worker.product_commission_rate_percent || 0);
            const pComm = pRate > 0 ? Math.floor(pTotal * (pRate / 100)) : 0;
            if (pComm > 0) {
              await c.query(
                `INSERT INTO worker_commission_ledger (shop_id, worker_id, invoice_id, type, amount_paise, commission_rate_percent, base_amount_paise, notes, created_by)
                 VALUES ($1, $2, $3, 'product_commission', $4, $5, $6, $7, $8)`,
                [
                  ctx.shopId,
                  inv.worker_id,
                  invoiceId,
                  pComm,
                  pRate,
                  pTotal,
                  `${pRate}% commission on product sales Rs ${pTotal / 100} (Invoice ${inv.invoice_number})`,
                  ctx.userId,
                ]
              );
            }

            // Tip
            const tipPaise = Number(inv.tip_paise || 0);
            if (tipPaise > 0) {
              await c.query(
                `INSERT INTO worker_commission_ledger (shop_id, worker_id, invoice_id, type, amount_paise, notes, created_by)
                 VALUES ($1, $2, $3, 'tip', $4, $5, $6)`,
                [
                  ctx.shopId,
                  inv.worker_id,
                  invoiceId,
                  tipPaise,
                  `Tip of Rs ${tipPaise / 100} from Invoice ${inv.invoice_number}`,
                  ctx.userId,
                ]
              );
            }
          }
        }
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

      // Re-credit any redeemed loyalty points, and revoke any earned loyalty points
      if (inv.customer_id) {
        const txs = (
          await c.query(
            `SELECT points_delta, type FROM customer_loyalty_ledger WHERE invoice_id = $1 AND shop_id = $2`,
            [invoiceId, ctx.shopId]
          )
        ).rows;

        for (const t of txs) {
          const delta = Number(t.points_delta);
          if (t.type === 'redeem_invoice' && delta < 0) {
            // Refund redeemed points
            const refund = Math.abs(delta);
            const custRow = (
              await c.query(
                `UPDATE customers SET loyalty_points = loyalty_points + $1, updated_at = now() WHERE id = $2 AND shop_id = $3 RETURNING loyalty_points`,
                [refund, inv.customer_id, ctx.shopId]
              )
            ).rows[0];
            await c.query(
              `INSERT INTO customer_loyalty_ledger (shop_id, customer_id, points_delta, balance_after, type, invoice_id, notes, created_by)
               VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7)`,
              [ctx.shopId, inv.customer_id, refund, custRow.loyalty_points, invoiceId, `Refunded ${refund} points for voided invoice ${inv.invoice_number}`, ctx.userId]
            );
          } else if (t.type === 'earn_invoice' && delta > 0) {
            // Revoke earned points
            const custRow = (
              await c.query(
                `UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - $1), updated_at = now() WHERE id = $2 AND shop_id = $3 RETURNING loyalty_points`,
                [delta, inv.customer_id, ctx.shopId]
              )
            ).rows[0];
            await c.query(
              `INSERT INTO customer_loyalty_ledger (shop_id, customer_id, points_delta, balance_after, type, invoice_id, notes, created_by)
               VALUES ($1, $2, $3, $4, 'reversal', $5, $6, $7)`,
              [ctx.shopId, inv.customer_id, -delta, custRow.loyalty_points, invoiceId, `Revoked ${delta} points for voided invoice ${inv.invoice_number}`, ctx.userId]
            );
          }
        }
      }

      // Revert any earned commissions and tips
      const commTxs = (
        await c.query(
          `SELECT worker_id, amount_paise, type FROM worker_commission_ledger WHERE invoice_id = $1 AND shop_id = $2`,
          [invoiceId, ctx.shopId]
        )
      ).rows;

      for (const ct of commTxs) {
        const amt = Number(ct.amount_paise);
        if (amt > 0) {
          await c.query(
            `INSERT INTO worker_commission_ledger (shop_id, worker_id, invoice_id, type, amount_paise, notes, created_by)
             VALUES ($1, $2, $3, 'reversal', $4, $5, $6)`,
            [ctx.shopId, ct.worker_id, invoiceId, -amt, `Reversal of ${ct.type} for voided invoice ${inv.invoice_number}`, ctx.userId]
          );
        }
      }

      // Revert coupon redemptions if any
      if (inv.coupon_id) {
        await c.query(
          `INSERT INTO coupon_redemptions (shop_id, coupon_id, invoice_id, customer_id, type, discount_paise)
           VALUES ($1, $2, $3, $4, 'reversal', $5)`,
          [ctx.shopId, inv.coupon_id, invoiceId, inv.customer_id, -Number(inv.coupon_discount_paise || 0)]
        );

        await c.query(
          `UPDATE coupons SET times_redeemed = GREATEST(0, times_redeemed - 1), updated_at = now()
           WHERE id = $1 AND shop_id = $2`,
          [inv.coupon_id, ctx.shopId]
        );
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
              inv.coupon_id, inv.coupon_discount_paise, inv.tip_paise,
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
      couponId: row.coupon_id ?? null,
      couponDiscountPaise: Number(row.coupon_discount_paise || 0),
      tipPaise: Number(row.tip_paise || 0),
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
