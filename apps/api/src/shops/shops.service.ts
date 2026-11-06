import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';

const notFound = (m = 'Shop not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const COLS: Record<string, string> = { name: 'name', phone: 'phone', email: 'email', address: 'address', city: 'city', state: 'state', country: 'country', gstNo: 'gst_no', timezone: 'timezone' };
const DEFAULT_SETTINGS = {
  cancellation_cooldown_hours: 24,
  advance_booking_days: 30,
  auto_reminders_enabled: true,
  webhook_url: null,
  webhook_secret: null,
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const hoursOut = (rows: any[]) => rows.map((h) => ({ weekday: h.weekday, isClosed: h.is_closed, openTime: hhmm(h.open_time), closeTime: hhmm(h.close_time) }));
const logoUrl = (slug: string, has: boolean) => (has ? `/api/v1/shops/public/${slug}/logo` : null);

@Injectable()
export class ShopsService {
  constructor(private db: Db, private audit: AuditService, private files: FilesService) {}

  // ---------- staff: own shop ----------
  current(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const s = await this.loadShop(c, ctx.shopId!);
      return { ...this.profile(s), settings: { ...DEFAULT_SETTINGS, ...s.settings }, hours: hoursOut(await this.loadHours(c, s.id)) };
    });
  }

  update(ctx: AuthContext, dto: Record<string, unknown>) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query('SELECT * FROM shops WHERE id=$1 FOR UPDATE', [ctx.shopId])).rows[0];
      const sets: string[] = [], vals: unknown[] = [ctx.shopId], before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(dto)) {
        const col = COLS[k]; if (!col || old[col] === v) continue;
        vals.push(v); sets.push(`${col} = $${vals.length}`); before[k] = old[col]; after[k] = v;
      }
      if (sets.length) {
        await c.query(`UPDATE shops SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
        await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'shop.update', entity: 'shop', entityId: ctx.shopId, oldValues: before, newValues: after, ip: ctx.ip });
      }
      return this.profile(await this.loadShop(c, ctx.shopId!));
    });
  }

  setHours(ctx: AuthContext, hours: { weekday: number; isClosed: boolean; openTime?: string | null; closeTime?: string | null }[]) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = hoursOut(await this.loadHours(c, ctx.shopId!));
      await c.query('DELETE FROM shop_hours WHERE shop_id = $1', [ctx.shopId]);
      await c.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         SELECT $1, x.d, x.cl, x.o::time, x.c::time FROM unnest($2::int[], $3::bool[], $4::text[], $5::text[]) AS x(d, cl, o, c)`,
        [ctx.shopId, hours.map((h) => h.weekday), hours.map((h) => h.isClosed), hours.map((h) => (h.isClosed ? null : h.openTime)), hours.map((h) => (h.isClosed ? null : h.closeTime))]);
      const now = hoursOut(await this.loadHours(c, ctx.shopId!));
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'shop.hours.update', entity: 'shop', entityId: ctx.shopId, oldValues: old, newValues: now, ip: ctx.ip });
      return now;
    });
  }

  updateSettings(ctx: AuthContext, dto: {
    cancellationCooldownHours?: number;
    advanceBookingDays?: number;
    autoRemindersEnabled?: boolean;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  }) {
    const patch: Record<string, any> = {};
    if (dto.cancellationCooldownHours !== undefined) patch.cancellation_cooldown_hours = dto.cancellationCooldownHours;
    if (dto.advanceBookingDays !== undefined) patch.advance_booking_days = dto.advanceBookingDays;
    if (dto.autoRemindersEnabled !== undefined) patch.auto_reminders_enabled = dto.autoRemindersEnabled;
    if (dto.webhookUrl !== undefined) patch.webhook_url = dto.webhookUrl;
    if (dto.webhookSecret !== undefined) patch.webhook_secret = dto.webhookSecret;
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const old = (await c.query('SELECT settings FROM shops WHERE id=$1 FOR UPDATE', [ctx.shopId])).rows[0].settings;
      const next = (await c.query('UPDATE shops SET settings = settings || $2::jsonb, updated_at = now() WHERE id=$1 RETURNING settings', [ctx.shopId, JSON.stringify(patch)])).rows[0].settings;
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'shop.settings.update', entity: 'shop', entityId: ctx.shopId, oldValues: old, newValues: next, ip: ctx.ip });
      return { ...DEFAULT_SETTINGS, ...next };
    });
  }

  /** Setup checklist; later phases append steps (services, workers). */
  setup(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const s = await this.loadShop(c, ctx.shopId!);
      const hours = await this.loadHours(c, s.id);
      const steps = [
        { key: 'profile', label: 'Shop details (phone, address, city, state)', done: !!(s.phone && s.address && s.city && s.state), optional: false },
        { key: 'hours', label: 'Business hours', done: hours.length === 7 && hours.some((h) => !h.is_closed), optional: false },
        { key: 'logo', label: 'Shop logo', done: !!s.logo_file_id, optional: true },
        { key: 'payment_qr', label: 'UPI payment QR', done: !!s.upi_qr_file_id, optional: true },
      ];
      return { complete: steps.filter((x) => !x.optional).every((x) => x.done), steps };
    });
  }

  async exportShopBackup(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const shop = (await c.query('SELECT * FROM shops WHERE id = $1', [ctx.shopId])).rows[0];
      if (!shop) throw notFound();

      const tenantTables = [
        'shop_hours',
        'service_categories',
        'services',
        'workers',
        'worker_services',
        'worker_schedules',
        'worker_time_off',
        'product_categories',
        'products',
        'inventory_transactions',
        'customers',
        'customer_preferred_services',
        'appointments',
        'appointment_services',
        'appointment_status_history',
        'invoices',
        'invoice_items',
        'payments',
        'expense_categories',
        'expenses',
        'loyalty_settings',
        'customer_loyalty_ledger',
        'membership_plans',
        'customer_memberships',
        'customer_membership_service_usages',
        'worker_commission_ledger',
        'worker_payouts',
        'coupons',
        'coupon_redemptions',
        'worker_attendance',
        'worker_salary_advances',
        'worker_salary_settlements',
        'reviews',
        'notifications',
        'audit_logs',
      ];

      const tablesData: Record<string, any[]> = {
        shops: [shop],
      };
      const counts: Record<string, number> = {
        shops: 1,
      };

      for (const tbl of tenantTables) {
        try {
          const res = await c.query(`SELECT * FROM ${tbl} WHERE shop_id = $1`, [ctx.shopId]);
          tablesData[tbl] = res.rows;
          counts[tbl] = res.rowCount || 0;
        } catch {
          tablesData[tbl] = [];
          counts[tbl] = 0;
        }
      }

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'shop.backup.export',
        entity: 'shop',
        entityId: ctx.shopId!,
        newValues: { tableCounts: counts },
        ip: ctx.ip,
      });

      return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        shopId: ctx.shopId,
        shopSlug: shop.slug,
        shopName: shop.name,
        counts,
        tables: tablesData,
      };
    });
  }

  // ---------- images (logo / UPI QR) ----------
  private target(ctx: AuthContext, kind: 'shop_logo' | 'upi_qr') {
    return { kind, table: 'shops' as const, rowId: ctx.shopId!, entity: 'shop',
      column: kind === 'shop_logo' ? 'logo_file_id' as const : 'upi_qr_file_id' as const, auditPrefix: kind === 'shop_logo' ? 'shop.logo' : 'shop.upi_qr' };
  }
  uploadImage(ctx: AuthContext, kind: 'shop_logo' | 'upi_qr', buf: Buffer) { return this.files.replace(this.db, ctx, this.target(ctx, kind), buf); }
  removeImage(ctx: AuthContext, kind: 'shop_logo' | 'upi_qr') { return this.files.remove(this.db, ctx, this.target(ctx, kind)); }

  /** Staff-only: returns the stored QR for the caller's own shop. */
  upiQr(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const f = (await c.query('SELECT f.storage_key, f.mime FROM shops s JOIN files f ON f.id = s.upi_qr_file_id WHERE s.id=$1', [ctx.shopId])).rows[0];
      if (!f) throw notFound('No payment QR has been uploaded yet.');
      return { key: f.storage_key as string, mime: f.mime as string };
    });
  }
  stream(key: string) { return this.files.stream(key); }

  // ---------- public (customer website; RLS public_read policy: active shops only, logo only) ----------
  async publicList(q: { q?: string; page: number; limit: number }) {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const w = q.q ? `WHERE name ILIKE $1 OR city ILIKE $1` : '';
      const p: unknown[] = q.q ? [`%${q.q.replace(/[%_\\]/g, '\\$&')}%`] : [];
      const total = (await c.query(`SELECT count(*)::int n FROM shops ${w}`, p)).rows[0].n;
      const rows = (await c.query(
        `SELECT slug, name, city, state, logo_file_id IS NOT NULL AS has_logo FROM shops ${w} ORDER BY name LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, p)).rows;
      return { items: rows.map((r) => ({ slug: r.slug, name: r.name, city: r.city, state: r.state, logoUrl: logoUrl(r.slug, r.has_logo) })), page: q.page, limit: q.limit, total };
    });
  }

  publicBySlug(slug: string) {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const s = (await c.query('SELECT * FROM shops WHERE slug=$1', [slug])).rows[0];
      if (!s) throw notFound();
      const hours = await this.loadHours(c, s.id);
      // Deliberately omitted: gst_no, UPI QR, internal settings (except the booking window customers need).
      return {
        slug: s.slug, name: s.name, phone: s.phone, email: s.email, address: s.address, city: s.city, state: s.state, country: s.country,
        timezone: s.timezone, logoUrl: logoUrl(s.slug, !!s.logo_file_id), hours: hoursOut(hours),
        advanceBookingDays: s.settings.advance_booking_days ?? DEFAULT_SETTINGS.advance_booking_days,
      };
    });
  }

  publicLogo(slug: string) {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const f = (await c.query('SELECT f.storage_key, f.mime FROM shops s JOIN files f ON f.id = s.logo_file_id WHERE s.slug=$1', [slug])).rows[0];
      if (!f) throw notFound('No logo.');
      return { key: f.storage_key as string, mime: f.mime as string };
    });
  }

  // ---------- helpers ----------
  private async loadShop(c: PoolClient, id: string) {
    const s = (await c.query('SELECT * FROM shops WHERE id=$1', [id])).rows[0];
    if (!s) throw notFound();
    return s;
  }
  private async loadHours(c: PoolClient, id: string) {
    return (await c.query('SELECT weekday, is_closed, open_time::text AS open_time, close_time::text AS close_time FROM shop_hours WHERE shop_id=$1 ORDER BY weekday', [id])).rows;
  }
  private profile(s: any) {
    return {
      id: s.id, name: s.name, slug: s.slug, status: s.status, timezone: s.timezone, phone: s.phone, email: s.email, address: s.address,
      city: s.city, state: s.state, country: s.country, gstNo: s.gst_no, logoUrl: logoUrl(s.slug, !!s.logo_file_id), hasUpiQr: !!s.upi_qr_file_id,
    };
  }
}
