import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const nf = (what = 'Customer') => new AppException(404, ErrorCodes.NOT_FOUND, `${what} not found.`);
const conflict = (m: string, details?: unknown) => new AppException(409, ErrorCodes.CONFLICT, m, details);
const bad = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);
const forbid = (m = "You don't have permission to do this.") => new AppException(403, ErrorCodes.FORBIDDEN, m);

const SELECT = `SELECT c.*, w.display_name AS pw_name,
  COALESCE((SELECT array_agg(cs.service_id) FROM customer_preferred_services cs WHERE cs.customer_id = c.id), '{}') AS service_ids
  FROM customers c LEFT JOIN workers w ON w.id = c.preferred_worker_id`;
const FIELDS: Record<string, string> = { name: 'name', phone: 'phone', email: 'email', notes: 'notes', internalNotes: 'internal_notes', preferredWorkerId: 'preferred_worker_id' };

/** Staff view (includes internal notes and link state). */
const staffOut = (r: any) => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email, notes: r.notes, internalNotes: r.internal_notes,
  preferredWorkerId: r.preferred_worker_id, preferredWorkerName: r.pw_name ?? null, serviceIds: r.service_ids ?? [],
  hasAccount: !!r.user_id, linkPending: !!r.pending_user_id, archived: !!r.archived_at, createdAt: r.created_at,
});
/** The customer's own view: NO internal notes, no link internals. */
const selfOut = (r: any) => ({
  name: r.name, phone: r.phone, email: r.email, notes: r.notes,
  preferredWorker: r.preferred_worker_id ? { id: r.preferred_worker_id, displayName: r.pw_name } : null, serviceIds: r.service_ids ?? [],
});

@Injectable()
export class CustomersService {
  constructor(private db: Db, private audit: AuditService) {}

  // ================= staff side =================
  private scope(p: Effective, key: string) { return p.map.get(key); }
  private async myWorkerId(c: PoolClient, ctx: AuthContext) {
    return (await c.query('SELECT id FROM workers WHERE user_id=$1 AND archived_at IS NULL', [ctx.userId])).rows[0]?.id as string | undefined;
  }
  /** "own" scope = customers whose preferred barber is my worker profile (Phase 6 adds "customers I have served"). Others are 404. */
  private async loadFor(c: PoolClient, ctx: AuthContext, p: Effective, key: string, id: string) {
    const r = (await c.query(`${SELECT} WHERE c.id = $1`, [id])).rows[0];
    if (!r) throw nf();
    const s = this.scope(p, key);
    if (s === 'all') return r;
    if (s === 'own') { const mine = await this.myWorkerId(c, ctx); if (mine && r.preferred_worker_id === mine) return r; throw nf(); }
    throw forbid();
  }
  private fresh(c: PoolClient, id: string) { return c.query(`${SELECT} WHERE c.id=$1`, [id]).then((r) => staffOut(r.rows[0])); }

  list(ctx: AuthContext, p: Effective, q: { q?: string; preferredWorkerId?: string; linkPending?: boolean; includeArchived: boolean; page: number; limit: number }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = [], v: unknown[] = [];
      const add = (sql: string, val: unknown) => { v.push(val); w.push(sql.replace(/\?/g, `$${v.length}`)); };
      if (this.scope(p, 'customers.view') === 'own') add('c.preferred_worker_id IN (SELECT id FROM workers WHERE user_id = ?)', ctx.userId);
      if (!q.includeArchived) w.push('c.archived_at IS NULL');
      if (q.preferredWorkerId) add('c.preferred_worker_id = ?', q.preferredWorkerId);
      if (q.linkPending) w.push('c.pending_user_id IS NOT NULL');
      if (q.q) {
        const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`, digits = q.q.replace(/\D/g, '');
        v.push(like); const n = v.length;
        if (digits.length >= 3) { v.push(`%${digits}%`); w.push(`(c.name ILIKE $${n} OR c.phone LIKE $${v.length})`); } else w.push(`c.name ILIKE $${n}`);
      }
      const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
      const total = (await c.query(`SELECT count(*)::int n FROM customers c ${where}`, v)).rows[0].n;
      const rows = (await c.query(`${SELECT} ${where} ORDER BY lower(c.name), c.created_at LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, v)).rows;
      return { items: rows.map(staffOut), page: q.page, limit: q.limit, total };
    });
  }

  get(ctx: AuthContext, p: Effective, id: string) { return this.db.tenant({ shopId: ctx.shopId }, async (c) => staffOut(await this.loadFor(c, ctx, p, 'customers.view', id))); }

  create(ctx: AuthContext, p: Effective, dto: any) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      let preferred = dto.preferredWorkerId ?? null;
      if (this.scope(p, 'customers.create') === 'own') { // a barber's own customers are assigned to them, so they can see what they created
        const mine = await this.myWorkerId(c, ctx);
        if (!mine) throw forbid("You don't have a worker profile, so you can't add customers.");
        if (dto.preferredWorkerId && dto.preferredWorkerId !== mine) throw forbid('You can only add customers for yourself.');
        preferred = mine;
      }
      if (preferred) await this.assertWorker(c, preferred);
      const existing = (await c.query('SELECT id FROM customers WHERE phone=$1 AND archived_at IS NULL', [dto.phone])).rows[0];
      if (existing) throw conflict('A customer with this mobile number already exists.', this.scope(p, 'customers.view') === 'all' ? { customerId: existing.id } : undefined);
      let id: string;
      try {
        id = (await c.query(
          `INSERT INTO customers (shop_id, name, phone, email, notes, internal_notes, preferred_worker_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.shopId, dto.name, dto.phone, dto.email ?? null, dto.notes ?? null, dto.internalNotes ?? null, preferred, ctx.userId])).rows[0].id;
      } catch (e) { throw isUniqueViolation(e) ? conflict('A customer with this mobile number already exists.') : e; }
      if (dto.serviceIds?.length) await this.writeServices(c, ctx.shopId!, id, dto.serviceIds);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'customer.create', entity: 'customer', entityId: id, newValues: { name: dto.name, phone: dto.phone, preferredWorkerId: preferred }, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  update(ctx: AuthContext, p: Effective, id: string, dto: Record<string, any>) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = await this.loadFor(c, ctx, p, 'customers.update', id);
      if (old.archived_at) throw conflict('This customer is archived. Restore them first.');
      if ('preferredWorkerId' in dto && this.scope(p, 'customers.update') !== 'all') throw forbid('Only managers can reassign a customer to another barber.');
      if (dto.preferredWorkerId) await this.assertWorker(c, dto.preferredWorkerId);
      if (dto.phone !== undefined && dto.phone !== old.phone && (old.user_id || old.pending_user_id)) throw conflict("This customer's phone is tied to their app account and can't be changed here.");
      if (dto.phone !== undefined && dto.phone !== old.phone) {
        if ((await c.query('SELECT 1 FROM customers WHERE phone=$1 AND archived_at IS NULL AND id<>$2', [dto.phone, id])).rowCount) throw conflict('A customer with this mobile number already exists.');
      }
      const sets: string[] = [], vals: unknown[] = [id], before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(dto)) {
        const col = FIELDS[k]; if (!col || val === undefined || old[col] === (val ?? null)) continue;
        vals.push(val ?? null); sets.push(`${col} = $${vals.length}`); before[k] = old[col]; after[k] = val ?? null;
      }
      if (sets.length) await c.query(`UPDATE customers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
      if (dto.serviceIds) {
        const oldIds = [...(old.service_ids ?? [])].sort(); const nowIds = [...new Set<string>(dto.serviceIds)].sort();
        if (JSON.stringify(oldIds) !== JSON.stringify(nowIds)) {
          await c.query('DELETE FROM customer_preferred_services WHERE customer_id=$1', [id]); await this.writeServices(c, ctx.shopId!, id, nowIds);
          before.serviceIds = oldIds; after.serviceIds = nowIds;
        }
      }
      if (Object.keys(after).length) await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'customer.update', entity: 'customer', entityId: id, oldValues: before, newValues: after, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  archive(ctx: AuthContext, p: Effective, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = await this.loadFor(c, ctx, p, 'customers.delete', id);
      if (r.archived_at) throw conflict('This customer is already archived.');
      await c.query('UPDATE customers SET archived_at = now(), pending_user_id = NULL, updated_at = now() WHERE id = $1', [id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'customer.archive', entity: 'customer', entityId: id, ip: ctx.ip });
      return { archived: true };
    });
  }
  restore(ctx: AuthContext, p: Effective, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = await this.loadFor(c, ctx, p, 'customers.delete', id);
      if (!r.archived_at) throw conflict('This customer is not archived.');
      try { await c.query('UPDATE customers SET archived_at = NULL, updated_at = now() WHERE id = $1', [id]); }
      catch (e) { throw isUniqueViolation(e) ? conflict('Another customer now uses this mobile number. Resolve that first.') : e; }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'customer.restore', entity: 'customer', entityId: id, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  /** Staff decision on an account that asked to link to an existing record (phone numbers are unverified in Phase 1). */
  resolveLink(ctx: AuthContext, p: Effective, id: string, approve: boolean) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      if (this.scope(p, 'customers.update') !== 'all') throw forbid();
      const r = (await c.query('SELECT id, pending_user_id, archived_at FROM customers WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!r) throw nf();
      if (!r.pending_user_id) throw conflict('There is no pending link request for this customer.');
      if (approve) {
        try { await c.query('UPDATE customers SET user_id = pending_user_id, pending_user_id = NULL, updated_at = now() WHERE id=$1', [id]); }
        catch (e) { throw isUniqueViolation(e) ? conflict('That account is already linked to another customer record in this shop.') : e; }
      } else await c.query('UPDATE customers SET pending_user_id = NULL, updated_at = now() WHERE id=$1', [id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: approve ? 'customer.link.approve' : 'customer.link.reject', entity: 'customer', entityId: id, newValues: { accountUserId: r.pending_user_id }, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  // ================= customer self-service (a customer account acting inside ONE shop) =================
  async shopBySlug(slug: string) {
    const s = await this.db.tenant({ publicRead: true }, async (c) => (await c.query('SELECT id FROM shops WHERE slug=$1', [slug])).rows[0]);
    if (!s) throw nf('Shop');
    return s.id as string;
  }

  async myProfile(ctx: AuthContext, slug: string) {
    const shopId = await this.shopBySlug(slug);
    return this.db.tenant({ shopId }, async (c) => {
      const r = (await c.query(`${SELECT} WHERE c.user_id=$1 AND c.archived_at IS NULL`, [ctx.userId])).rows[0];
      if (r) return { status: 'linked', profile: selfOut(r) };
      const pending = (await c.query('SELECT 1 FROM customers WHERE pending_user_id=$1 AND archived_at IS NULL', [ctx.userId])).rowCount;
      return { status: pending ? 'pending' : 'not_joined' }; // pending: nothing about the record is revealed
    });
  }

  async myCustomerId(ctx: AuthContext, shopId: string): Promise<string | null> {
    return this.db.tenant({ shopId }, async (c) => {
      const r = (await c.query('SELECT id FROM customers WHERE user_id = $1 AND archived_at IS NULL', [ctx.userId])).rows[0];
      return r ? r.id : null;
    });
  }

  /** Become a customer of this shop. A brand-new phone => linked at once. A phone the shop already has => PENDING until staff approve. */
  async join(ctx: AuthContext, slug: string) {
    const shopId = await this.shopBySlug(slug);
    return this.db.tenant({ shopId }, async (c) => {
      const mine = (await c.query(`${SELECT} WHERE c.user_id=$1 ORDER BY c.archived_at NULLS FIRST LIMIT 1`, [ctx.userId])).rows[0];
      if (mine?.archived_at) throw forbid('This shop has removed your profile. Please contact the shop.');
      if (mine) return { status: 'linked', profile: selfOut(mine) };
      const u = (await c.query('SELECT name, phone, email FROM users WHERE id=$1', [ctx.userId])).rows[0];
      const same = (await c.query('SELECT id, user_id, pending_user_id FROM customers WHERE phone=$1 AND archived_at IS NULL FOR UPDATE', [u.phone])).rows[0];
      if (!same) {
        const id = (await c.query(`INSERT INTO customers (shop_id, user_id, name, phone, email, created_by) VALUES ($1,$2,$3,$4,$5,$2) RETURNING id`, [shopId, ctx.userId, u.name, u.phone, u.email])).rows[0].id;
        await this.audit.log(c, { shopId, userId: ctx.userId, action: 'customer.join', entity: 'customer', entityId: id, newValues: { linked: true }, ip: ctx.ip });
        return { status: 'linked', profile: selfOut((await c.query(`${SELECT} WHERE c.id=$1`, [id])).rows[0]) };
      }
      if (same.user_id) throw conflict('This mobile number is already registered with this shop under another account. Please contact the shop.');
      if (same.pending_user_id && same.pending_user_id !== ctx.userId) throw conflict('A link request for this number is already waiting for the shop. Please contact the shop.');
      if (!same.pending_user_id) {
        await c.query('UPDATE customers SET pending_user_id=$2, updated_at=now() WHERE id=$1', [same.id, ctx.userId]);
        await this.audit.log(c, { shopId, userId: ctx.userId, action: 'customer.link.request', entity: 'customer', entityId: same.id, ip: ctx.ip });
      }
      return { status: 'pending' };
    });
  }

  async updateMyProfile(ctx: AuthContext, slug: string, dto: Record<string, any>) {
    const shopId = await this.shopBySlug(slug);
    return this.db.tenant({ shopId }, async (c) => {
      const old = (await c.query(`${SELECT} WHERE c.user_id=$1 AND c.archived_at IS NULL FOR UPDATE OF c`, [ctx.userId])).rows[0];
      if (!old) throw forbid('Join this shop first (and wait for approval if the shop asked you to).');
      if (dto.preferredWorkerId) await this.assertWorker(c, dto.preferredWorkerId);
      const sets: string[] = [], vals: unknown[] = [old.id], before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      for (const k of ['name', 'email', 'notes', 'preferredWorkerId']) {
        if (dto[k] === undefined) continue; const col = FIELDS[k];
        if (old[col] === (dto[k] ?? null)) continue;
        vals.push(dto[k] ?? null); sets.push(`${col} = $${vals.length}`); before[k] = old[col]; after[k] = dto[k] ?? null;
      }
      if (sets.length) await c.query(`UPDATE customers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
      if (dto.serviceIds) {
        await c.query('DELETE FROM customer_preferred_services WHERE customer_id=$1', [old.id]); await this.writeServices(c, shopId, old.id, dto.serviceIds);
        before.serviceIds = old.service_ids; after.serviceIds = [...new Set(dto.serviceIds)];
      }
      if (Object.keys(after).length) await this.audit.log(c, { shopId, userId: ctx.userId, action: 'customer.profile.update', entity: 'customer', entityId: old.id, oldValues: before, newValues: after, ip: ctx.ip });
      return { status: 'linked', profile: selfOut((await c.query(`${SELECT} WHERE c.id=$1`, [old.id])).rows[0]) };
    });
  }

  async myAppointments(shopId: string, customerId: string) {
    return this.db.tenant({ shopId }, async (c) => {
      const rows = (
        await c.query(
          `
        SELECT 
          a.id,
          a.appointment_number as "appointmentNumber",
          a.status,
          a.date::text as "date",
          a.start_time::text as "startTime",
          a.end_time::text as "endTime",
          a.total_amount_paise as "totalAmountPaise",
          w.id as "workerId",
          w.display_name as "workerName",
          COALESCE(
            (
              SELECT json_agg(json_build_object('id', s.service_id, 'name', COALESCE(s.name_snapshot, s.service_name), 'pricePaise', COALESCE(s.price_paise, s.unit_price_paise)))
              FROM appointment_services s
              WHERE s.appointment_id = a.id AND s.removed_at IS NULL
            ),
            '[]'::json
          ) as services,
          r.id as "reviewId",
          r.rating as "reviewRating",
          r.comment as "reviewComment"
        FROM appointments a
        LEFT JOIN workers w ON w.id = a.worker_id
        LEFT JOIN reviews r ON r.appointment_id = a.id
        WHERE a.customer_id = $1
        ORDER BY a.start_at DESC
        LIMIT 50
      `,
          [customerId]
        )
      ).rows;

      return rows.map((r) => ({
        id: r.id,
        appointmentNumber: r.appointmentNumber,
        status: r.status,
        date: r.date,
        startTime: r.startTime ? r.startTime.slice(0, 5) : null,
        endTime: r.endTime ? r.endTime.slice(0, 5) : null,
        totalAmountPaise: r.totalAmountPaise,
        worker: r.workerId ? { id: r.workerId, name: r.workerName } : null,
        services: r.services,
        review: r.reviewId ? { id: r.reviewId, rating: r.reviewRating, comment: r.reviewComment } : null,
      }));
    });
  }

  async cancelMyAppointment(
    ctx: AuthContext,
    shopId: string,
    customerId: string,
    appointmentId: string,
    reason?: string
  ) {
    return this.db.tenant({ shopId }, async (c) => {
      const shop = (await c.query('SELECT id, name, phone, settings FROM shops WHERE id = $1', [shopId])).rows[0];
      if (!shop) throw nf('Shop');

      const apt = (
        await c.query(
          `SELECT a.*, c.name as customer_name, c.phone as customer_phone, w.display_name as worker_name, w.user_id as worker_user_id
           FROM appointments a
           LEFT JOIN customers c ON c.id = a.customer_id
           LEFT JOIN workers w ON w.id = a.worker_id
           WHERE a.id = $1 AND a.shop_id = $2 FOR UPDATE`,
          [appointmentId, shopId]
        )
      ).rows[0];

      if (!apt) throw nf('Appointment');
      if (apt.customer_id !== customerId) {
        throw forbid('You can only cancel your own appointments.');
      }

      if (apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'in_service') {
        throw bad(`Cannot cancel an appointment that is already ${apt.status}.`);
      }

      const cooldownHours = shop.settings?.cancellation_cooldown_hours ?? 24;
      const startTimeMs = new Date(apt.start_at).getTime();
      const nowMs = Date.now();
      const diffHours = (startTimeMs - nowMs) / (1000 * 60 * 60);

      if (cooldownHours > 0 && diffHours < cooldownHours) {
        throw bad(
          `Appointments can only be cancelled at least ${cooldownHours} hour(s) before the scheduled time. Please contact ${shop.name}${shop.phone ? ` at ${shop.phone}` : ''} directly.`
        );
      }

      const cancelReason = (reason?.trim() || 'Cancelled by customer online').slice(0, 300);

      await c.query(
        `UPDATE appointments 
         SET status = 'cancelled', 
             cancelled_at = now(), 
             cancelled_by = $1, 
             cancelled_by_customer = true, 
             cancel_reason = $2,
             updated_at = now()
         WHERE id = $3 AND shop_id = $4`,
        [ctx.userId, cancelReason, appointmentId, shopId]
      );

      await c.query(
        `INSERT INTO appointment_status_history (shop_id, appointment_id, from_status, to_status, status, notes, changed_by)
         VALUES ($1, $2, $3, 'cancelled', 'cancelled', $4, $5)`,
        [shopId, appointmentId, apt.status, cancelReason, ctx.userId]
      );

      // In-app alert for staff / worker
      await c.query(
        `INSERT INTO notifications (shop_id, user_id, customer_id, title, message, type, channel, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'appointment_cancelled', 'in_app', 'unread', $6)`,
        [
          shopId,
          apt.worker_user_id || null,
          customerId,
          `Appointment #${apt.appointment_number} Cancelled`,
          `Customer ${apt.customer_name} cancelled appointment #${apt.appointment_number} scheduled for ${apt.date ? String(apt.date).slice(0, 10) : ''} at ${apt.start_time ? String(apt.start_time).slice(0, 5) : ''}. Reason: ${cancelReason}`,
          JSON.stringify({
            appointmentId,
            appointmentNumber: apt.appointment_number,
            customerName: apt.customer_name,
            customerPhone: apt.customer_phone,
            cancelReason,
          }),
        ]
      );

      await this.audit.log(c, {
        shopId,
        userId: ctx.userId,
        action: 'appointment.customer_cancel',
        entity: 'appointment',
        entityId: appointmentId,
        oldValues: { status: apt.status },
        newValues: { status: 'cancelled', cancelReason, cancelledByCustomer: true },
        ip: ctx.ip,
      });

      return {
        id: appointmentId,
        status: 'cancelled',
        message: 'Appointment cancelled successfully.',
      };
    });
  }

  // ----- helpers -----
  private async assertWorker(c: PoolClient, id: string) {
    if (!(await c.query(`SELECT 1 FROM workers WHERE id=$1 AND archived_at IS NULL AND status='active'`, [id])).rowCount) throw bad('That barber is not available.');
  }
  private async writeServices(c: PoolClient, shopId: string, customerId: string, ids: string[]) {
    const u = [...new Set(ids)]; if (!u.length) return;
    const r = await c.query(`INSERT INTO customer_preferred_services (customer_id, service_id, shop_id) SELECT $1, s.id, $2 FROM services s WHERE s.id = ANY($3::uuid[]) AND s.archived_at IS NULL AND s.status='active'`, [customerId, shopId, u]);
    if (r.rowCount !== u.length) throw bad('One or more services do not exist.');
  }
}
