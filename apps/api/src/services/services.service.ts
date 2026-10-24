import { Injectable } from '@nestjs/common';
import { ErrorCodes, ServiceCategory, ServiceItem } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Service or category not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const conflict = (m: string) => new AppException(409, ErrorCodes.CONFLICT, m);

@Injectable()
export class ServicesService {
  constructor(private db: Db, private audit: AuditService) {}

  // ==================== CATEGORIES ====================

  listCategories(ctx: AuthContext): Promise<ServiceCategory[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const res = await c.query(
        `SELECT id, name, display_order, is_active, created_at
         FROM service_categories
         WHERE shop_id = $1
         ORDER BY display_order ASC, name ASC`,
        [ctx.shopId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        displayOrder: r.display_order,
        isActive: r.is_active,
        createdAt: r.created_at.toISOString(),
      }));
    });
  }

  createCategory(ctx: AuthContext, dto: { name: string; displayOrder?: number }): Promise<ServiceCategory> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      try {
        const res = await c.query(
          `INSERT INTO service_categories (shop_id, name, display_order)
           VALUES ($1, $2, COALESCE($3, 0))
           RETURNING id, name, display_order, is_active, created_at`,
          [ctx.shopId, dto.name, dto.displayOrder]
        );
        const cat = res.rows[0];
        await this.audit.log(c, {
          shopId: ctx.shopId,
          userId: ctx.userId,
          action: 'service_category.create',
          entity: 'service_category',
          entityId: cat.id,
          newValues: { name: cat.name, displayOrder: cat.display_order },
          ip: ctx.ip,
        });
        return {
          id: cat.id,
          name: cat.name,
          displayOrder: cat.display_order,
          isActive: cat.is_active,
          createdAt: cat.created_at.toISOString(),
        };
      } catch (e) {
        if (isUniqueViolation(e)) throw conflict('A category with this name already exists.');
        throw e;
      }
    });
  }

  updateCategory(
    ctx: AuthContext,
    id: string,
    dto: { name?: string; displayOrder?: number; isActive?: boolean }
  ): Promise<ServiceCategory> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM service_categories WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound('Category not found.');

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
      if (dto.displayOrder !== undefined && dto.displayOrder !== old.display_order) {
        vals.push(dto.displayOrder);
        sets.push(`display_order = $${vals.length}`);
        before.displayOrder = old.display_order;
        after.displayOrder = dto.displayOrder;
      }
      if (dto.isActive !== undefined && dto.isActive !== old.is_active) {
        vals.push(dto.isActive);
        sets.push(`is_active = $${vals.length}`);
        before.isActive = old.is_active;
        after.isActive = dto.isActive;
      }

      if (sets.length) {
        try {
          await c.query(`UPDATE service_categories SET ${sets.join(', ')} WHERE id = $1 AND shop_id = $2`, vals);
          await this.audit.log(c, {
            shopId: ctx.shopId,
            userId: ctx.userId,
            action: 'service_category.update',
            entity: 'service_category',
            entityId: id,
            oldValues: before,
            newValues: after,
            ip: ctx.ip,
          });
        } catch (e) {
          if (isUniqueViolation(e)) throw conflict('A category with this name already exists.');
          throw e;
        }
      }

      const updated = (await c.query(`SELECT * FROM service_categories WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId])).rows[0];
      return {
        id: updated.id,
        name: updated.name,
        displayOrder: updated.display_order,
        isActive: updated.is_active,
        createdAt: updated.created_at.toISOString(),
      };
    });
  }

  deleteCategory(ctx: AuthContext, id: string): Promise<{ deleted: boolean }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM service_categories WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound('Category not found.');

      await c.query(`DELETE FROM service_categories WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'service_category.delete',
        entity: 'service_category',
        entityId: id,
        oldValues: { name: old.name },
        ip: ctx.ip,
      });
      return { deleted: true };
    });
  }

  // ==================== SERVICES ====================

  listServices(ctx: AuthContext, filter?: { categoryId?: string; activeOnly?: boolean }): Promise<ServiceItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const conditions = ['s.shop_id = $1'];
      const params: unknown[] = [ctx.shopId];

      if (filter?.categoryId) {
        params.push(filter.categoryId);
        conditions.push(`s.category_id = $${params.length}`);
      }
      if (filter?.activeOnly) {
        conditions.push(`s.is_active = true`);
      }

      const res = await c.query(
        `SELECT s.id, s.category_id, sc.name AS category_name, s.name, s.description,
                s.price_paise, s.duration_minutes, s.is_active, s.created_at, s.updated_at
         FROM services s
         LEFT JOIN service_categories sc ON sc.id = s.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY COALESCE(sc.display_order, 9999), s.name ASC`,
        params
      );
      return res.rows.map((r) => this.mapServiceRow(r));
    });
  }

  getService(ctx: AuthContext, id: string): Promise<ServiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const res = await c.query(
        `SELECT s.id, s.category_id, sc.name AS category_name, s.name, s.description,
                s.price_paise, s.duration_minutes, s.is_active, s.created_at, s.updated_at
         FROM services s
         LEFT JOIN service_categories sc ON sc.id = s.category_id
         WHERE s.id = $1 AND s.shop_id = $2`,
        [id, ctx.shopId]
      );
      if (!res.rows[0]) throw notFound('Service not found.');
      return this.mapServiceRow(res.rows[0]);
    });
  }

  createService(
    ctx: AuthContext,
    dto: { categoryId?: string | null; name: string; description?: string | null; pricePaise: number; durationMinutes: number }
  ): Promise<ServiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      if (dto.categoryId) {
        const cat = (await c.query(`SELECT id FROM service_categories WHERE id = $1 AND shop_id = $2`, [dto.categoryId, ctx.shopId])).rows[0];
        if (!cat) throw notFound('Category does not exist.');
      }

      const res = await c.query(
        `INSERT INTO services (shop_id, category_id, name, description, price_paise, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [ctx.shopId, dto.categoryId ?? null, dto.name, dto.description ?? null, dto.pricePaise, dto.durationMinutes]
      );
      const row = res.rows[0];
      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'service.create',
        entity: 'service',
        entityId: row.id,
        newValues: { name: row.name, pricePaise: row.price_paise, durationMinutes: row.duration_minutes },
        ip: ctx.ip,
      });

      return this.getService(ctx, row.id);
    });
  }

  updateService(
    ctx: AuthContext,
    id: string,
    dto: { categoryId?: string | null; name?: string; description?: string | null; pricePaise?: number; durationMinutes?: number; isActive?: boolean }
  ): Promise<ServiceItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM services WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound('Service not found.');

      if (dto.categoryId) {
        const cat = (await c.query(`SELECT id FROM service_categories WHERE id = $1 AND shop_id = $2`, [dto.categoryId, ctx.shopId])).rows[0];
        if (!cat) throw notFound('Category does not exist.');
      }

      const sets: string[] = [];
      const vals: unknown[] = [id, ctx.shopId];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      const fields: Array<[keyof typeof dto, string]> = [
        ['categoryId', 'category_id'],
        ['name', 'name'],
        ['description', 'description'],
        ['pricePaise', 'price_paise'],
        ['durationMinutes', 'duration_minutes'],
        ['isActive', 'is_active'],
      ];

      for (const [k, col] of fields) {
        if (dto[k] !== undefined && dto[k] !== old[col]) {
          vals.push(dto[k]);
          sets.push(`${col} = $${vals.length}`);
          before[k] = old[col];
          after[k] = dto[k];
        }
      }

      if (sets.length) {
        sets.push(`updated_at = now()`);
        await c.query(`UPDATE services SET ${sets.join(', ')} WHERE id = $1 AND shop_id = $2`, vals);
        await this.audit.log(c, {
          shopId: ctx.shopId,
          userId: ctx.userId,
          action: 'service.update',
          entity: 'service',
          entityId: id,
          oldValues: before,
          newValues: after,
          ip: ctx.ip,
        });
      }

      return this.getService(ctx, id);
    });
  }

  deleteService(ctx: AuthContext, id: string): Promise<{ deleted: boolean }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query(`SELECT * FROM services WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [id, ctx.shopId])).rows[0];
      if (!old) throw notFound('Service not found.');

      await c.query(`DELETE FROM services WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);
      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'service.delete',
        entity: 'service',
        entityId: id,
        oldValues: { name: old.name },
        ip: ctx.ip,
      });
      return { deleted: true };
    });
  }

  // ==================== PUBLIC CUSTOMER FACING ====================

  publicList(slug: string): Promise<{ categories: ServiceCategory[]; services: ServiceItem[] }> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query(`SELECT id FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found.');

      const catRows = (await c.query(
        `SELECT id, name, display_order, is_active, created_at
         FROM service_categories
         WHERE shop_id = $1 AND is_active = true
         ORDER BY display_order ASC, name ASC`,
        [shop.id]
      )).rows;

      const svcRows = (await c.query(
        `SELECT s.id, s.category_id, sc.name AS category_name, s.name, s.description,
                s.price_paise, s.duration_minutes, s.is_active, s.created_at, s.updated_at
         FROM services s
         LEFT JOIN service_categories sc ON sc.id = s.category_id
         WHERE s.shop_id = $1 AND s.is_active = true
         ORDER BY COALESCE(sc.display_order, 9999), s.name ASC`,
        [shop.id]
      )).rows;

      return {
        categories: catRows.map((r) => ({
          id: r.id,
          name: r.name,
          displayOrder: r.display_order,
          isActive: r.is_active,
          createdAt: r.created_at.toISOString(),
        })),
        services: svcRows.map((r) => this.mapServiceRow(r)),
      };
    });
  }

  private mapServiceRow(r: any): ServiceItem {
    return {
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.category_name ?? null,
      name: r.name,
      description: r.description,
      pricePaise: r.price_paise,
      durationMinutes: r.duration_minutes,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    };
  }
}
