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

const nf = (what = 'Worker') => new AppException(404, ErrorCodes.NOT_FOUND, `${what} not found.`);
const conflict = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);
const bad = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

const SELECT = `SELECT w.*, u.phone AS login_phone, u.email AS login_email, u.status AS login_status, sh.slug
  FROM workers w LEFT JOIN users u ON u.id = w.user_id JOIN shops sh ON sh.id = w.shop_id`;
const out = (r: any) => ({
  id: r.id, displayName: r.display_name, status: r.status, archived: !!r.archived_at, userId: r.user_id,
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
