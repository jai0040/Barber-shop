import { Injectable } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes, CouponItem, CouponValidationResult } from '@barbershop/shared';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './coupons.schemas';
import { PoolClient } from 'pg';

const notFound = (m = 'Coupon not found') =>
  new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) =>
  new AppException(400, ErrorCodes.VALIDATION_FAILED, m);
const conflict = (m: string) =>
  new AppException(409, ErrorCodes.CONFLICT, m);

@Injectable()
export class CouponsService {
  constructor(private db: Db, private audit: AuditService) {}

  private mapRow(r: any): CouponItem {
    return {
      id: r.id,
      shopId: r.shop_id,
      code: r.code,
      description: r.description,
      discountType: r.discount_type,
      discountValue: Number(r.discount_value),
      maxDiscountPaise: r.max_discount_paise ? Number(r.max_discount_paise) : null,
      minOrderPaise: Number(r.min_order_paise),
      applicableTo: r.applicable_to,
      maxRedemptionsTotal: r.max_redemptions_total ? Number(r.max_redemptions_total) : null,
      maxRedemptionsPerCustomer: Number(r.max_redemptions_per_customer),
      timesRedeemed: Number(r.times_redeemed),
      validFrom: r.valid_from instanceof Date ? r.valid_from.toISOString() : r.valid_from,
      validUntil: r.valid_until instanceof Date ? r.valid_until.toISOString() : r.valid_until,
      isActive: r.is_active,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    };
  }

  async listCoupons(ctx: AuthContext, activeOnly = false): Promise<CouponItem[]> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      let query = `SELECT * FROM coupons WHERE shop_id = $1`;
      const params: any[] = [ctx.shopId];
      if (activeOnly) {
        query += ` AND is_active = true AND (valid_until IS NULL OR valid_until > now()) AND valid_from <= now()`;
      }
      query += ` ORDER BY created_at DESC`;
      const rows = (await c.query(query, params)).rows;
      return rows.map((r) => this.mapRow(r));
    });
  }

  async getCoupon(ctx: AuthContext, id: string): Promise<CouponItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = (await c.query(`SELECT * FROM coupons WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId])).rows[0];
      if (!r) throw notFound();
      return this.mapRow(r);
    });
  }

  async createCoupon(ctx: AuthContext, dto: CreateCouponDto): Promise<CouponItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      // Check duplicate code
      const existing = (await c.query(`SELECT 1 FROM coupons WHERE shop_id = $1 AND code = $2`, [ctx.shopId, dto.code])).rowCount;
      if (existing) throw conflict(`A coupon with code "${dto.code}" already exists in this shop`);

      const r = (
        await c.query(
          `INSERT INTO coupons (
            shop_id, code, description, discount_type, discount_value,
            max_discount_paise, min_order_paise, applicable_to,
            max_redemptions_total, max_redemptions_per_customer,
            valid_from, valid_until, is_active
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10,
            COALESCE($11, now()), $12, $13
          ) RETURNING *`,
          [
            ctx.shopId,
            dto.code,
            dto.description || null,
            dto.discountType,
            dto.discountValue,
            dto.maxDiscountPaise || null,
            dto.minOrderPaise || 0,
            dto.applicableTo || 'all',
            dto.maxRedemptionsTotal || null,
            dto.maxRedemptionsPerCustomer || 1,
            dto.validFrom || null,
            dto.validUntil || null,
            dto.isActive !== undefined ? dto.isActive : true,
          ]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'coupons.create',
        entity: 'coupon',
        entityId: r.id,
        newValues: r,
      });

      return this.mapRow(r);
    });
  }

  async updateCoupon(ctx: AuthContext, id: string, dto: UpdateCouponDto): Promise<CouponItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cur = (await c.query(`SELECT * FROM coupons WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId])).rows[0];
      if (!cur) throw notFound();

      const r = (
        await c.query(
          `UPDATE coupons SET
            description = COALESCE($1, description),
            discount_type = COALESCE($2, discount_type),
            discount_value = COALESCE($3, discount_value),
            max_discount_paise = CASE WHEN $4::text = 'null' THEN NULL WHEN $4 IS NOT NULL THEN $4::int ELSE max_discount_paise END,
            min_order_paise = COALESCE($5, min_order_paise),
            applicable_to = COALESCE($6, applicable_to),
            max_redemptions_total = CASE WHEN $7::text = 'null' THEN NULL WHEN $7 IS NOT NULL THEN $7::int ELSE max_redemptions_total END,
            max_redemptions_per_customer = COALESCE($8, max_redemptions_per_customer),
            valid_from = COALESCE($9, valid_from),
            valid_until = CASE WHEN $10::text = 'null' THEN NULL WHEN $10 IS NOT NULL THEN $10::timestamptz ELSE valid_until END,
            is_active = COALESCE($11, is_active),
            updated_at = now()
          WHERE id = $12 AND shop_id = $13
          RETURNING *`,
          [
            dto.description !== undefined ? dto.description : null,
            dto.discountType || null,
            dto.discountValue || null,
            dto.maxDiscountPaise === null ? 'null' : (dto.maxDiscountPaise || null),
            dto.minOrderPaise !== undefined ? dto.minOrderPaise : null,
            dto.applicableTo || null,
            dto.maxRedemptionsTotal === null ? 'null' : (dto.maxRedemptionsTotal || null),
            dto.maxRedemptionsPerCustomer || null,
            dto.validFrom || null,
            dto.validUntil === null ? 'null' : (dto.validUntil || null),
            dto.isActive !== undefined ? dto.isActive : null,
            id,
            ctx.shopId,
          ]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'coupons.update',
        entity: 'coupon',
        entityId: id,
        oldValues: cur,
        newValues: r,
      });

      return this.mapRow(r);
    });
  }

  async deleteCoupon(ctx: AuthContext, id: string): Promise<{ success: boolean }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const cur = (await c.query(`SELECT * FROM coupons WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId])).rows[0];
      if (!cur) throw notFound();

      await c.query(`UPDATE coupons SET is_active = false, updated_at = now() WHERE id = $1 AND shop_id = $2`, [id, ctx.shopId]);

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'coupons.deactivate',
        entity: 'coupon',
        entityId: id,
      });

      return { success: true };
    });
  }

  async validateCoupon(ctx: AuthContext, dto: ValidateCouponDto): Promise<CouponValidationResult> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = (
        await c.query(`SELECT * FROM coupons WHERE shop_id = $1 AND code = $2`, [ctx.shopId, dto.code])
      ).rows[0];

      if (!r) {
        return { valid: false, discountPaise: 0, message: `Coupon "${dto.code}" does not exist` };
      }

      const coupon = this.mapRow(r);

      if (!coupon.isActive) {
        return { valid: false, coupon, discountPaise: 0, message: `Coupon "${dto.code}" is no longer active` };
      }

      const now = new Date();
      if (new Date(coupon.validFrom) > now) {
        return { valid: false, coupon, discountPaise: 0, message: `Coupon "${dto.code}" is not yet valid` };
      }

      if (coupon.validUntil && new Date(coupon.validUntil) < now) {
        return { valid: false, coupon, discountPaise: 0, message: `Coupon "${dto.code}" has expired` };
      }

      if (coupon.maxRedemptionsTotal && coupon.timesRedeemed >= coupon.maxRedemptionsTotal) {
        return { valid: false, coupon, discountPaise: 0, message: `Coupon "${dto.code}" has reached its maximum total redemptions limit` };
      }

      if (dto.customerId) {
        const customerUses = (
          await c.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'redemption' THEN 1 WHEN type = 'reversal' THEN -1 ELSE 0 END), 0)::int AS count
             FROM coupon_redemptions WHERE shop_id = $1 AND coupon_id = $2 AND customer_id = $3`,
            [ctx.shopId, coupon.id, dto.customerId]
          )
        ).rows[0].count;

        if (customerUses >= coupon.maxRedemptionsPerCustomer) {
          return {
            valid: false,
            coupon,
            discountPaise: 0,
            message: `You have already redeemed this coupon the maximum allowed times (${coupon.maxRedemptionsPerCustomer})`,
          };
        }
      }

      if (dto.subtotalPaise < coupon.minOrderPaise) {
        return {
          valid: false,
          coupon,
          discountPaise: 0,
          message: `Minimum order amount of Rs ${(coupon.minOrderPaise / 100).toFixed(0)} required to use this coupon`,
        };
      }

      // Calculate applicable base amount
      let basePaise = dto.subtotalPaise;
      if (coupon.applicableTo === 'services') {
        basePaise = dto.servicesTotalPaise || 0;
      } else if (coupon.applicableTo === 'products') {
        basePaise = dto.productsTotalPaise || 0;
      }

      if (basePaise <= 0) {
        return {
          valid: false,
          coupon,
          discountPaise: 0,
          message: `Coupon is only applicable to ${coupon.applicableTo}, but none was found in your order`,
        };
      }

      // Calculate discount amount
      let discountPaise = 0;
      if (coupon.discountType === 'flat') {
        discountPaise = Math.min(basePaise, coupon.discountValue);
      } else {
        // Percentage discount
        const rawDiscount = Math.round((basePaise * coupon.discountValue) / 100);
        discountPaise = coupon.maxDiscountPaise
          ? Math.min(rawDiscount, coupon.maxDiscountPaise)
          : rawDiscount;
        discountPaise = Math.min(basePaise, discountPaise);
      }

      return {
        valid: true,
        coupon,
        discountPaise,
        message: `Coupon "${coupon.code}" applied successfully! Saved Rs ${(discountPaise / 100).toFixed(2)}`,
      };
    });
  }

  // Internal helper for BillingService
  async recordRedemption(
    c: PoolClient,
    shopId: string,
    couponId: string,
    invoiceId: string,
    customerId: string | null,
    discountPaise: number
  ): Promise<void> {
    await c.query(
      `INSERT INTO coupon_redemptions (shop_id, coupon_id, invoice_id, customer_id, type, discount_paise)
       VALUES ($1, $2, $3, $4, 'redemption', $5)`,
      [shopId, couponId, invoiceId, customerId || null, discountPaise]
    );

    await c.query(
      `UPDATE coupons SET times_redeemed = times_redeemed + 1, updated_at = now()
       WHERE id = $1 AND shop_id = $2`,
      [couponId, shopId]
    );
  }

  // Internal helper for BillingService (reversal when invoice is voided)
  async rollbackRedemption(
    c: PoolClient,
    shopId: string,
    couponId: string,
    invoiceId: string,
    customerId: string | null,
    discountPaise: number
  ): Promise<void> {
    await c.query(
      `INSERT INTO coupon_redemptions (shop_id, coupon_id, invoice_id, customer_id, type, discount_paise)
       VALUES ($1, $2, $3, $4, 'reversal', $5)`,
      [shopId, couponId, invoiceId, customerId || null, -discountPaise]
    );

    await c.query(
      `UPDATE coupons SET times_redeemed = GREATEST(0, times_redeemed - 1), updated_at = now()
       WHERE id = $1 AND shop_id = $2`,
      [couponId, shopId]
    );
  }
}
