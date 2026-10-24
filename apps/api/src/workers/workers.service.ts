import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { UsersService } from '../rbac/users.service';
import { hashPassword } from '../auth/auth.service';
import { toMinutes } from './time';

const nf = (what = 'Worker') => new AppException(404, ErrorCodes.NOT_FOUND, `${what} not found.`);
const conflict = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const bad = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

const SELECT = `SELECT w.*, u.phone AS login_phone, u.email AS login_email, u.status AS login_status, sh.slug,
  COALESCE((SELECT array_agg(ws.service_id) FROM worker_services ws WHERE ws.worker_id = w.id), '{}') AS service_ids,
  (SELECT count(*)::int FROM worker_availability a WHERE a.worker_id = w.id) AS avail_days
  FROM workers w LEFT JOIN users u ON u.id = w.user_id JOIN shops sh ON sh.id = w.shop_id`;
const out = (r: any) => ({
  id: r.id, displayName: r.display_name, status: r.status, archived: !!r.archived_at, userId: r.user_id,
  serviceIds: r.service_ids ?? [], hasAvailability: r.avail_days > 0,
  login: r.user_id ? { phone: r.login_phone, email: r.login_email, status: r.login_status } : null,
  photoUrl: r.photo_file_id ? `/api/v1/shops/public/${r.slug}/barbers/${r.id}/photo` : null,
});

@Injectable()
export class WorkersService {
  constructor(private db: Db, private audit: AuditService, private files: FilesService, private users: UsersService) {}

  private scope(p: Effective, key: string) { return p.map.get(key); }
  /** "own" scope = only the worker profile linked to my login. Other people's profiles are 404 (existence not revealed). */
  private async loadFor(c: PoolClient, ctx: AuthContext, p: Effective, key: string, id: string, needAll = false) {
    const w = (await c.query(`${SELECT} WHERE w.id = $1`, [id])).rows[0];
    if (!w) throw nf();
    const s = this.scope(p, key);
    if (s === 'all') return w;
    if (s === 'own' && !needAll) { if (w.user_id === ctx.userId) return w; throw nf(); }
    throw new AppException(403, ErrorCodes.FORBIDDEN, "You don't have permission to do this.");
  }
  private async fresh(c: PoolClient, id: string) { return out((await c.query(`${SELECT} WHERE w.id=$1`, [id])).rows[0]); }

  list(ctx: AuthContext, p: Effective, q: { q?: string; status?: string; includeArchived: boolean; page: number; limit: number }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = [], vals: unknown[] = [];
      const add = (sql: string, v: unknown) => { vals.push(v); w.push(sql.replace('?', `$${vals.length}`)); };
      if (this.scope(p, 'workers.view') === 'own') add('w.user_id = ?', ctx.userId);
      if (!q.includeArchived) w.push('w.archived_at IS NULL');
      if (q.q) add('w.display_name ILIKE ?', `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
      if (q.status) add('w.status = ?', q.status);
      const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
      const total = (await c.query(`SELECT count(*)::int n FROM workers w ${where}`, vals)).rows[0].n;
      const rows = (await c.query(`${SELECT} ${where} ORDER BY lower(w.display_name) LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, vals)).rows;
      return { items: rows.map(out), page: q.page, limit: q.limit, total };
    });
  }
  get(ctx: AuthContext, p: Effective, id: string) { return this.db.tenant({ shopId: ctx.shopId }, async (c) => out(await this.loadFor(c, ctx, p, 'workers.view', id))); }
  me(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = (await c.query(`${SELECT} WHERE w.user_id = $1 AND w.archived_at IS NULL`, [ctx.userId])).rows[0];
      if (!w) throw nf('No worker profile is linked to your account.');
      return out(w);
    });
  }

  async create(ctx: AuthContext, actor: Effective, dto: { displayName: string; login?: any; linkUserId?: string }) {
    const hash = dto.login ? await hashPassword(dto.login.password) : null;
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => { // one transaction: worker + login succeed or fail together
      let userId: string | null = null;
      if (dto.login) {
        const roleIds = dto.login.roleIds ?? [await this.workerRoleId(c)];
        userId = (await this.users.createIn(c, ctx, actor, { name: dto.displayName, phone: dto.login.phone, email: dto.login.email, password: dto.login.password, roleIds }, hash!)).id;
      } else if (dto.linkUserId) {
        const u = (await c.query(`SELECT id FROM users WHERE id=$1 AND shop_id=$2 AND type='staff'`, [dto.linkUserId, ctx.shopId])).rows[0];
        if (!u) throw bad('That staff account does not exist in this shop.');
        userId = u.id;
      }
      let id: string;
      try { id = (await c.query('INSERT INTO workers (shop_id, user_id, display_name) VALUES ($1,$2,$3) RETURNING id', [ctx.shopId, userId, dto.displayName])).rows[0].id; }
      catch (e) { throw isUniqueViolation(e) ? conflict('That staff account is already linked to a worker profile.') : e; }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.create', entity: 'worker', entityId: id, newValues: { displayName: dto.displayName, userId }, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  /** Give a worker who was created without a login a login. */
  async addLogin(ctx: AuthContext, actor: Effective, id: string, login: any) {
    const hash = await hashPassword(login.password);
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = await this.loadFor(c, ctx, actor, 'workers.update', id, true);
      if (w.archived_at) throw conflict('Restore this worker before adding a login.');
      if (w.user_id) throw conflict('This worker already has a login.');
      const roleIds = login.roleIds ?? [await this.workerRoleId(c)];
      const u = await this.users.createIn(c, ctx, actor, { name: w.display_name, phone: login.phone, email: login.email, password: login.password, roleIds }, hash);
      await c.query('UPDATE workers SET user_id=$2, updated_at=now() WHERE id=$1', [id, u.id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.login.create', entity: 'worker', entityId: id, newValues: { userId: u.id }, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  update(ctx: AuthContext, p: Effective, id: string, dto: { displayName?: string; status?: string }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = await this.loadFor(c, ctx, p, 'workers.update', id, true);
      if (old.archived_at) throw conflict('This worker is archived. Restore them first.');
      const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      if (dto.displayName !== undefined && dto.displayName !== old.display_name) { before.displayName = old.display_name; after.displayName = dto.displayName; }
      if (dto.status !== undefined && dto.status !== old.status) { before.status = old.status; after.status = dto.status; }
      if (Object.keys(after).length) {
        await c.query('UPDATE workers SET display_name = COALESCE($2, display_name), status = COALESCE($3, status), updated_at = now() WHERE id = $1', [id, dto.displayName ?? null, dto.status ?? null]);
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.update', entity: 'worker', entityId: id, oldValues: before, newValues: after, ip: ctx.ip });
      }
      return this.fresh(c, id);
    });
  }

  /** Soft delete: never bookable again, history intact. Login is disabled unless they are an Owner (a shop can't lock itself out). */
  archive(ctx: AuthContext, p: Effective, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = await this.loadFor(c, ctx, p, 'workers.delete', id, true);
      if (w.archived_at) throw conflict('This worker is already archived.');
      if (w.user_id === ctx.userId) throw conflict("You can't archive your own worker profile.");
      await c.query(`UPDATE workers SET archived_at = now(), status = 'inactive', updated_at = now() WHERE id = $1`, [id]);
      let loginDisabled = false;
      if (w.user_id) {
        const owner = (await c.query(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id=$1 AND r.system_key='owner'`, [w.user_id])).rowCount;
        if (!owner) {
          await c.query(`UPDATE users SET status='disabled', updated_at=now() WHERE id=$1`, [w.user_id]);
          await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL', [w.user_id]);
          loginDisabled = true;
        }
      }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.archive', entity: 'worker', entityId: id, newValues: { loginDisabled }, ip: ctx.ip });
      return { archived: true, loginDisabled };
    });
  }

  restore(ctx: AuthContext, p: Effective, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = await this.loadFor(c, ctx, p, 'workers.delete', id, true);
      if (!w.archived_at) throw conflict('This worker is not archived.');
      await c.query(`UPDATE workers SET archived_at = NULL, status = 'active', updated_at = now() WHERE id = $1`, [id]);
      if (w.user_id) await c.query(`UPDATE users SET status='active', updated_at=now() WHERE id=$1`, [w.user_id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.restore', entity: 'worker', entityId: id, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  // ----- 4C: service mapping (managers/owners only: a barber can't grant themselves skills) -----
  setServices(ctx: AuthContext, p: Effective, id: string, serviceIds: string[]) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = await this.loadFor(c, ctx, p, 'workers.update', id, true);
      if (w.archived_at) throw conflict('This worker is archived.');
      await c.query('DELETE FROM worker_services WHERE worker_id=$1', [id]);
      const ids = [...new Set(serviceIds)];
      if (ids.length) {
        const r = await c.query(`INSERT INTO worker_services (worker_id, service_id, shop_id) SELECT $1, s.id, $2 FROM services s WHERE s.id = ANY($3::uuid[]) AND s.archived_at IS NULL`, [id, ctx.shopId, ids]);
        if (r.rowCount !== ids.length) throw bad('One or more services do not exist.'); // whole request rolls back
      }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.services.update', entity: 'worker', entityId: id, oldValues: { serviceIds: w.service_ids }, newValues: { serviceIds: ids }, ip: ctx.ip });
      return this.fresh(c, id);
    });
  }

  // ----- 4C: weekly availability (own scope allowed for one's own profile) -----
  availability(ctx: AuthContext, p: Effective, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => { await this.loadFor(c, ctx, p, 'workers.view', id); return this.readAvailability(c, ctx.shopId!, id); });
  }

  setAvailability(ctx: AuthContext, p: Effective, id: string, body: { useShopHours: true } | { days: any[] }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w = await this.loadFor(c, ctx, p, 'workers.update', id);
      if (w.archived_at) throw conflict('This worker is archived.');
      const old = (await this.readAvailability(c, ctx.shopId!, id)).days;
      let days: { weekday: number; isWorking: boolean; startTime?: string | null; endTime?: string | null; breakStart?: string | null; breakEnd?: string | null }[];
      if ('useShopHours' in body) {
        const sh = (await c.query('SELECT weekday, is_closed, open_time::text o, close_time::text e FROM shop_hours WHERE shop_id=$1 ORDER BY weekday', [ctx.shopId])).rows;
        if (sh.length !== 7) throw bad("Set the shop's business hours first, then copy them.");
        days = sh.map((h) => ({ weekday: h.weekday, isWorking: !h.is_closed, startTime: h.is_closed ? null : hhmm(h.o), endTime: h.is_closed ? null : hhmm(h.e) })); // a copy, not a live link
      } else days = body.days;
      await c.query('DELETE FROM worker_availability WHERE worker_id=$1', [id]);
      await c.query(
        `INSERT INTO worker_availability (worker_id, shop_id, weekday, is_working, start_time, end_time, break_start, break_end)
         SELECT $1, $2, x.d, x.w, x.s::time, x.e::time, x.bs::time, x.be::time FROM unnest($3::int[], $4::bool[], $5::text[], $6::text[], $7::text[], $8::text[]) AS x(d, w, s, e, bs, be)`,
        [id, ctx.shopId, days.map((d) => d.weekday), days.map((d) => d.isWorking), days.map((d) => (d.isWorking ? d.startTime : null)), days.map((d) => (d.isWorking ? d.endTime : null)),
          days.map((d) => (d.isWorking ? d.breakStart ?? null : null)), days.map((d) => (d.isWorking ? d.breakEnd ?? null : null))]);
      const now = await this.readAvailability(c, ctx.shopId!, id);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.availability.update', entity: 'worker', entityId: id, oldValues: old, newValues: now.days, ip: ctx.ip });
      return now;
    });
  }

  private async readAvailability(c: PoolClient, shopId: string, workerId: string) {
    const rows = (await c.query('SELECT weekday, is_working, start_time::text s, end_time::text e, break_start::text bs, break_end::text be FROM worker_availability WHERE worker_id=$1 ORDER BY weekday', [workerId])).rows;
    const days = rows.map((r) => ({ weekday: r.weekday, isWorking: r.is_working, startTime: hhmm(r.s), endTime: hhmm(r.e), breakStart: hhmm(r.bs), breakEnd: hhmm(r.be) }));
    // Advisory only: the booking engine always intersects with shop hours.
    const sh = new Map((await c.query('SELECT weekday, is_closed, open_time::text o, close_time::text e FROM shop_hours WHERE shop_id=$1', [shopId])).rows.map((h) => [h.weekday, h]));
    const warnings: { weekday: number; issue: string }[] = [];
    for (const d of days) {
      if (!d.isWorking) continue;
      const h = sh.get(d.weekday);
      if (!h || h.is_closed) warnings.push({ weekday: d.weekday, issue: 'shop_closed' });
      else if (toMinutes(d.startTime!) < toMinutes(h.o) || toMinutes(d.endTime!) > toMinutes(h.e)) warnings.push({ weekday: d.weekday, issue: 'outside_shop_hours' });
    }
    return { days, warnings };
  }

  // ----- 4C: time off -----
  timeOff(ctx: AuthContext, p: Effective, id: string, q: { from?: Date; to?: Date }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await this.loadFor(c, ctx, p, 'workers.view', id);
      const rows = (await c.query(
        `SELECT id, start_at, end_at, reason FROM worker_time_off WHERE worker_id=$1 AND end_at >= COALESCE($2::timestamptz, now()) AND ($3::timestamptz IS NULL OR start_at <= $3) ORDER BY start_at`, [id, q.from ?? null, q.to ?? null])).rows;
      return rows.map((r) => ({ id: r.id, startAt: r.start_at, endAt: r.end_at, reason: r.reason }));
    });
  }
  addTimeOff(ctx: AuthContext, p: Effective, id: string, dto: { startAt: Date; endAt: Date; reason?: string }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await this.loadFor(c, ctx, p, 'workers.update', id);
      const r = (await c.query('INSERT INTO worker_time_off (shop_id, worker_id, start_at, end_at, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, start_at, end_at, reason', [ctx.shopId, id, dto.startAt, dto.endAt, dto.reason ?? null, ctx.userId])).rows[0];
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.timeoff.create', entity: 'worker', entityId: id, newValues: { timeOffId: r.id, startAt: dto.startAt, endAt: dto.endAt, reason: dto.reason ?? null }, ip: ctx.ip });
      return { id: r.id, startAt: r.start_at, endAt: r.end_at, reason: r.reason };
    });
  }
  removeTimeOff(ctx: AuthContext, p: Effective, id: string, timeOffId: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await this.loadFor(c, ctx, p, 'workers.update', id);
      const r = (await c.query('DELETE FROM worker_time_off WHERE id=$1 AND worker_id=$2 RETURNING start_at, end_at', [timeOffId, id])).rows[0];
      if (!r) throw nf('Time off entry');
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'worker.timeoff.delete', entity: 'worker', entityId: id, oldValues: { timeOffId, startAt: r.start_at, endAt: r.end_at }, ip: ctx.ip });
      return { deleted: true };
    });
  }

  private photoTarget(id: string) { return { kind: 'worker_photo' as const, table: 'workers' as const, column: 'photo_file_id' as const, rowId: id, entity: 'worker', auditPrefix: 'worker.photo' }; }
  async photo(ctx: AuthContext, p: Effective, id: string, buf: Buffer) {
    await this.db.tenant({ shopId: ctx.shopId }, (c) => this.loadFor(c, ctx, p, 'workers.update', id, true));
    return this.files.replace(this.db, ctx, this.photoTarget(id), buf);
  }
  async removePhoto(ctx: AuthContext, p: Effective, id: string) {
    await this.db.tenant({ shopId: ctx.shopId }, (c) => this.loadFor(c, ctx, p, 'workers.update', id, true));
    return this.files.remove(this.db, ctx, this.photoTarget(id));
  }

  private async workerRoleId(c: PoolClient) {
    const r = (await c.query(`SELECT id FROM roles WHERE system_key='worker'`)).rows[0];
    if (!r) throw bad('This shop has no Worker role. Choose roles explicitly.');
    return r.id as string;
  }
}
