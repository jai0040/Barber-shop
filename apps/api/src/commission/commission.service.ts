import { Injectable } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext, Effective } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes } from '@barbershop/shared';
import {
  WorkerCommissionEntry,
  WorkerEarningsSummary,
  WorkerPayout,
} from '@barbershop/shared';

const notFound = (m = 'Worker or record not found.') =>
  new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) =>
  new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

@Injectable()
export class CommissionService {
  constructor(private db: Db, private audit: AuditService) {}

  async getCommissionSummary(
    ctx: AuthContext,
    actor?: Effective,
    q?: { startDate?: string; endDate?: string }
  ): Promise<WorkerEarningsSummary[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Check worker ownership if scoped to 'own'
      const permScope = actor?.map.get('commission.view');
      let ownWorkerId: string | null = null;
      if (permScope === 'own' && !actor?.isOwner) {
        const wRow = (
          await c.query(
            `SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`,
            [ctx.userId, ctx.shopId]
          )
        ).rows[0];
        if (!wRow) return [];
        ownWorkerId = wRow.id;
      }

      // Query workers
      const workerQuery = ownWorkerId
        ? `SELECT id, display_name, commission_rate_percent, product_commission_rate_percent FROM workers WHERE id = $1 AND shop_id = $2`
        : `SELECT id, display_name, commission_rate_percent, product_commission_rate_percent FROM workers WHERE shop_id = $1 AND is_active = true ORDER BY display_name ASC`;
      const workerParams = ownWorkerId ? [ownWorkerId, ctx.shopId] : [ctx.shopId];
      const workers = (await c.query(workerQuery, workerParams)).rows;

      const dateFilter =
        q?.startDate && q?.endDate
          ? `AND created_at >= '${q.startDate} 00:00:00+00'::timestamptz AND created_at <= '${q.endDate} 23:59:59+00'::timestamptz`
          : '';

      const results: WorkerEarningsSummary[] = [];

      for (const w of workers) {
        // Filtered earnings for specific date range (if provided)
        const earnedRows = (
          await c.query(
            `SELECT
               COALESCE(SUM(CASE WHEN type = 'service_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS service_commission,
               COALESCE(SUM(CASE WHEN type = 'product_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS product_commission,
               COALESCE(SUM(CASE WHEN type = 'tip' THEN amount_paise ELSE 0 END), 0)::bigint AS tips,
               COALESCE(SUM(CASE WHEN type = 'manual_adjustment' AND amount_paise > 0 THEN amount_paise ELSE 0 END), 0)::bigint AS bonuses
             FROM worker_commission_ledger
             WHERE shop_id = $1 AND worker_id = $2 ${dateFilter}`,
            [ctx.shopId, w.id]
          )
        ).rows[0];

        // All-time totals to calculate real current pending balance
        const allTimeTotals = (
          await c.query(
            `SELECT
               COALESCE(SUM(CASE WHEN type != 'payout' THEN amount_paise ELSE 0 END), 0)::bigint AS all_time_earned,
               COALESCE(SUM(CASE WHEN type = 'payout' THEN ABS(amount_paise) ELSE 0 END), 0)::bigint AS all_time_paid_out,
               COALESCE(SUM(amount_paise), 0)::bigint AS balance_pending
             FROM worker_commission_ledger
             WHERE shop_id = $1 AND worker_id = $2`,
            [ctx.shopId, w.id]
          )
        ).rows[0];

        const serviceComm = Number(earnedRows.service_commission);
        const prodComm = Number(earnedRows.product_commission);
        const tips = Number(earnedRows.tips);
        const bonuses = Number(earnedRows.bonuses);
        const totalEarned = Number(allTimeTotals.all_time_earned);

        const allTimePaidOut = Number(allTimeTotals.all_time_paid_out);
        const balancePending = Number(allTimeTotals.balance_pending);

        results.push({
          workerId: w.id,
          workerName: w.display_name,
          commissionRatePercent: Number(w.commission_rate_percent || 0),
          productCommissionRatePercent: Number(w.product_commission_rate_percent || 0),
          totalServiceCommissionPaise: serviceComm,
          totalProductCommissionPaise: prodComm,
          totalTipsPaise: tips,
          totalBonusesPaise: bonuses,
          totalEarnedPaise: totalEarned,
          totalPaidOutPaise: allTimePaidOut,
          balancePendingPaise: balancePending,
        });
      }

      return results;
    });
  }

  async getWorkerHistory(
    ctx: AuthContext,
    actor: Effective | undefined,
    workerId: string,
    q?: { startDate?: string; endDate?: string; limit?: number }
  ) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Enforce own scope if worker
      const permScope = actor?.map.get('commission.view');
      if (permScope === 'own' && !actor?.isOwner) {
        const wRow = (
          await c.query(
            `SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`,
            [ctx.userId, ctx.shopId]
          )
        ).rows[0];
        if (!wRow || wRow.id !== workerId) {
          throw notFound('Worker not found');
        }
      }

      const worker = (
        await c.query(
          `SELECT id, display_name, commission_rate_percent, product_commission_rate_percent
           FROM workers
           WHERE id = $1 AND shop_id = $2`,
          [workerId, ctx.shopId]
        )
      ).rows[0];

      if (!worker) throw notFound('Worker not found');

      const limit = Math.min(100, Math.max(1, q?.limit || 50));

      const ledgerEntriesRaw = (
        await c.query(
          `SELECT l.id, l.shop_id, l.worker_id, l.invoice_id, l.type, l.amount_paise,
                  l.commission_rate_percent, l.base_amount_paise, l.notes, l.created_at,
                  inv.invoice_number,
                  u.name AS created_by_name
           FROM worker_commission_ledger l
           LEFT JOIN invoices inv ON inv.id = l.invoice_id
           LEFT JOIN users u ON u.id = l.created_by
           WHERE l.shop_id = $1 AND l.worker_id = $2
           ORDER BY l.created_at DESC
           LIMIT $3`,
          [ctx.shopId, workerId, limit]
        )
      ).rows;

      const ledgerEntries: WorkerCommissionEntry[] = ledgerEntriesRaw.map((r: any) => ({
        id: r.id,
        shopId: r.shop_id,
        workerId: r.worker_id,
        workerName: worker.display_name,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        type: r.type,
        amountPaise: Number(r.amount_paise),
        commissionRatePercent: r.commission_rate_percent ? Number(r.commission_rate_percent) : null,
        baseAmountPaise: r.base_amount_paise ? Number(r.base_amount_paise) : null,
        notes: r.notes,
        createdByName: r.created_by_name,
        createdAt: r.created_at.toISOString(),
      }));

      const payoutsRaw = (
        await c.query(
          `SELECT p.id, p.shop_id, p.worker_id, p.amount_paise, p.payment_method,
                  p.period_start_date, p.period_end_date, p.notes, p.expense_id, p.created_at,
                  u.name AS created_by_name
           FROM worker_payouts p
           LEFT JOIN users u ON u.id = p.created_by
           WHERE p.shop_id = $1 AND p.worker_id = $2
           ORDER BY p.created_at DESC
           LIMIT $3`,
          [ctx.shopId, workerId, limit]
        )
      ).rows;

      const payouts: WorkerPayout[] = payoutsRaw.map((p: any) => ({
        id: p.id,
        shopId: p.shop_id,
        workerId: p.worker_id,
        workerName: worker.display_name,
        amountPaise: Number(p.amount_paise),
        paymentMethod: p.payment_method,
        periodStartDate: p.period_start_date ? p.period_start_date.toISOString().slice(0, 10) : null,
        periodEndDate: p.period_end_date ? p.period_end_date.toISOString().slice(0, 10) : null,
        notes: p.notes,
        expenseId: p.expense_id,
        createdByName: p.created_by_name,
        createdAt: p.created_at.toISOString(),
      }));

      // Balance
      const totals = (
        await c.query(
          `SELECT
             COALESCE(SUM(CASE WHEN type = 'service_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS service_commission,
             COALESCE(SUM(CASE WHEN type = 'product_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS product_commission,
             COALESCE(SUM(CASE WHEN type = 'tip' THEN amount_paise ELSE 0 END), 0)::bigint AS tips,
             COALESCE(SUM(CASE WHEN type = 'manual_adjustment' AND amount_paise > 0 THEN amount_paise ELSE 0 END), 0)::bigint AS bonuses,
             COALESCE(SUM(CASE WHEN type != 'payout' THEN amount_paise ELSE 0 END), 0)::bigint AS total_earned,
             COALESCE(SUM(CASE WHEN type = 'payout' THEN ABS(amount_paise) ELSE 0 END), 0)::bigint AS total_paid_out,
             COALESCE(SUM(amount_paise), 0)::bigint AS balance_pending
           FROM worker_commission_ledger
           WHERE shop_id = $1 AND worker_id = $2`,
          [ctx.shopId, workerId]
        )
      ).rows[0];

      const totalEarned = Number(totals.total_earned);
      const totalPaidOut = Number(totals.total_paid_out);
      const balancePending = Number(totals.balance_pending);

      const summary: WorkerEarningsSummary = {
        workerId: worker.id,
        workerName: worker.display_name,
        commissionRatePercent: Number(worker.commission_rate_percent || 0),
        productCommissionRatePercent: Number(worker.product_commission_rate_percent || 0),
        totalServiceCommissionPaise: Number(totals.service_commission),
        totalProductCommissionPaise: Number(totals.product_commission),
        totalTipsPaise: Number(totals.tips),
        totalBonusesPaise: Number(totals.bonuses),
        totalEarnedPaise: totalEarned,
        totalPaidOutPaise: totalPaidOut,
        balancePendingPaise: balancePending,
        recentEntries: ledgerEntries.slice(0, 10),
      };

      return {
        worker: {
          id: worker.id,
          displayName: worker.display_name,
          commissionRatePercent: Number(worker.commission_rate_percent || 0),
          productCommissionRatePercent: Number(worker.product_commission_rate_percent || 0),
        },
        summary,
        ledgerEntries,
        payouts,
      };
    });
  }

  async recordPayout(
    ctx: AuthContext,
    dto: {
      workerId: string;
      amountPaise: number;
      paymentMethod: 'cash' | 'bank_transfer' | 'upi';
      periodStartDate?: string;
      periodEndDate?: string;
      notes?: string;
      recordExpense?: boolean;
    }
  ): Promise<WorkerPayout> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = (
        await c.query(
          `SELECT id, display_name FROM workers WHERE id = $1 AND shop_id = $2`,
          [dto.workerId, ctx.shopId]
        )
      ).rows[0];

      if (!worker) throw notFound('Worker not found');

      let expenseId: string | null = null;
      if (dto.recordExpense !== false) {
        // Find or create 'Salaries & Commissions' expense category
        let cat = (
          await c.query(
            `SELECT id FROM expense_categories WHERE shop_id = $1 AND name ILIKE 'Salaries & Commissions'`,
            [ctx.shopId]
          )
        ).rows[0];

        if (!cat) {
          cat = (
            await c.query(
              `INSERT INTO expense_categories (shop_id, name)
               VALUES ($1, 'Salaries & Commissions')
               ON CONFLICT (shop_id, name) DO UPDATE SET name = EXCLUDED.name
               RETURNING id`,
              [ctx.shopId]
            )
          ).rows[0];
        }

        const expMethod = dto.paymentMethod === 'bank_transfer' ? 'bank_transfer' : dto.paymentMethod === 'upi' ? 'online' : 'cash';
        const expDesc = `Commission Payout to ${worker.display_name}${dto.notes ? ` - ${dto.notes}` : ''}`;
        const expRes = await c.query(
          `INSERT INTO expenses (shop_id, category_id, amount_paise, date, description, payment_method, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
           RETURNING id`,
          [ctx.shopId, cat.id, dto.amountPaise, expDesc, expMethod, ctx.userId]
        );
        expenseId = expRes.rows[0].id;
      }

      // Insert worker payout record
      const pRes = await c.query(
        `INSERT INTO worker_payouts (shop_id, worker_id, amount_paise, payment_method, period_start_date, period_end_date, notes, expense_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [
          ctx.shopId,
          dto.workerId,
          dto.amountPaise,
          dto.paymentMethod,
          dto.periodStartDate ?? null,
          dto.periodEndDate ?? null,
          dto.notes ?? null,
          expenseId,
          ctx.userId,
        ]
      );
      const payoutId = pRes.rows[0].id;
      const createdAt = pRes.rows[0].created_at;

      // Append negative entry into worker_commission_ledger
      await c.query(
        `INSERT INTO worker_commission_ledger (shop_id, worker_id, type, amount_paise, notes, created_by)
         VALUES ($1, $2, 'payout', $3, $4, $5)`,
        [
          ctx.shopId,
          dto.workerId,
          -dto.amountPaise,
          dto.notes || `Payout settled via ${dto.paymentMethod.replace('_', ' ')}`,
          ctx.userId,
        ]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'worker.payout',
        entity: 'worker_payout',
        entityId: payoutId,
        newValues: {
          workerId: dto.workerId,
          workerName: worker.display_name,
          amountPaise: dto.amountPaise,
          paymentMethod: dto.paymentMethod,
        },
        ip: ctx.ip,
      });

      return {
        id: payoutId,
        shopId: ctx.shopId!,
        workerId: dto.workerId,
        workerName: worker.display_name,
        amountPaise: dto.amountPaise,
        paymentMethod: dto.paymentMethod,
        periodStartDate: dto.periodStartDate || null,
        periodEndDate: dto.periodEndDate || null,
        notes: dto.notes || null,
        expenseId,
        createdAt: createdAt.toISOString(),
      };
    });
  }

  async adjustCommission(
    ctx: AuthContext,
    dto: {
      workerId: string;
      amountPaise: number;
      type?: 'manual_adjustment' | 'tip';
      notes: string;
    }
  ): Promise<WorkerCommissionEntry> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = (
        await c.query(
          `SELECT id, display_name FROM workers WHERE id = $1 AND shop_id = $2`,
          [dto.workerId, ctx.shopId]
        )
      ).rows[0];

      if (!worker) throw notFound('Worker not found');

      const entryType = dto.type || 'manual_adjustment';

      const res = await c.query(
        `INSERT INTO worker_commission_ledger (shop_id, worker_id, type, amount_paise, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [ctx.shopId, dto.workerId, entryType, dto.amountPaise, dto.notes, ctx.userId]
      );
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'commission.adjust',
        entity: 'worker_commission_ledger',
        entityId: row.id,
        newValues: {
          workerId: dto.workerId,
          amountPaise: dto.amountPaise,
          type: entryType,
          notes: dto.notes,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: ctx.shopId!,
        workerId: dto.workerId,
        workerName: worker.display_name,
        type: entryType,
        amountPaise: dto.amountPaise,
        notes: dto.notes,
        createdAt: row.created_at.toISOString(),
      };
    });
  }
}
