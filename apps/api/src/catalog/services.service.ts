import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const nf = (what: string) => new AppException(404, ErrorCodes.NOT_FOUND, `${what} not found.`);
const dup = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);
const FIELDS: Record<string, string> = { name: 'name', categoryId: 'category_id', description: 'description', pricePaise: 'price_paise', durationMin: 'duration_min', status: 'status' };

const out = (r: any) => ({
  id: r.id, name: r.name, categoryId: r.category_id, categoryName: r.category_name ?? null, description: r.description,
  pricePaise: r.price_paise, durationMin: r.duration_min, status: r.status, archived: !!r.archived_at, workerIds: r.worker_ids ?? [],
});
const SELECT = `SELECT s.*, c.name AS category_name,
  COALESCE((SELECT array_agg(ws.worker_id) FROM worker_services ws WHERE ws.service_id = s.id), '{}') AS worker_ids
  FROM services s LEFT JOIN service_categories c ON c.id = s.category_id`;

@Injectable()
export class ServicesService {
  constructor(private db: Db, private audit: AuditService) {}

  // ---------- categories ----------
  listCategories(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) =>
      (await c.query(`SELECT c.id, c.name, c.sort_order AS "sortOrder",
                             (SELECT count(*)::int FROM services s WHERE s.category_id = c.id AND s.archived_at IS NULL) AS "serviceCount"
                        FROM service_categories c ORDER BY c.sort_order, lower(c.name)`)).rows);
  }
  createCategory(ctx: AuthContext, dto: { name: string; sortOrder?: number }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      try {
        const r = (await c.query('INSERT INTO service_categories (shop_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id, name, sort_order AS "sortOrder"', [ctx.shopId, dto.name, dto.sortOrder ?? 0])).rows[0];
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'category.create', entity: 'service_category', entityId: r.id, newValues: dto, ip: ctx.ip });
        return r;
      } catch (e) { throw isUniqueViolation(e) ? dup('A category with this name already exists.') : e; }
    });
  }
  updateCategory(ctx: AuthContext, id: string, dto: { name?: string; sortOrder?: number }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query('SELECT name, sort_order FROM service_categories WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw nf('Category');
      try {
        const r = (await c.query('UPDATE service_categories SET name = COALESCE($2, name), sort_order = COALESCE($3, sort_order) WHERE id=$1 RETURNING id, name, sort_order AS "sortOrder"', [id, dto.name ?? null, dto.sortOrder ?? null])).rows[0];
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'category.update', entity: 'service_category', entityId: id, oldValues: { name: old.name, sortOrder: old.sort_order }, newValues: dto, ip: ctx.ip });
        return r;
      } catch (e) { throw isUniqueViolation(e) ? dup('A category with this name already exists.') : e; }
    });
  }
  deleteCategory(ctx: AuthContext, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cat = (await c.query('SELECT name FROM service_categories WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!cat) throw nf('Category');
      const n = (await c.query('SELECT count(*)::int n FROM services WHERE category_id=$1 AND archived_at IS NULL', [id])).rows[0].n;
      if (n > 0) throw dup(`This category still has ${n} service(s). Move or archive them first.`);
      await c.query('DELETE FROM service_categories WHERE id=$1', [id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'category.delete', entity: 'service_category', entityId: id, oldValues: { name: cat.name }, ip: ctx.ip });
      return { deleted: true };
    });
  }

  // ---------- services ----------
  list(ctx: AuthContext, q: { q?: string; categoryId?: string; status?: string; includeArchived: boolean; page: number; limit: number }) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = [], p: unknown[] = [];
      const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)); };
      if (!q.includeArchived) w.push('s.archived_at IS NULL');
      if (q.q) add('s.name ILIKE ?', `%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
      if (q.categoryId) add('s.category_id = ?', q.categoryId);
      if (q.status) add('s.status = ?', q.status);
      const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
      const total = (await c.query(`SELECT count(*)::int n FROM services s ${where}`, p)).rows[0].n;
      const rows = (await c.query(`${SELECT} ${where} ORDER BY c.sort_order NULLS LAST, lower(s.name) LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, p)).rows;
      return { items: rows.map(out), page: q.page, limit: q.limit, total };
    });
  }

  get(ctx: AuthContext, id: string) { return this.db.tenant({ shopId: ctx.shopId }, async (c) => out(await this.load(c, id))); }

  create(ctx: AuthContext, dto: any) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await this.assertCategory(c, dto.categoryId);
      let id: string;
      try {
        id = (await c.query(
          `INSERT INTO services (shop_id, category_id, name, description, price_paise, duration_min, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.shopId, dto.categoryId ?? null, dto.name, dto.description ?? null, dto.pricePaise, dto.durationMin, dto.status])).rows[0].id;
      } catch (e) { throw isUniqueViolation(e) ? dup('A service with this name already exists.') : e; }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'service.create', entity: 'service', entityId: id, newValues: dto, ip: ctx.ip });
      return out(await this.load(c, id));
    });
  }

  update(ctx: AuthContext, id: string, dto: Record<string, unknown>) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query('SELECT * FROM services WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw nf('Service');
      if (old.archived_at) throw dup('This service is archived. Restore it first.');
      if ('categoryId' in dto) await this.assertCategory(c, dto.categoryId as string | null);
      const sets: string[] = [], vals: unknown[] = [id], before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dto)) {
        const col = FIELDS[k];
        if (!col || v === undefined || old[col] === v) continue;
        vals.push(v); sets.push(`${col} = $${vals.length}`); before[k] = old[col]; after[k] = v;
      }
      if (sets.length) {
        try { await c.query(`UPDATE services SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals); }
        catch (e) { throw isUniqueViolation(e) ? dup('A service with this name already exists.') : e; }
        // Price history: old/new live here and in appointment snapshots; old bills never read services.price_paise.
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'service.update', entity: 'service', entityId: id, oldValues: before, newValues: after, ip: ctx.ip });
      }
      return out(await this.load(c, id));
    });
  }

  archive(ctx: AuthContext, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const s = (await c.query('SELECT archived_at FROM services WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw nf('Service');
      if (s.archived_at) throw dup('This service is already archived.');
      await c.query(`UPDATE services SET archived_at = now(), status = 'inactive', updated_at = now() WHERE id=$1`, [id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'service.archive', entity: 'service', entityId: id, ip: ctx.ip });
      return { archived: true };
    });
  }

  restore(ctx: AuthContext, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const s = (await c.query('SELECT archived_at FROM services WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw nf('Service');
      if (!s.archived_at) throw dup('This service is not archived.');
      try { await c.query(`UPDATE services SET archived_at = NULL, status = 'active', updated_at = now() WHERE id=$1`, [id]); }
      catch (e) { throw isUniqueViolation(e) ? dup('Another active service already uses this name. Rename one first.') : e; }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'service.restore', entity: 'service', entityId: id, ip: ctx.ip });
      return out(await this.load(c, id));
    });
  }

  /** Replace the set of workers who can perform this service (the reverse side of PUT /workers/:id/services). */
  setWorkers(ctx: AuthContext, id: string, workerIds: string[]) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const s = await this.load(c, id);
      if (s.archived_at) throw dup('This service is archived. Restore it first.');
      await c.query('DELETE FROM worker_services WHERE service_id=$1', [id]);
      const ids = [...new Set(workerIds)];
      if (ids.length) {
        const r = await c.query(`INSERT INTO worker_services (worker_id, service_id, shop_id) SELECT w.id, $1, $2 FROM workers w WHERE w.id = ANY($3::uuid[]) AND w.archived_at IS NULL`, [id, ctx.shopId, ids]);
        if (r.rowCount !== ids.length) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'One or more workers do not exist.'); // whole request rolls back
      }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'service.workers.update', entity: 'service', entityId: id, oldValues: { workerIds: s.worker_ids }, newValues: { workerIds: ids }, ip: ctx.ip });
      return out(await this.load(c, id));
    });
  }

  private async load(c: PoolClient, id: string) {
    const r = (await c.query(`${SELECT} WHERE s.id = $1`, [id])).rows[0];
    if (!r) throw nf('Service');
    return r;
  }
  private async assertCategory(c: PoolClient, id?: string | null) {
    if (!id) return;
    if (!(await c.query('SELECT 1 FROM service_categories WHERE id=$1', [id])).rowCount) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'That category does not exist.');
  }
}
