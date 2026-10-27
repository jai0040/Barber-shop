import { Injectable } from '@nestjs/common';
import { ErrorCodes, ExpenseCategory, ExpenseItem, FinanceSummary, Paginated } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Expense not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);

const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salary',
  'Product purchase',
  'Maintenance',
  'Marketing',
  'Other',
];

@Injectable()
export class FinanceService {
  constructor(private db: Db, private audit: AuditService) {}

  // ==================== CATEGORIES ====================

  async listCategories(ctx: AuthContext): Promise<ExpenseCategory[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Ensure default categories exist
      for (const catName of DEFAULT_EXPENSE_CATEGORIES) {
        await c.query(`INSERT INTO expense_categories (shop_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          ctx.shopId,
          catName,
        ]);
      }

      const rows = (await c.query(
        `SELECT id, name FROM expense_categories WHERE shop_id = $1 ORDER BY name ASC`,
        [ctx.shopId]
      )).rows;

      return rows.map((r) => ({ id: r.id, name: r.name }));
    });
  }

  // ==================== EXPENSES ====================

  async listExpenses(
    ctx: AuthContext,
    q: { categoryId?: string; startDate?: string; endDate?: string; page: number; limit: number }
  ): Promise<Paginated<ExpenseItem>> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const conditions = ['e.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (q.categoryId) {
        params.push(q.categoryId);
        conditions.push(`e.category_id = $${params.length}`);
      }
      if (q.startDate) {
        params.push(q.startDate);
        conditions.push(`e.date >= $${params.length}::date`);
      }
      if (q.endDate) {
        params.push(q.endDate);
        conditions.push(`e.date <= $${params.length}::date`);
      }

      const whereClause = conditions.join(' AND ');
      const total = Number((await c.query(`SELECT count(*)::int n FROM expenses e WHERE ${whereClause}`, params)).rows[0].n);

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit);
      params.push(offset);

      const rows = (await c.query(
        `SELECT e.id, e.category_id, ec.name AS category_name, e.amount_paise,
                e.date::text AS date, e.description, e.payment_method, e.inventory_transaction_id,
                u.name AS created_by_name, e.created_at
         FROM expenses e
         JOIN expense_categories ec ON ec.id = e.category_id
         LEFT JOIN users u ON u.id = e.created_by
         WHERE ${whereClause}
         ORDER BY e.date DESC, e.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )).rows;

      return {
        items: rows.map((r) => ({
          id: r.id,
          categoryId: r.category_id,
          categoryName: r.category_name,
          amountPaise: Number(r.amount_paise),
          date: r.date,
          description: r.description,
          paymentMethod: r.payment_method,
          inventoryTransactionId: r.inventory_transaction_id,
          createdByName: r.created_by_name,
          createdAt: r.created_at.toISOString(),
        })),
        page: q.page,
        limit: q.limit,
        total,
      };
    });
  }

  async createExpense(
    ctx: AuthContext,
    dto: { categoryId: string; amountPaise: number; date?: string; description: string; paymentMethod?: 'cash' | 'online' | 'bank_transfer' }
  ): Promise<ExpenseItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cat = (await c.query(`SELECT id, name FROM expense_categories WHERE id = $1 AND shop_id = $2`, [dto.categoryId, ctx.shopId])).rows[0];
      if (!cat) throw notFound('Expense category not found.');

      const dateStr = dto.date ?? new Date().toISOString().slice(0, 10);
      const res = await c.query(
        `INSERT INTO expenses (shop_id, category_id, amount_paise, date, description, payment_method, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7)
         RETURNING *`,
        [ctx.shopId, dto.categoryId, dto.amountPaise, dateStr, dto.description, dto.paymentMethod ?? 'cash', ctx.userId]
      );
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'expense.create',
        entity: 'expense',
        entityId: row.id,
        newValues: { category: cat.name, amountPaise: dto.amountPaise, description: dto.description },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        categoryId: row.category_id,
        categoryName: cat.name,
        amountPaise: Number(row.amount_paise),
        date: dateStr,
        description: row.description,
        paymentMethod: row.payment_method,
        inventoryTransactionId: null,
        createdByName: null,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  async deleteExpense(ctx: AuthContext, id: string): Promise<{ deleted: boolean }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT id, amount_paise, description FROM expenses WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound();

      await c.query(`DELETE FROM expenses WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'expense.delete',
        entity: 'expense',
        entityId: id,
        oldValues: { amountPaise: old.amount_paise, description: old.description },
        ip: ctx.ip,
      });

      return { deleted: true };
    });
  }

  // ==================== NET RESULT & FINANCE SUMMARY ====================

  async getSummary(ctx: AuthContext, q?: { startDate?: string; endDate?: string }): Promise<FinanceSummary> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const start = q?.startDate ?? todayStr;
      const end = q?.endDate ?? todayStr;

      // 1. Paid revenue from invoices
      const revRes = await c.query(
        `SELECT
           COALESCE(sum(CASE WHEN ii.type = 'service' THEN ii.total_paise ELSE 0 END), 0) AS service_rev,
           COALESCE(sum(CASE WHEN ii.type = 'product' THEN ii.total_paise ELSE 0 END), 0) AS product_rev
         FROM invoice_items ii
         JOIN invoices inv ON inv.id = ii.invoice_id
         WHERE inv.shop_id = $1
           AND inv.payment_status = 'paid'
           AND inv.created_at >= $2::date
           AND inv.created_at < ($3::date + interval '1 day')`,
        [ctx.shopId, start, end]
      );

      const totRes = await c.query(
        `SELECT COALESCE(sum(final_total_paise), 0) AS total_rev
         FROM invoices
         WHERE shop_id = $1
           AND payment_status = 'paid'
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')`,
        [ctx.shopId, start, end]
      );

      const serviceRevenuePaise = Number(revRes.rows[0].service_rev);
      const productRevenuePaise = Number(revRes.rows[0].product_rev);
      const totalRevenuePaise = Number(totRes.rows[0].total_rev);

      // 2. Expenses in date range
      const expRes = await c.query(
        `SELECT COALESCE(sum(amount_paise), 0) AS total_exp
         FROM expenses
         WHERE shop_id = $1
           AND date >= $2::date
           AND date <= $3::date`,
        [ctx.shopId, start, end]
      );
      const totalExpensesPaise = Number(expRes.rows[0].total_exp);
      const netResultPaise = totalRevenuePaise - totalExpensesPaise;

      return {
        startDate: start,
        endDate: end,
        totalRevenuePaise,
        serviceRevenuePaise,
        productRevenuePaise,
        totalExpensesPaise,
        netResultPaise,
      };
    });
  }
}
