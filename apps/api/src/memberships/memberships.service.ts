import { Injectable } from '@nestjs/common';
import { CustomerMembership, ErrorCodes, MembershipPlan } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Membership plan or subscription not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

@Injectable()
export class MembershipsService {
  constructor(private db: Db, private audit: AuditService) {}

  async createPlan(
    ctx: AuthContext,
    dto: {
      name: string;
      description?: string;
      pricePaise: number;
      durationDays: number;
      discountPercentServices?: number;
      discountPercentProducts?: number;
      pointsMultiplier?: number;
      includedServices?: Array<{ serviceId: string; quantity: number }>;
    }
  ): Promise<MembershipPlan> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const existing = (await c.query(`SELECT id FROM membership_plans WHERE shop_id = $1 AND lower(name) = lower($2)`, [ctx.shopId, dto.name])).rows[0];
      if (existing) throw badRequest(`A membership plan named "${dto.name}" already exists in this shop.`);

      const planRow = (
        await c.query(
          `INSERT INTO membership_plans (
             shop_id, name, description, price_paise, duration_days,
             discount_percent_services, discount_percent_products, points_multiplier, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
           RETURNING *`,
          [
            ctx.shopId,
            dto.name.trim(),
            dto.description ?? null,
            dto.pricePaise,
            dto.durationDays,
            dto.discountPercentServices ?? 0,
            dto.discountPercentProducts ?? 0,
            dto.pointsMultiplier ?? 1.0,
          ]
        )
      ).rows[0];

      if (dto.includedServices && dto.includedServices.length > 0) {
        for (const inc of dto.includedServices) {
          await c.query(
            `INSERT INTO membership_plan_included_services (shop_id, plan_id, service_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [ctx.shopId, planRow.id, inc.serviceId, inc.quantity]
          );
        }
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'membership_plan.create',
        entity: 'membership_plan',
        entityId: planRow.id,
        newValues: dto,
        ip: ctx.ip,
      });

      return this.loadPlan(c, ctx.shopId!, planRow.id);
    });
  }

  async updatePlan(
    ctx: AuthContext,
    planId: string,
    dto: {
      name?: string;
      description?: string | null;
      pricePaise?: number;
      durationDays?: number;
      discountPercentServices?: number;
      discountPercentProducts?: number;
      pointsMultiplier?: number;
      status?: 'active' | 'archived';
      includedServices?: Array<{ serviceId: string; quantity: number }>;
    }
  ): Promise<MembershipPlan> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const current = (await c.query(`SELECT * FROM membership_plans WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [planId, ctx.shopId])).rows[0];
      if (!current) throw notFound();

      if (dto.name && dto.name.toLowerCase() !== current.name.toLowerCase()) {
        const dupe = (await c.query(`SELECT id FROM membership_plans WHERE shop_id = $1 AND lower(name) = lower($2) AND id <> $3`, [ctx.shopId, dto.name, planId])).rows[0];
        if (dupe) throw badRequest(`A membership plan named "${dto.name}" already exists in this shop.`);
      }

      const name = dto.name !== undefined ? dto.name.trim() : current.name;
      const description = dto.description !== undefined ? dto.description : current.description;
      const pricePaise = dto.pricePaise !== undefined ? dto.pricePaise : current.price_paise;
      const durationDays = dto.durationDays !== undefined ? dto.durationDays : current.duration_days;
      const discountPercentServices = dto.discountPercentServices !== undefined ? dto.discountPercentServices : current.discount_percent_services;
      const discountPercentProducts = dto.discountPercentProducts !== undefined ? dto.discountPercentProducts : current.discount_percent_products;
      const pointsMultiplier = dto.pointsMultiplier !== undefined ? dto.pointsMultiplier : current.points_multiplier;
      const status = dto.status !== undefined ? dto.status : current.status;

      await c.query(
        `UPDATE membership_plans
         SET name = $1, description = $2, price_paise = $3, duration_days = $4,
             discount_percent_services = $5, discount_percent_products = $6,
             points_multiplier = $7, status = $8, updated_at = now()
         WHERE id = $9 AND shop_id = $10`,
        [name, description, pricePaise, durationDays, discountPercentServices, discountPercentProducts, pointsMultiplier, status, planId, ctx.shopId]
      );

      if (dto.includedServices !== undefined) {
        await c.query(`DELETE FROM membership_plan_included_services WHERE plan_id = $1 AND shop_id = $2`, [planId, ctx.shopId]);
        for (const inc of dto.includedServices) {
          await c.query(
            `INSERT INTO membership_plan_included_services (shop_id, plan_id, service_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [ctx.shopId, planId, inc.serviceId, inc.quantity]
          );
        }
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'membership_plan.update',
        entity: 'membership_plan',
        entityId: planId,
        oldValues: current,
        newValues: dto,
        ip: ctx.ip,
      });

      return this.loadPlan(c, ctx.shopId!, planId);
    });
  }

  async listPlans(shopId: string, includeArchived = false): Promise<MembershipPlan[]> {
    return this.db.tenant({ shopId }, async (c) => {
      const statusFilter = includeArchived ? `1=1` : `status = 'active'`;
      const planRows = (await c.query(`SELECT * FROM membership_plans WHERE shop_id = $1 AND ${statusFilter} ORDER BY created_at ASC`, [shopId])).rows;

      const results: MembershipPlan[] = [];
      for (const p of planRows) {
        results.push(await this.loadPlan(c, shopId, p.id, p));
      }
      return results;
    });
  }

  async listPublicPlans(slug: string): Promise<MembershipPlan[]> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query(`SELECT id FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found');
      await c.query("SELECT set_config('app.shop_id', $1, true)", [shop.id]);
      const planRows = (await c.query(`SELECT * FROM membership_plans WHERE shop_id = $1 AND status = 'active' ORDER BY price_paise ASC`, [shop.id])).rows;
      const results: MembershipPlan[] = [];
      for (const p of planRows) {
        results.push(await this.loadPlan(c, shop.id, p.id, p));
      }
      return results;
    });
  }

  async getPlan(shopId: string, planId: string): Promise<MembershipPlan> {
    return this.db.tenant({ shopId }, async (c) => {
      return this.loadPlan(c, shopId, planId);
    });
  }

  async assignMembershipToCustomer(
    ctx: AuthContext,
    dto: {
      customerId: string;
      planId: string;
      startDate?: string;
      notes?: string;
    }
  ): Promise<CustomerMembership> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cust = (await c.query(`SELECT id, name, phone FROM customers WHERE id = $1 AND shop_id = $2`, [dto.customerId, ctx.shopId])).rows[0];
      if (!cust) throw notFound('Customer not found in this shop.');

      const plan = (await c.query(`SELECT * FROM membership_plans WHERE id = $1 AND shop_id = $2 AND status = 'active'`, [dto.planId, ctx.shopId])).rows[0];
      if (!plan) throw notFound('Active membership plan not found.');

      // Calculate start and end date
      const startStr = dto.startDate || new Date().toISOString().slice(0, 10);
      const start = new Date(startStr);
      const end = new Date(start);
      end.setDate(end.getDate() + Number(plan.duration_days));
      const endStr = end.toISOString().slice(0, 10);

      // Expire or cancel any existing active membership for this customer
      await c.query(
        `UPDATE customer_memberships
         SET status = 'cancelled', updated_at = now()
         WHERE customer_id = $1 AND shop_id = $2 AND status = 'active'`,
        [dto.customerId, ctx.shopId]
      );

      const memRow = (
        await c.query(
          `INSERT INTO customer_memberships (
             shop_id, customer_id, plan_id, start_date, end_date, status, notes, created_by
           )
           VALUES ($1, $2, $3, $4::date, $5::date, 'active', $6, $7)
           RETURNING *`,
          [ctx.shopId, dto.customerId, dto.planId, startStr, endStr, dto.notes ?? null, ctx.userId]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'customer_membership.assign',
        entity: 'customer_membership',
        entityId: memRow.id,
        newValues: { customerId: dto.customerId, planId: dto.planId, startStr, endStr },
        ip: ctx.ip,
      });

      return this.loadCustomerMembership(c, ctx.shopId!, memRow.id);
    });
  }

  async getActiveCustomerMembership(shopId: string, customerId: string): Promise<CustomerMembership | null> {
    return this.db.tenant({ shopId }, async (c) => {
      const row = (
        await c.query(
          `SELECT cm.id
           FROM customer_memberships cm
           WHERE cm.shop_id = $1
             AND cm.customer_id = $2
             AND cm.status = 'active'
             AND CURRENT_DATE BETWEEN cm.start_date AND cm.end_date
           ORDER BY cm.created_at DESC
           LIMIT 1`,
          [shopId, customerId]
        )
      ).rows[0];

      if (!row) return null;
      return this.loadCustomerMembership(c, shopId, row.id);
    });
  }

  async listCustomerMemberships(shopId: string, customerId: string): Promise<CustomerMembership[]> {
    return this.db.tenant({ shopId }, async (c) => {
      const rows = (
        await c.query(
          `SELECT id FROM customer_memberships WHERE shop_id = $1 AND customer_id = $2 ORDER BY created_at DESC`,
          [shopId, customerId]
        )
      ).rows;

      const list: CustomerMembership[] = [];
      for (const r of rows) {
        list.push(await this.loadCustomerMembership(c, shopId, r.id));
      }
      return list;
    });
  }

  private async loadPlan(c: any, shopId: string, planId: string, cachedPlanRow?: any): Promise<MembershipPlan> {
    const p = cachedPlanRow || (await c.query(`SELECT * FROM membership_plans WHERE id = $1 AND shop_id = $2`, [planId, shopId])).rows[0];
    if (!p) throw notFound();

    const incRows = (
      await c.query(
        `SELECT inc.service_id, inc.quantity, s.name AS service_name
         FROM membership_plan_included_services inc
         JOIN services s ON s.id = inc.service_id
         WHERE inc.plan_id = $1 AND inc.shop_id = $2`,
        [planId, shopId]
      )
    ).rows;

    return {
      id: p.id,
      shopId: p.shop_id,
      name: p.name,
      description: p.description,
      pricePaise: Number(p.price_paise),
      durationDays: Number(p.duration_days),
      discountPercentServices: Number(p.discount_percent_services),
      discountPercentProducts: Number(p.discount_percent_products),
      pointsMultiplier: Number(p.points_multiplier),
      status: p.status,
      includedServices: incRows.map((r: any) => ({
        serviceId: r.service_id,
        serviceName: r.service_name,
        quantity: Number(r.quantity),
      })),
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
    };
  }

  private async loadCustomerMembership(c: any, shopId: string, membershipId: string): Promise<CustomerMembership> {
    const m = (
      await c.query(
        `SELECT cm.*, c.name AS customer_name, c.phone AS customer_phone,
                p.name AS plan_name, p.discount_percent_services, p.discount_percent_products,
                p.points_multiplier, u.name AS created_by_name
         FROM customer_memberships cm
         JOIN customers c ON c.id = cm.customer_id
         JOIN membership_plans p ON p.id = cm.plan_id
         LEFT JOIN users u ON u.id = cm.created_by
         WHERE cm.id = $1 AND cm.shop_id = $2`,
        [membershipId, shopId]
      )
    ).rows[0];

    if (!m) throw notFound('Customer membership record not found.');

    // Calculate included services usage
    const incPlans = (
      await c.query(
        `SELECT inc.service_id, inc.quantity, s.name AS service_name
         FROM membership_plan_included_services inc
         JOIN services s ON s.id = inc.service_id
         WHERE inc.plan_id = $1 AND inc.shop_id = $2`,
        [m.plan_id, shopId]
      )
    ).rows;

    const usages = (
      await c.query(
        `SELECT service_id, count(*)::int AS used
         FROM customer_membership_service_usages
         WHERE customer_membership_id = $1 AND shop_id = $2
         GROUP BY service_id`,
        [membershipId, shopId]
      )
    ).rows;

    const usageMap = new Map<string, number>();
    for (const u of usages) usageMap.set(u.service_id, Number(u.used));

    const includedServicesUsage = incPlans.map((r: any) => {
      const usedCount = usageMap.get(r.service_id) || 0;
      const totalAllowed = Number(r.quantity);
      return {
        serviceId: r.service_id,
        serviceName: r.service_name,
        totalAllowed,
        usedCount,
        remainingCount: Math.max(0, totalAllowed - usedCount),
      };
    });

    return {
      id: m.id,
      shopId: m.shop_id,
      customerId: m.customer_id,
      customerName: m.customer_name,
      customerPhone: m.customer_phone,
      planId: m.plan_id,
      planName: m.plan_name,
      startDate: m.start_date.toISOString().slice(0, 10),
      endDate: m.end_date.toISOString().slice(0, 10),
      status: m.status,
      discountPercentServices: Number(m.discount_percent_services),
      discountPercentProducts: Number(m.discount_percent_products),
      pointsMultiplier: Number(m.points_multiplier),
      invoiceId: m.invoice_id,
      notes: m.notes,
      createdByName: m.created_by_name,
      createdAt: m.created_at.toISOString(),
      updatedAt: m.updated_at.toISOString(),
      includedServicesUsage,
    };
  }
}
