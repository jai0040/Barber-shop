import { Injectable } from '@nestjs/common';
import { CustomerLoyaltySummary, ErrorCodes, LoyaltySettings, LoyaltyTransaction } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';

const notFound = (m = 'Customer or settings not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

@Injectable()
export class LoyaltyService {
  constructor(private db: Db, private audit: AuditService) {}

  async getSettings(shopId: string): Promise<LoyaltySettings> {
    return this.db.tenant({ shopId }, async (c) => {
      let row = (await c.query(`SELECT * FROM loyalty_settings WHERE shop_id = $1`, [shopId])).rows[0];
      if (!row) {
        // Initialize defaults: 1 point per Rs 100 spent (10000 paise), 1 point = Rs 1 discount (100 paise), min 50 pts, max 50% discount
        row = (
          await c.query(
            `INSERT INTO loyalty_settings (shop_id, is_enabled, earn_per_rupee_paise, point_value_paise, min_redeem_points, max_discount_percentage)
             VALUES ($1, true, 10000, 100, 50, 50)
             ON CONFLICT (shop_id) DO UPDATE SET updated_at = now()
             RETURNING *`,
            [shopId]
          )
        ).rows[0];
      }

      return {
        id: row.id,
        shopId: row.shop_id,
        isEnabled: row.is_enabled,
        earnPerRupeePaise: row.earn_per_rupee_paise,
        pointValuePaise: row.point_value_paise,
        minRedeemPoints: row.min_redeem_points,
        maxDiscountPercentage: row.max_discount_percentage,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  async updateSettings(
    ctx: AuthContext,
    dto: {
      isEnabled?: boolean;
      earnPerRupeePaise?: number;
      pointValuePaise?: number;
      minRedeemPoints?: number;
      maxDiscountPercentage?: number;
    }
  ): Promise<LoyaltySettings> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Ensure exists first
      await this.getSettings(ctx.shopId!);

      const current = (await c.query(`SELECT * FROM loyalty_settings WHERE shop_id = $1 FOR UPDATE`, [ctx.shopId])).rows[0];

      const isEnabled = dto.isEnabled ?? current.is_enabled;
      const earnPerRupeePaise = dto.earnPerRupeePaise ?? current.earn_per_rupee_paise;
      const pointValuePaise = dto.pointValuePaise ?? current.point_value_paise;
      const minRedeemPoints = dto.minRedeemPoints ?? current.min_redeem_points;
      const maxDiscountPercentage = dto.maxDiscountPercentage ?? current.max_discount_percentage;

      const updated = (
        await c.query(
          `UPDATE loyalty_settings
           SET is_enabled = $1, earn_per_rupee_paise = $2, point_value_paise = $3,
               min_redeem_points = $4, max_discount_percentage = $5, updated_at = now()
           WHERE shop_id = $6
           RETURNING *`,
          [isEnabled, earnPerRupeePaise, pointValuePaise, minRedeemPoints, maxDiscountPercentage, ctx.shopId]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'loyalty.settings.update',
        entity: 'loyalty_settings',
        entityId: updated.id,
        oldValues: current,
        newValues: updated,
        ip: ctx.ip,
      });

      return {
        id: updated.id,
        shopId: updated.shop_id,
        isEnabled: updated.is_enabled,
        earnPerRupeePaise: updated.earn_per_rupee_paise,
        pointValuePaise: updated.point_value_paise,
        minRedeemPoints: updated.min_redeem_points,
        maxDiscountPercentage: updated.max_discount_percentage,
        createdAt: updated.created_at.toISOString(),
        updatedAt: updated.updated_at.toISOString(),
      };
    });
  }

  async getCustomerSummary(shopId: string, customerId: string): Promise<CustomerLoyaltySummary> {
    return this.db.tenant({ shopId }, async (c) => {
      return this.loadCustomerSummary(c, shopId, customerId);
    });
  }

  private async loadCustomerSummary(c: any, shopId: string, customerId: string): Promise<CustomerLoyaltySummary> {
    const cust = (await c.query(`SELECT id, name, phone, loyalty_points FROM customers WHERE id = $1 AND shop_id = $2`, [customerId, shopId])).rows[0];
    if (!cust) throw notFound('Customer not found in this shop.');

    const settings = (await c.query(`SELECT * FROM loyalty_settings WHERE shop_id = $1`, [shopId])).rows[0];
    const pointValuePaise = settings ? Number(settings.point_value_paise) : 100;
    const points = Number(cust.loyalty_points || 0);
    const monetaryValuePaise = points * pointValuePaise;

    const txRows = (
      await c.query(
        `SELECT l.*, u.name AS created_by_name
         FROM customer_loyalty_ledger l
         LEFT JOIN users u ON u.id = l.created_by
         WHERE l.customer_id = $1 AND l.shop_id = $2
         ORDER BY l.created_at DESC
         LIMIT 20`,
        [customerId, shopId]
      )
    ).rows;

    const recentTransactions: LoyaltyTransaction[] = txRows.map((t: any) => ({
      id: t.id,
      shopId: t.shop_id,
      customerId: t.customer_id,
      pointsDelta: Number(t.points_delta),
      balanceAfter: Number(t.balance_after),
      type: t.type,
      invoiceId: t.invoice_id,
      notes: t.notes,
      createdByName: t.created_by_name,
      createdAt: t.created_at.toISOString(),
    }));

    return {
      customerId: cust.id,
      customerName: cust.name,
      phone: cust.phone,
      pointsBalance: points,
      monetaryValuePaise,
      recentTransactions,
    };
  }

  async adjustPoints(
    ctx: AuthContext,
    dto: {
      customerId: string;
      pointsDelta: number;
      type: 'manual_adjustment' | 'welcome_bonus' | 'membership_bonus' | 'reversal';
      notes?: string;
    }
  ): Promise<CustomerLoyaltySummary> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cust = (await c.query(`SELECT id, name, phone, loyalty_points FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [dto.customerId, ctx.shopId])).rows[0];
      if (!cust) throw notFound('Customer not found.');

      const currentBalance = Number(cust.loyalty_points || 0);
      const newBalance = currentBalance + dto.pointsDelta;

      if (newBalance < 0) {
        throw badRequest(`Cannot deduct ${Math.abs(dto.pointsDelta)} points; customer only has ${currentBalance} points.`);
      }

      await c.query(`UPDATE customers SET loyalty_points = $1, updated_at = now() WHERE id = $2 AND shop_id = $3`, [newBalance, dto.customerId, ctx.shopId]);

      await c.query(
        `INSERT INTO customer_loyalty_ledger (shop_id, customer_id, points_delta, balance_after, type, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ctx.shopId, dto.customerId, dto.pointsDelta, newBalance, dto.type, dto.notes ?? null, ctx.userId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'loyalty.points.adjust',
        entity: 'customer',
        entityId: dto.customerId,
        oldValues: { points: currentBalance },
        newValues: { points: newBalance, delta: dto.pointsDelta, type: dto.type },
        ip: ctx.ip,
      });

      return this.loadCustomerSummary(c, ctx.shopId!, dto.customerId);
    });
  }
}
