import { Injectable } from '@nestjs/common';
import { CustomerItem, ErrorCodes, Paginated } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { normalizePhone } from '../auth/phone';
import { loadConfig } from '../config';

const notFound = (m = 'Customer not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const conflict = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);

@Injectable()
export class CustomersService {
  private cfg = loadConfig();
  constructor(private db: Db, private audit: AuditService) {}

  // ==================== STAFF: LIST & SEARCH ====================

  async list(
    ctx: AuthContext,
    p: Effective,
    q: { q?: string; preferredWorkerId?: string; page: number; limit: number }
  ): Promise<Paginated<CustomerItem>> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const scope = p.isOwner ? 'all' : (p.map.get('customers.view') ?? 'own');
      const conditions = ['c.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (scope === 'own') {
        // Find worker ID for current user
        const workerId = (await c.query(`SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`, [ctx.userId, ctx.shopId])).rows[0]?.id;
        if (!workerId) {
          return { items: [], page: q.page, limit: q.limit, total: 0 };
        }
        params.push(workerId);
        conditions.push(`c.preferred_worker_id = $${params.length}`);
      } else if (q.preferredWorkerId) {
        params.push(q.preferredWorkerId);
        conditions.push(`c.preferred_worker_id = $${params.length}`);
      }

      if (q.q) {
        params.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`);
        conditions.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
      }

      const whereClause = conditions.join(' AND ');
      const total = Number((await c.query(`SELECT count(*)::int n FROM customers c WHERE ${whereClause}`, params)).rows[0].n);

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit);
      params.push(offset);

      const rows = (await c.query(
        `SELECT c.id, c.user_id, c.name, c.phone, c.email, c.preferred_worker_id,
                w.display_name AS preferred_worker_name, c.notes, c.created_at, c.updated_at
         FROM customers c
         LEFT JOIN workers w ON w.id = c.preferred_worker_id
         WHERE ${whereClause}
         ORDER BY c.name ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      )).rows;

      return {
        items: rows.map((r) => this.mapCustomerRow(r)),
        page: q.page,
        limit: q.limit,
        total,
      };
    });
  }

  get(ctx: AuthContext, p: Effective, id: string): Promise<CustomerItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const scope = p.isOwner ? 'all' : (p.map.get('customers.view') ?? 'own');
      const conditions = ['c.id = $1', 'c.shop_id = $2'];
      const params: unknown[] = [id, ctx.shopId];

      if (scope === 'own') {
        const workerId = (await c.query(`SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`, [ctx.userId, ctx.shopId])).rows[0]?.id;
        if (!workerId) throw notFound();
        params.push(workerId);
        conditions.push(`c.preferred_worker_id = $${params.length}`);
      }

      const row = (await c.query(
        `SELECT c.id, c.user_id, c.name, c.phone, c.email, c.preferred_worker_id,
                w.display_name AS preferred_worker_name, c.notes, c.created_at, c.updated_at
         FROM customers c
         LEFT JOIN workers w ON w.id = c.preferred_worker_id
         WHERE ${conditions.join(' AND ')}`,
        params
      )).rows[0];

      if (!row) throw notFound();
      return this.mapCustomerRow(row);
    });
  }

  create(
    ctx: AuthContext,
    dto: { name: string; phone: string; email?: string | null; preferredWorkerId?: string | null; notes?: string | null }
  ): Promise<CustomerItem> {
    const phone = normalizePhone(dto.phone, this.cfg.DEFAULT_COUNTRY_CODE);
    if (!phone) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'Invalid mobile number format.');

    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Find matching global user account if registered
      const matchedUserId = (await c.query(`SELECT id FROM users WHERE phone = $1`, [phone])).rows[0]?.id ?? null;

      // Check preferred worker validity if provided
      if (dto.preferredWorkerId) {
        const pw = (await c.query(`SELECT id FROM workers WHERE id = $1 AND shop_id = $2`, [dto.preferredWorkerId, ctx.shopId])).rows[0];
        if (!pw) throw notFound('Preferred barber not found.');
      }

      try {
        const res = await c.query(
          `INSERT INTO customers (shop_id, user_id, name, phone, email, preferred_worker_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [ctx.shopId, matchedUserId, dto.name, phone, dto.email?.toLowerCase() ?? null, dto.preferredWorkerId ?? null, dto.notes ?? null]
        );
        const row = res.rows[0];

        await this.audit.log(c, {
          shopId: ctx.shopId,
          userId: ctx.userId,
          action: 'customer.create',
          entity: 'customer',
          entityId: row.id,
          newValues: { name: row.name, phone: row.phone },
          ip: ctx.ip,
        });

        return this.get(ctx, { isOwner: true, map: new Map() }, row.id);
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw conflict('A customer with this phone number already exists in this shop.');
        }
        throw e;
      }
    });
  }

  update(
    ctx: AuthContext,
    id: string,
    dto: { name?: string; phone?: string; email?: string | null; preferredWorkerId?: string | null; notes?: string | null }
  ): Promise<CustomerItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound();

      if (dto.preferredWorkerId) {
        const pw = (await c.query(`SELECT id FROM workers WHERE id = $1 AND shop_id = $2`, [dto.preferredWorkerId, ctx.shopId])).rows[0];
        if (!pw) throw notFound('Preferred barber not found.');
      }

      const sets: string[] = [];
      const vals: unknown[] = [id, ctx.shopId];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      if (dto.name !== undefined && dto.name !== old.name) {
        vals.push(dto.name);
        sets.push(`name = $${vals.length}`);
        before.name = old.name;
        after.name = dto.name;
      }
      if (dto.phone !== undefined) {
        const norm = normalizePhone(dto.phone, this.cfg.DEFAULT_COUNTRY_CODE);
        if (norm && norm !== old.phone) {
          vals.push(norm);
          sets.push(`phone = $${vals.length}`);
          before.phone = old.phone;
          after.phone = norm;
        }
      }
      if (dto.email !== undefined && dto.email !== old.email) {
        vals.push(dto.email?.toLowerCase() ?? null);
        sets.push(`email = $${vals.length}`);
        before.email = old.email;
        after.email = dto.email;
      }
      if (dto.preferredWorkerId !== undefined && dto.preferredWorkerId !== old.preferred_worker_id) {
        vals.push(dto.preferredWorkerId);
        sets.push(`preferred_worker_id = $${vals.length}`);
        before.preferredWorkerId = old.preferred_worker_id;
        after.preferredWorkerId = dto.preferredWorkerId;
      }
      if (dto.notes !== undefined && dto.notes !== old.notes) {
        vals.push(dto.notes);
        sets.push(`notes = $${vals.length}`);
        before.notes = old.notes;
        after.notes = dto.notes;
      }

      if (sets.length) {
        sets.push('updated_at = now()');
        try {
          await c.query(`UPDATE customers SET ${sets.join(', ')} WHERE id = $1 AND shop_id = $2`, vals);
          await this.audit.log(c, {
            shopId: ctx.shopId,
            userId: ctx.userId,
            action: 'customer.update',
            entity: 'customer',
            entityId: id,
            oldValues: before,
            newValues: after,
            ip: ctx.ip,
          });
        } catch (e) {
          if (isUniqueViolation(e)) throw conflict('A customer with this phone number already exists.');
          throw e;
        }
      }

      return this.get(ctx, { isOwner: true, map: new Map() }, id);
    });
  }

  delete(ctx: AuthContext, id: string): Promise<{ deleted: boolean }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT id, name FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound();

      await c.query(`DELETE FROM customers WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'customer.delete',
        entity: 'customer',
        entityId: id,
        oldValues: { name: old.name },
        ip: ctx.ip,
      });

      return { deleted: true };
    });
  }

  // ==================== CUSTOMER SELF PROFILE ====================

  async myProfile(ctx: AuthContext): Promise<CustomerItem[]> {
    const res = await this.db.query(
      `SELECT c.id, c.user_id, c.name, c.phone, c.email, c.preferred_worker_id,
              w.display_name AS preferred_worker_name, c.notes, c.created_at, c.updated_at
       FROM customers c
       LEFT JOIN workers w ON w.id = c.preferred_worker_id
       WHERE c.user_id = $1`,
      [ctx.userId]
    );
    return res.rows.map((r) => this.mapCustomerRow(r));
  }

  private mapCustomerRow(r: any): CustomerItem {
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      preferredWorkerId: r.preferred_worker_id,
      preferredWorkerName: r.preferred_worker_name ?? null,
      notes: r.notes,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
