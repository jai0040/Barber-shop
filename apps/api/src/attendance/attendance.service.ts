import { Injectable } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext, Effective } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes } from '@barbershop/shared';
import {
  WorkerAttendanceItem,
  WorkerSalaryAdvanceItem,
  WorkerSalarySettlementItem,
} from '@barbershop/shared';

const notFound = (m = 'Worker or record not found.') =>
  new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) =>
  new AppException(400, ErrorCodes.VALIDATION_FAILED, m);
const forbidden = (m = 'Access denied.') =>
  new AppException(403, ErrorCodes.FORBIDDEN, m);

const toDateStr = (d: any): string => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

@Injectable()
export class AttendanceService {
  constructor(private db: Db, private audit: AuditService) {}

  private async resolveWorkerId(
    c: any,
    ctx: AuthContext,
    actor: Effective | undefined,
    explicitWorkerId?: string,
    permKey = 'attendance.view'
  ): Promise<{ id: string; displayName: string }> {
    const permScope = actor?.map.get(permKey);

    if (explicitWorkerId) {
      if (permScope === 'own' && !actor?.isOwner) {
        const ownRow = (
          await c.query(
            `SELECT id, display_name FROM workers WHERE user_id = $1 AND shop_id = $2`,
            [ctx.userId, ctx.shopId]
          )
        ).rows[0];
        if (!ownRow || ownRow.id !== explicitWorkerId) {
          throw forbidden('You can only access your own worker profile.');
        }
        return ownRow;
      }
      const wRow = (
        await c.query(
          `SELECT id, display_name FROM workers WHERE id = $1 AND shop_id = $2`,
          [explicitWorkerId, ctx.shopId]
        )
      ).rows[0];
      if (!wRow) throw notFound('Worker profile not found.');
      return wRow;
    }

    // Default to own worker profile
    const ownRow = (
      await c.query(
        `SELECT id, display_name FROM workers WHERE user_id = $1 AND shop_id = $2`,
        [ctx.userId, ctx.shopId]
      )
    ).rows[0];
    if (!ownRow) {
      throw badRequest('Staff account is not linked to any active worker profile.');
    }
    return ownRow;
  }

  async getTodayStatus(
    ctx: AuthContext,
    actor: Effective,
    explicitWorkerId?: string
  ): Promise<{
    worker: { id: string; displayName: string; baseSalaryPaise: number };
    todayDate: string;
    attendance: WorkerAttendanceItem | null;
  }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = await this.resolveWorkerId(c, ctx, actor, explicitWorkerId, 'attendance.view');
      const todayDate = (await c.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d;

      const salaryRes = await c.query(
        `SELECT base_salary_paise FROM workers WHERE id = $1 AND shop_id = $2`,
        [worker.id, ctx.shopId]
      );
      const baseSalaryPaise = salaryRes.rows[0]?.base_salary_paise || 0;

      const attRes = await c.query(
        `SELECT id, shop_id, worker_id, attendance_date::text, check_in_at, check_out_at, status, notes, created_at, updated_at
         FROM worker_attendance
         WHERE shop_id = $1 AND worker_id = $2 AND attendance_date = $3::date`,
        [ctx.shopId, worker.id, todayDate]
      );

      let att: WorkerAttendanceItem | null = null;
      if (attRes.rows.length > 0) {
        const row = attRes.rows[0];
        att = {
          id: row.id,
          shopId: row.shop_id,
          workerId: row.worker_id,
          workerName: worker.displayName,
          attendanceDate: row.attendance_date,
          checkInAt: row.check_in_at ? new Date(row.check_in_at).toISOString() : null,
          checkOutAt: row.check_out_at ? new Date(row.check_out_at).toISOString() : null,
          status: row.status,
          notes: row.notes,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
        };
      }

      return {
        worker: {
          id: worker.id,
          displayName: worker.displayName,
          baseSalaryPaise,
        },
        todayDate,
        attendance: att,
      };
    });
  }

  async clockIn(
    ctx: AuthContext,
    actor: Effective,
    dto: { workerId?: string; notes?: string }
  ): Promise<WorkerAttendanceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = await this.resolveWorkerId(c, ctx, actor, dto.workerId, 'attendance.view');
      const todayDate = (await c.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d;

      const existing = (
        await c.query(
          `SELECT id, check_in_at, check_out_at, status FROM worker_attendance
           WHERE shop_id = $1 AND worker_id = $2 AND attendance_date = $3::date`,
          [ctx.shopId, worker.id, todayDate]
        )
      ).rows[0];

      let resRow: any;
      if (existing) {
        if (existing.check_in_at) {
          throw badRequest(`Already clocked in at ${new Date(existing.check_in_at).toLocaleTimeString()}`);
        }
        const updated = await c.query(
          `UPDATE worker_attendance
           SET check_in_at = NOW(), status = 'present', notes = COALESCE($1, notes), updated_at = NOW()
           WHERE id = $2 AND shop_id = $3
           RETURNING *`,
          [dto.notes || null, existing.id, ctx.shopId]
        );
        resRow = updated.rows[0];
      } else {
        const inserted = await c.query(
          `INSERT INTO worker_attendance (shop_id, worker_id, attendance_date, check_in_at, status, notes)
           VALUES ($1, $2, $3::date, NOW(), 'present', $4)
           RETURNING *`,
          [ctx.shopId, worker.id, todayDate, dto.notes || null]
        );
        resRow = inserted.rows[0];
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'worker.clock_in',
        entity: 'worker_attendance',
        entityId: resRow.id,
        newValues: {
          workerId: worker.id,
          workerName: worker.displayName,
          date: todayDate,
          checkInAt: resRow.check_in_at,
        },
        ip: ctx.ip,
      });

      return {
        id: resRow.id,
        shopId: resRow.shop_id,
        workerId: resRow.worker_id,
        workerName: worker.displayName,
        attendanceDate: toDateStr(resRow.attendance_date),
        checkInAt: new Date(resRow.check_in_at).toISOString(),
        checkOutAt: resRow.check_out_at ? new Date(resRow.check_out_at).toISOString() : null,
        status: resRow.status,
        notes: resRow.notes,
        createdAt: new Date(resRow.created_at).toISOString(),
        updatedAt: new Date(resRow.updated_at).toISOString(),
      };
    });
  }

  async clockOut(
    ctx: AuthContext,
    actor: Effective,
    dto: { workerId?: string; notes?: string }
  ): Promise<WorkerAttendanceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = await this.resolveWorkerId(c, ctx, actor, dto.workerId, 'attendance.view');
      const todayDate = (await c.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d;

      const existing = (
        await c.query(
          `SELECT id, check_in_at, check_out_at, status FROM worker_attendance
           WHERE shop_id = $1 AND worker_id = $2 AND attendance_date = $3::date`,
          [ctx.shopId, worker.id, todayDate]
        )
      ).rows[0];

      let resRow: any;
      if (!existing) {
        // Clock out without prior clock-in
        const inserted = await c.query(
          `INSERT INTO worker_attendance (shop_id, worker_id, attendance_date, check_in_at, check_out_at, status, notes)
           VALUES ($1, $2, $3::date, NOW(), NOW(), 'present', $4)
           RETURNING *`,
          [ctx.shopId, worker.id, todayDate, dto.notes || null]
        );
        resRow = inserted.rows[0];
      } else {
        const updated = await c.query(
          `UPDATE worker_attendance
           SET check_out_at = NOW(), notes = CASE WHEN $1::text IS NOT NULL THEN COALESCE(notes || ' | ', '') || $1::text ELSE notes END, updated_at = NOW()
           WHERE id = $2 AND shop_id = $3
           RETURNING *`,
          [dto.notes || null, existing.id, ctx.shopId]
        );
        resRow = updated.rows[0];
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'worker.clock_out',
        entity: 'worker_attendance',
        entityId: resRow.id,
        newValues: {
          workerId: worker.id,
          workerName: worker.displayName,
          date: todayDate,
          checkOutAt: resRow.check_out_at,
        },
        ip: ctx.ip,
      });

      return {
        id: resRow.id,
        shopId: resRow.shop_id,
        workerId: resRow.worker_id,
        workerName: worker.displayName,
        attendanceDate: toDateStr(resRow.attendance_date),
        checkInAt: resRow.check_in_at ? new Date(resRow.check_in_at).toISOString() : null,
        checkOutAt: new Date(resRow.check_out_at).toISOString(),
        status: resRow.status,
        notes: resRow.notes,
        createdAt: new Date(resRow.created_at).toISOString(),
        updatedAt: new Date(resRow.updated_at).toISOString(),
      };
    });
  }

  async listAttendance(
    ctx: AuthContext,
    actor: Effective,
    q: { workerId?: string; startDate?: string; endDate?: string; status?: string }
  ): Promise<WorkerAttendanceItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const permScope = actor?.map.get('attendance.view');
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

      const targetWorkerId = ownWorkerId || q.workerId || null;

      const params: any[] = [ctx.shopId];
      let sql = `
        SELECT a.id, a.shop_id, a.worker_id, w.display_name AS worker_name,
               a.attendance_date::text, a.check_in_at, a.check_out_at, a.status,
               a.notes, a.created_at, a.updated_at
        FROM worker_attendance a
        JOIN workers w ON a.worker_id = w.id AND a.shop_id = w.shop_id
        WHERE a.shop_id = $1
      `;

      if (targetWorkerId) {
        params.push(targetWorkerId);
        sql += ` AND a.worker_id = $${params.length}`;
      }

      if (q.startDate) {
        params.push(q.startDate);
        sql += ` AND a.attendance_date >= $${params.length}::date`;
      }

      if (q.endDate) {
        params.push(q.endDate);
        sql += ` AND a.attendance_date <= $${params.length}::date`;
      }

      if (q.status) {
        params.push(q.status);
        sql += ` AND a.status = $${params.length}`;
      }

      sql += ` ORDER BY a.attendance_date DESC, w.display_name ASC`;

      const rows = (await c.query(sql, params)).rows;

      return rows.map((r) => ({
        id: r.id,
        shopId: r.shop_id,
        workerId: r.worker_id,
        workerName: r.worker_name,
        attendanceDate: r.attendance_date,
        checkInAt: r.check_in_at ? new Date(r.check_in_at).toISOString() : null,
        checkOutAt: r.check_out_at ? new Date(r.check_out_at).toISOString() : null,
        status: r.status,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));
    });
  }

  async recordAttendance(
    ctx: AuthContext,
    dto: {
      workerId: string;
      attendanceDate: string;
      status: 'present' | 'absent' | 'half_day' | 'on_leave';
      checkInAt?: string | null;
      checkOutAt?: string | null;
      notes?: string | null;
    }
  ): Promise<WorkerAttendanceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = (
        await c.query(
          `SELECT id, display_name FROM workers WHERE id = $1 AND shop_id = $2`,
          [dto.workerId, ctx.shopId]
        )
      ).rows[0];
      if (!worker) throw notFound('Worker profile not found.');

      const res = await c.query(
        `INSERT INTO worker_attendance (
           shop_id, worker_id, attendance_date, status, check_in_at, check_out_at, notes, updated_at
         )
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, NOW())
         ON CONFLICT (worker_id, attendance_date)
         DO UPDATE SET
           status = EXCLUDED.status,
           check_in_at = COALESCE(EXCLUDED.check_in_at, worker_attendance.check_in_at),
           check_out_at = COALESCE(EXCLUDED.check_out_at, worker_attendance.check_out_at),
           notes = COALESCE(EXCLUDED.notes, worker_attendance.notes),
           updated_at = NOW()
         RETURNING *`,
        [
          ctx.shopId,
          dto.workerId,
          dto.attendanceDate,
          dto.status,
          dto.checkInAt ? new Date(dto.checkInAt) : null,
          dto.checkOutAt ? new Date(dto.checkOutAt) : null,
          dto.notes || null,
        ]
      );

      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'attendance.record',
        entity: 'worker_attendance',
        entityId: row.id,
        newValues: {
          workerId: dto.workerId,
          attendanceDate: dto.attendanceDate,
          status: dto.status,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        workerId: row.worker_id,
        workerName: worker.display_name,
        attendanceDate: toDateStr(row.attendance_date),
        checkInAt: row.check_in_at ? new Date(row.check_in_at).toISOString() : null,
        checkOutAt: row.check_out_at ? new Date(row.check_out_at).toISOString() : null,
        status: row.status,
        notes: row.notes,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  // --- Salary Advances Management ---

  async requestAdvance(
    ctx: AuthContext,
    actor: Effective,
    dto: { workerId?: string; amountPaise: number; reason: string }
  ): Promise<WorkerSalaryAdvanceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = await this.resolveWorkerId(c, ctx, actor, dto.workerId, 'salary.view');

      const res = await c.query(
        `INSERT INTO worker_salary_advances (shop_id, worker_id, amount_paise, reason, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [ctx.shopId, worker.id, dto.amountPaise, dto.reason]
      );
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'salary_advance.request',
        entity: 'worker_salary_advances',
        entityId: row.id,
        newValues: {
          workerId: worker.id,
          amountPaise: dto.amountPaise,
          reason: dto.reason,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        workerId: row.worker_id,
        workerName: worker.displayName,
        amountPaise: row.amount_paise,
        reason: row.reason,
        status: row.status,
        requestedAt: new Date(row.requested_at).toISOString(),
        notes: row.notes,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async listAdvances(
    ctx: AuthContext,
    actor: Effective,
    q?: { workerId?: string; status?: string }
  ): Promise<WorkerSalaryAdvanceItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const permScope = actor?.map.get('salary.view');
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

      const targetWorkerId = ownWorkerId || q?.workerId || null;

      const params: any[] = [ctx.shopId];
      let sql = `
        SELECT a.id, a.shop_id, a.worker_id, w.display_name AS worker_name,
               a.amount_paise, a.reason, a.status, a.requested_at,
               a.approved_by, u.name AS approved_by_name, a.approved_at,
               a.notes, a.created_at, a.updated_at
        FROM worker_salary_advances a
        JOIN workers w ON a.worker_id = w.id AND a.shop_id = w.shop_id
        LEFT JOIN users u ON a.approved_by = u.id
        WHERE a.shop_id = $1
      `;

      if (targetWorkerId) {
        params.push(targetWorkerId);
        sql += ` AND a.worker_id = $${params.length}`;
      }

      if (q?.status) {
        params.push(q.status);
        sql += ` AND a.status = $${params.length}`;
      }

      sql += ` ORDER BY a.requested_at DESC`;

      const rows = (await c.query(sql, params)).rows;

      return rows.map((r) => ({
        id: r.id,
        shopId: r.shop_id,
        workerId: r.worker_id,
        workerName: r.worker_name,
        amountPaise: r.amount_paise,
        reason: r.reason,
        status: r.status,
        requestedAt: new Date(r.requested_at).toISOString(),
        approvedBy: r.approved_by,
        approvedByName: r.approved_by_name,
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));
    });
  }

  async reviewAdvance(
    ctx: AuthContext,
    advanceId: string,
    dto: { status: 'approved' | 'rejected' | 'deducted'; notes?: string }
  ): Promise<WorkerSalaryAdvanceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const existing = (
        await c.query(
          `SELECT a.*, w.display_name AS worker_name
           FROM worker_salary_advances a
           JOIN workers w ON a.worker_id = w.id AND a.shop_id = w.shop_id
           WHERE a.id = $1 AND a.shop_id = $2`,
          [advanceId, ctx.shopId]
        )
      ).rows[0];

      if (!existing) throw notFound('Advance request not found.');

      const res = await c.query(
        `UPDATE worker_salary_advances
         SET status = $1, approved_by = $2, approved_at = NOW(),
             notes = COALESCE($3, notes), updated_at = NOW()
         WHERE id = $4 AND shop_id = $5
         RETURNING *`,
        [dto.status, ctx.userId, dto.notes || null, advanceId, ctx.shopId]
      );
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'salary_advance.review',
        entity: 'worker_salary_advances',
        entityId: row.id,
        newValues: {
          status: dto.status,
          notes: dto.notes,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        workerId: row.worker_id,
        workerName: existing.worker_name,
        amountPaise: row.amount_paise,
        reason: row.reason,
        status: row.status,
        requestedAt: new Date(row.requested_at).toISOString(),
        approvedBy: ctx.userId,
        approvedAt: new Date(row.approved_at).toISOString(),
        notes: row.notes,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async updateWorkerSalary(
    ctx: AuthContext,
    workerId: string,
    baseSalaryPaise: number
  ): Promise<{ workerId: string; baseSalaryPaise: number }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = (
        await c.query(
          `SELECT id, display_name, base_salary_paise FROM workers WHERE id = $1 AND shop_id = $2`,
          [workerId, ctx.shopId]
        )
      ).rows[0];
      if (!worker) throw notFound('Worker profile not found.');

      await c.query(
        `UPDATE workers SET base_salary_paise = $1, updated_at = NOW() WHERE id = $2 AND shop_id = $3`,
        [baseSalaryPaise, workerId, ctx.shopId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'worker.update_salary',
        entity: 'workers',
        entityId: workerId,
        oldValues: { baseSalaryPaise: worker.base_salary_paise },
        newValues: { baseSalaryPaise },
        ip: ctx.ip,
      });

      return { workerId, baseSalaryPaise };
    });
  }

  // --- Monthly Payroll Calculation & Settlements ---

  async previewPayroll(
    ctx: AuthContext,
    workerId: string,
    periodMonth: number,
    periodYear: number
  ) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const worker = (
        await c.query(
          `SELECT id, display_name, base_salary_paise FROM workers WHERE id = $1 AND shop_id = $2`,
          [workerId, ctx.shopId]
        )
      ).rows[0];
      if (!worker) throw notFound('Worker not found.');

      // Days in month
      const daysInMonth = new Date(periodYear, periodMonth, 0).getDate();
      const monthStartStr = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
      const monthEndStr = `${periodYear}-${String(periodMonth).padStart(2, '0')}-${daysInMonth}`;

      // Attendance summary
      const attRows = (
        await c.query(
          `SELECT status, COUNT(*)::int AS cnt
           FROM worker_attendance
           WHERE shop_id = $1 AND worker_id = $2
             AND attendance_date >= $3::date AND attendance_date <= $4::date
           GROUP BY status`,
          [ctx.shopId, workerId, monthStartStr, monthEndStr]
        )
      ).rows;

      let daysPresent = 0;
      let daysHalf = 0;
      let daysAbsent = 0;
      let daysLeave = 0;

      for (const r of attRows) {
        if (r.status === 'present') daysPresent = r.cnt;
        else if (r.status === 'half_day') daysHalf = r.cnt;
        else if (r.status === 'absent') daysAbsent = r.cnt;
        else if (r.status === 'on_leave') daysLeave = r.cnt;
      }

      const totalTrackedDays = daysPresent + daysHalf + daysAbsent + daysLeave;
      const baseSalaryPaise = worker.base_salary_paise || 0;

      let proRatedBasePaise = baseSalaryPaise;
      if (totalTrackedDays > 0) {
        const effectiveAttendedDays = daysPresent + daysLeave + daysHalf * 0.5;
        proRatedBasePaise = Math.round((baseSalaryPaise * effectiveAttendedDays) / daysInMonth);
      }

      // Commission and tips earned in month
      const commRes = (
        await c.query(
          `SELECT
             COALESCE(SUM(CASE WHEN type = 'service_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS service_comm,
             COALESCE(SUM(CASE WHEN type = 'product_commission' THEN amount_paise ELSE 0 END), 0)::bigint AS product_comm,
             COALESCE(SUM(CASE WHEN type = 'tip' THEN amount_paise ELSE 0 END), 0)::bigint AS tips
           FROM worker_commission_ledger
           WHERE shop_id = $1 AND worker_id = $2
             AND created_at >= ($3 || ' 00:00:00+00')::timestamptz
             AND created_at <= ($4 || ' 23:59:59+00')::timestamptz
             AND amount_paise > 0`,
          [ctx.shopId, workerId, monthStartStr, monthEndStr]
        )
      ).rows[0];

      const commissionEarnedPaise = Number(commRes.service_comm) + Number(commRes.product_comm);
      const tipEarnedPaise = Number(commRes.tips);

      // Approved advances pending deduction
      const advRes = (
        await c.query(
          `SELECT COALESCE(SUM(amount_paise), 0)::bigint AS total_advances
           FROM worker_salary_advances
           WHERE shop_id = $1 AND worker_id = $2 AND status = 'approved'`,
          [ctx.shopId, workerId]
        )
      ).rows[0];
      const advancesDeductedPaise = Number(advRes.total_advances);

      const netPayablePaise = Math.max(
        0,
        proRatedBasePaise + commissionEarnedPaise + tipEarnedPaise - advancesDeductedPaise
      );

      return {
        workerId: worker.id,
        workerName: worker.display_name,
        periodMonth,
        periodYear,
        daysInMonth,
        baseSalaryPaise,
        attendanceDaysPresent: daysPresent,
        attendanceDaysHalf: daysHalf,
        attendanceDaysAbsent: daysAbsent,
        attendanceDaysLeave: daysLeave,
        proRatedBasePaise,
        commissionEarnedPaise,
        tipEarnedPaise,
        advancesDeductedPaise,
        bonusesPaise: 0,
        netPayablePaise,
      };
    });
  }

  async generatePayroll(
    ctx: AuthContext,
    dto: {
      workerId: string;
      periodMonth: number;
      periodYear: number;
      bonusesPaise?: number;
      notes?: string;
    }
  ): Promise<WorkerSalarySettlementItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const preview = await this.previewPayroll(ctx, dto.workerId, dto.periodMonth, dto.periodYear);
      const bonusesPaise = dto.bonusesPaise || 0;
      const netPayablePaise = Math.max(
        0,
        preview.proRatedBasePaise +
          preview.commissionEarnedPaise +
          preview.tipEarnedPaise -
          preview.advancesDeductedPaise +
          bonusesPaise
      );

      const res = await c.query(
        `INSERT INTO worker_salary_settlements (
           shop_id, worker_id, period_month, period_year, base_salary_paise,
           attendance_days_present, attendance_days_half, attendance_days_absent,
           attendance_days_leave, pro_rated_base_paise, commission_earned_paise,
           tip_earned_paise, advances_deducted_paise, bonuses_paise, net_payable_paise,
           payout_status, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft', NOW())
         ON CONFLICT (worker_id, period_year, period_month)
         DO UPDATE SET
           base_salary_paise = EXCLUDED.base_salary_paise,
           attendance_days_present = EXCLUDED.attendance_days_present,
           attendance_days_half = EXCLUDED.attendance_days_half,
           attendance_days_absent = EXCLUDED.attendance_days_absent,
           attendance_days_leave = EXCLUDED.attendance_days_leave,
           pro_rated_base_paise = EXCLUDED.pro_rated_base_paise,
           commission_earned_paise = EXCLUDED.commission_earned_paise,
           tip_earned_paise = EXCLUDED.tip_earned_paise,
           advances_deducted_paise = EXCLUDED.advances_deducted_paise,
           bonuses_paise = EXCLUDED.bonuses_paise,
           net_payable_paise = EXCLUDED.net_payable_paise,
           updated_at = NOW()
         RETURNING *`,
        [
          ctx.shopId,
          dto.workerId,
          dto.periodMonth,
          dto.periodYear,
          preview.baseSalaryPaise,
          preview.attendanceDaysPresent,
          preview.attendanceDaysHalf,
          preview.attendanceDaysAbsent,
          preview.attendanceDaysLeave,
          preview.proRatedBasePaise,
          preview.commissionEarnedPaise,
          preview.tipEarnedPaise,
          preview.advancesDeductedPaise,
          bonusesPaise,
          netPayablePaise,
        ]
      );

      const row = res.rows[0];

      // Mark deducted advances
      if (preview.advancesDeductedPaise > 0) {
        await c.query(
          `UPDATE worker_salary_advances
           SET status = 'deducted', notes = COALESCE(notes || ' | ', '') || 'Deducted in settlement ' || $1, updated_at = NOW()
           WHERE shop_id = $2 AND worker_id = $3 AND status = 'approved'`,
          [`${dto.periodYear}-${String(dto.periodMonth).padStart(2, '0')}`, ctx.shopId, dto.workerId]
        );
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'salary.generate_settlement',
        entity: 'worker_salary_settlements',
        entityId: row.id,
        newValues: {
          workerId: dto.workerId,
          period: `${dto.periodYear}-${dto.periodMonth}`,
          netPayablePaise,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        workerId: row.worker_id,
        workerName: preview.workerName,
        periodMonth: row.period_month,
        periodYear: row.period_year,
        baseSalaryPaise: row.base_salary_paise,
        attendanceDaysPresent: row.attendance_days_present,
        attendanceDaysHalf: row.attendance_days_half,
        attendanceDaysAbsent: row.attendance_days_absent,
        attendanceDaysLeave: row.attendance_days_leave,
        proRatedBasePaise: row.pro_rated_base_paise,
        commissionEarnedPaise: row.commission_earned_paise,
        tipEarnedPaise: row.tip_earned_paise,
        advancesDeductedPaise: row.advances_deducted_paise,
        bonusesPaise: row.bonuses_paise,
        netPayablePaise: row.net_payable_paise,
        payoutStatus: row.payout_status,
        paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
        expenseId: row.expense_id,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async listPayrollSettlements(
    ctx: AuthContext,
    actor: Effective,
    q?: { workerId?: string; periodYear?: number; periodMonth?: number }
  ): Promise<WorkerSalarySettlementItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const permScope = actor?.map.get('salary.view');
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

      const targetWorkerId = ownWorkerId || q?.workerId || null;

      const params: any[] = [ctx.shopId];
      let sql = `
        SELECT s.*, w.display_name AS worker_name
        FROM worker_salary_settlements s
        JOIN workers w ON s.worker_id = w.id AND s.shop_id = w.shop_id
        WHERE s.shop_id = $1
      `;

      if (targetWorkerId) {
        params.push(targetWorkerId);
        sql += ` AND s.worker_id = $${params.length}`;
      }

      if (q?.periodYear) {
        params.push(q.periodYear);
        sql += ` AND s.period_year = $${params.length}`;
      }

      if (q?.periodMonth) {
        params.push(q.periodMonth);
        sql += ` AND s.period_month = $${params.length}`;
      }

      sql += ` ORDER BY s.period_year DESC, s.period_month DESC, w.display_name ASC`;

      const rows = (await c.query(sql, params)).rows;

      return rows.map((r) => ({
        id: r.id,
        shopId: r.shop_id,
        workerId: r.worker_id,
        workerName: r.worker_name,
        periodMonth: r.period_month,
        periodYear: r.period_year,
        baseSalaryPaise: r.base_salary_paise,
        attendanceDaysPresent: r.attendance_days_present,
        attendanceDaysHalf: r.attendance_days_half,
        attendanceDaysAbsent: r.attendance_days_absent,
        attendanceDaysLeave: r.attendance_days_leave,
        proRatedBasePaise: r.pro_rated_base_paise,
        commissionEarnedPaise: r.commission_earned_paise,
        tipEarnedPaise: r.tip_earned_paise,
        advancesDeductedPaise: r.advances_deducted_paise,
        bonusesPaise: r.bonuses_paise,
        netPayablePaise: r.net_payable_paise,
        payoutStatus: r.payout_status,
        paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
        expenseId: r.expense_id,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));
    });
  }

  async payPayrollSettlement(
    ctx: AuthContext,
    settlementId: string,
    dto: {
      paymentMethod?: 'cash' | 'bank_transfer' | 'upi';
      recordExpense?: boolean;
      notes?: string;
    }
  ): Promise<WorkerSalarySettlementItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const settlement = (
        await c.query(
          `SELECT s.*, w.display_name AS worker_name
           FROM worker_salary_settlements s
           JOIN workers w ON s.worker_id = w.id AND s.shop_id = w.shop_id
           WHERE s.id = $1 AND s.shop_id = $2`,
          [settlementId, ctx.shopId]
        )
      ).rows[0];

      if (!settlement) throw notFound('Salary settlement record not found.');
      if (settlement.payout_status === 'paid') {
        throw badRequest('This salary settlement has already been marked as paid.');
      }

      let expenseId: string | null = null;
      if (dto.recordExpense !== false && settlement.net_payable_paise > 0) {
        // Find or create 'Salaries & Wages' category
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

        const expMethod =
          dto.paymentMethod === 'bank_transfer'
            ? 'bank_transfer'
            : dto.paymentMethod === 'upi'
            ? 'online'
            : 'cash';

        const expDesc = `Salary Payout to ${settlement.worker_name} for ${settlement.period_year}-${String(settlement.period_month).padStart(2, '0')}`;

        const expRes = await c.query(
          `INSERT INTO expenses (shop_id, category_id, amount_paise, date, description, payment_method, created_by)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6)
           RETURNING id`,
          [ctx.shopId, cat.id, settlement.net_payable_paise, expDesc, expMethod, ctx.userId]
        );
        expenseId = expRes.rows[0].id;
      }

      const res = await c.query(
        `UPDATE worker_salary_settlements
         SET payout_status = 'paid', paid_at = NOW(), expense_id = COALESCE($1, expense_id), updated_at = NOW()
         WHERE id = $2 AND shop_id = $3
         RETURNING *`,
        [expenseId, settlementId, ctx.shopId]
      );
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'salary.pay_settlement',
        entity: 'worker_salary_settlements',
        entityId: row.id,
        newValues: {
          settlementId,
          workerId: row.worker_id,
          workerName: settlement.worker_name,
          amountPaidPaise: row.net_payable_paise,
          expenseId,
        },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        workerId: row.worker_id,
        workerName: settlement.worker_name,
        periodMonth: row.period_month,
        periodYear: row.period_year,
        baseSalaryPaise: row.base_salary_paise,
        attendanceDaysPresent: row.attendance_days_present,
        attendanceDaysHalf: row.attendance_days_half,
        attendanceDaysAbsent: row.attendance_days_absent,
        attendanceDaysLeave: row.attendance_days_leave,
        proRatedBasePaise: row.pro_rated_base_paise,
        commissionEarnedPaise: row.commission_earned_paise,
        tipEarnedPaise: row.tip_earned_paise,
        advancesDeductedPaise: row.advances_deducted_paise,
        bonusesPaise: row.bonuses_paise,
        netPayablePaise: row.net_payable_paise,
        payoutStatus: row.payout_status,
        paidAt: new Date(row.paid_at).toISOString(),
        expenseId: row.expense_id,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }
}
