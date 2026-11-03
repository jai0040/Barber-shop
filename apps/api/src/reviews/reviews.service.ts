import { Injectable, Optional } from '@nestjs/common';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext, Effective } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes } from '@barbershop/shared';
import { ReviewItem, ReviewStatus, ReviewSummary } from '@barbershop/shared';
import { NotificationsService } from '../notifications/notifications.service';

const notFound = (m = 'Review or record not found.') =>
  new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) =>
  new AppException(400, ErrorCodes.VALIDATION_FAILED, m);
const conflict = (m: string) =>
  new AppException(409, ErrorCodes.CONFLICT, m);

@Injectable()
export class ReviewsService {
  constructor(
    private db: Db,
    private audit: AuditService,
    @Optional() private notifications?: NotificationsService
  ) {}

  async createReview(
    ctx: AuthContext,
    dto: {
      shopId?: string;
      slug?: string;
      appointmentId?: string;
      workerId?: string;
      serviceId?: string;
      rating: number;
      barberRating?: number;
      comment?: string;
    }
  ): Promise<ReviewItem> {
    let shopId = ctx.shopId || dto.shopId;
    if (!shopId && dto.slug) {
      const s = (await this.db.query('SELECT id FROM shops WHERE slug = $1', [dto.slug])).rows[0];
      if (s) shopId = s.id;
    }
    if (!shopId) {
      throw badRequest('Shop identifier is required for review submission.');
    }

    return this.db.tenant({ shopId }, async (c) => {
      // 1. Resolve customer
      let cust = (
        await c.query(
          `SELECT id, name FROM customers
           WHERE shop_id = $1 AND (user_id = $2 OR phone = (SELECT phone FROM users WHERE id = $2))`,
          [shopId, ctx.userId]
        )
      ).rows[0];

      if (!cust) {
        // Auto-provision customer profile for user
        const u = (await c.query(`SELECT name, phone FROM users WHERE id = $1`, [ctx.userId])).rows[0];
        if (!u) throw badRequest('Customer user account not found.');
        cust = (
          await c.query(
            `INSERT INTO customers (shop_id, user_id, name, phone)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (shop_id, phone) DO UPDATE SET user_id = EXCLUDED.user_id
             RETURNING id, name`,
            [shopId, ctx.userId, u.name, u.phone]
          )
        ).rows[0];
      }

      let workerId = dto.workerId || null;
      let serviceId = dto.serviceId || null;

      // 2. Validate appointment if provided
      if (dto.appointmentId) {
        const apt = (
          await c.query(
            `SELECT id, status, worker_id, customer_id
             FROM appointments
             WHERE id = $1 AND shop_id = $2`,
            [dto.appointmentId, shopId]
          )
        ).rows[0];

        if (!apt) throw notFound('Appointment not found.');
        if (apt.customer_id !== cust.id) {
          throw badRequest('You can only review your own appointments.');
        }
        if (apt.status !== 'completed') {
          throw badRequest('You can only review completed appointments.');
        }

        // Prevent duplicate review for appointment
        const existingRev = (
          await c.query(
            `SELECT id FROM reviews WHERE appointment_id = $1 AND shop_id = $2`,
            [dto.appointmentId, shopId]
          )
        ).rows[0];
        if (existingRev) {
          throw conflict('This appointment has already been reviewed.');
        }

        if (!workerId && apt.worker_id) {
          workerId = apt.worker_id;
        }

        // Check primary service from appointment
        if (!serviceId) {
          const sRow = (
            await c.query(
              `SELECT service_id FROM appointment_services WHERE appointment_id = $1 LIMIT 1`,
              [dto.appointmentId]
            )
          ).rows[0];
          if (sRow) serviceId = sRow.service_id;
        }
      }

      // 3. Insert review
      const res = await c.query(
        `INSERT INTO reviews (
           shop_id, appointment_id, customer_id, customer_name, worker_id, service_id,
           rating, barber_rating, comment, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published')
         RETURNING *`,
        [
          shopId,
          dto.appointmentId || null,
          cust.id,
          cust.name,
          workerId,
          serviceId,
          dto.rating,
          dto.barberRating || null,
          dto.comment || null,
        ]
      );
      const row = res.rows[0];

      // Fetch joined names
      const joined = (
        await c.query(
          `SELECT w.display_name AS worker_name, s.name AS service_name
           FROM (SELECT 1) _
           LEFT JOIN workers w ON w.id = $1
           LEFT JOIN services s ON s.id = $2`,
          [row.worker_id, row.service_id]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId,
        userId: ctx.userId,
        action: 'review.create',
        entity: 'reviews',
        entityId: row.id,
        newValues: {
          appointmentId: row.appointment_id,
          rating: row.rating,
          barberRating: row.barber_rating,
        },
        ip: ctx.ip,
      });

      if (this.notifications) {
        try {
          const workerUserRow = row.worker_id
            ? (await c.query(`SELECT user_id FROM workers WHERE id = $1`, [row.worker_id])).rows[0]
            : null;
          await this.notifications.notifyReviewReceived(shopId, {
            reviewId: row.id,
            customerName: cust.name,
            rating: row.rating,
            workerName: joined?.worker_name,
            workerUserId: workerUserRow?.user_id,
            comment: row.comment,
          });
        } catch {
          // notification failure should not block review creation
        }
      }

      return {
        id: row.id,
        shopId: row.shop_id,
        appointmentId: row.appointment_id,
        customerId: row.customer_id,
        customerName: cust.name,
        workerId: row.worker_id,
        workerName: joined?.worker_name || null,
        serviceId: row.service_id,
        serviceName: joined?.service_name || null,
        rating: row.rating,
        barberRating: row.barber_rating,
        comment: row.comment,
        status: row.status,
        ownerReply: row.owner_reply,
        ownerRepliedAt: row.owner_replied_at ? new Date(row.owner_replied_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  // --- Public Customer Website Endpoints ---

  async listPublicReviews(
    slug: string,
    q: {
      workerId?: string;
      serviceId?: string;
      minRating?: number;
      page: number;
      limit: number;
    }
  ): Promise<{ items: ReviewItem[]; total: number; page: number; limit: number }> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query(`SELECT id FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found.');

      const params: any[] = [shop.id];
      let where = `r.shop_id = $1 AND r.status = 'published'`;

      if (q.workerId) {
        params.push(q.workerId);
        where += ` AND r.worker_id = $${params.length}`;
      }
      if (q.serviceId) {
        params.push(q.serviceId);
        where += ` AND r.service_id = $${params.length}`;
      }
      if (q.minRating) {
        params.push(q.minRating);
        where += ` AND r.rating >= $${params.length}`;
      }

      const total = Number(
        (await c.query(`SELECT COUNT(*)::int AS cnt FROM reviews r WHERE ${where}`, params)).rows[0].cnt
      );

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit, offset);

      const rows = (
        await c.query(
          `SELECT r.*, r.customer_name AS customer_full_name, w.display_name AS worker_name, s.name AS service_name
           FROM reviews r
           LEFT JOIN workers w ON r.worker_id = w.id
           LEFT JOIN services s ON r.service_id = s.id
           WHERE ${where}
           ORDER BY r.created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        )
      ).rows;

      const items: ReviewItem[] = rows.map((r) => {
        // Privacy format: e.g. "Rahul S."
        const parts = (r.customer_full_name || 'Customer').trim().split(' ');
        const maskedName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];

        return {
          id: r.id,
          shopId: r.shop_id,
          appointmentId: r.appointment_id,
          customerId: r.customer_id,
          customerName: maskedName,
          workerId: r.worker_id,
          workerName: r.worker_name,
          serviceId: r.service_id,
          serviceName: r.service_name,
          rating: r.rating,
          barberRating: r.barber_rating,
          comment: r.comment,
          status: r.status,
          ownerReply: r.owner_reply,
          ownerRepliedAt: r.owner_replied_at ? new Date(r.owner_replied_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      });

      return { items, total, page: q.page, limit: q.limit };
    });
  }

  async getPublicReviewSummary(slug: string): Promise<ReviewSummary> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      const shop = (await c.query(`SELECT id FROM shops WHERE slug = $1 AND status = 'active'`, [slug])).rows[0];
      if (!shop) throw notFound('Shop not found.');

      const agg = (
        await c.query(
          `SELECT
             COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS avg_rating,
             COUNT(*)::int AS total_reviews
           FROM reviews
           WHERE shop_id = $1 AND status = 'published'`,
          [shop.id]
        )
      ).rows[0];

      const distRows = (
        await c.query(
          `SELECT rating, COUNT(*)::int AS cnt
           FROM reviews
           WHERE shop_id = $1 AND status = 'published'
           GROUP BY rating`,
          [shop.id]
        )
      ).rows;

      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of distRows) {
        if (r.rating >= 1 && r.rating <= 5) {
          (ratingDistribution as any)[r.rating] = r.cnt;
        }
      }

      return {
        averageRating: agg.avg_rating || 0,
        totalReviews: agg.total_reviews || 0,
        ratingDistribution,
      };
    });
  }

  // --- Staff & Shop Admin Management Endpoints ---

  async listReviews(
    ctx: AuthContext,
    actor: Effective,
    q: {
      workerId?: string;
      serviceId?: string;
      status?: string;
      minRating?: number;
      page: number;
      limit: number;
    }
  ): Promise<{ items: ReviewItem[]; total: number; page: number; limit: number; summary: ReviewSummary }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const permScope = actor?.map.get('reviews.view');
      let ownWorkerId: string | null = null;
      if (permScope === 'own' && !actor?.isOwner) {
        const wRow = (
          await c.query(
            `SELECT id FROM workers WHERE user_id = $1 AND shop_id = $2`,
            [ctx.userId, ctx.shopId]
          )
        ).rows[0];
        if (!wRow) return { items: [], total: 0, page: q.page, limit: q.limit, summary: { averageRating: 0, totalReviews: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } };
        ownWorkerId = wRow.id;
      }

      const targetWorkerId = ownWorkerId || q.workerId || null;

      const params: any[] = [ctx.shopId];
      let where = `r.shop_id = $1`;

      if (targetWorkerId) {
        params.push(targetWorkerId);
        where += ` AND r.worker_id = $${params.length}`;
      }
      if (q.serviceId) {
        params.push(q.serviceId);
        where += ` AND r.service_id = $${params.length}`;
      }
      if (q.status) {
        params.push(q.status);
        where += ` AND r.status = $${params.length}`;
      }
      if (q.minRating) {
        params.push(q.minRating);
        where += ` AND r.rating >= $${params.length}`;
      }

      const total = Number(
        (await c.query(`SELECT COUNT(*)::int AS cnt FROM reviews r WHERE ${where}`, params)).rows[0].cnt
      );

      const offset = (q.page - 1) * q.limit;
      params.push(q.limit, offset);

      const rows = (
        await c.query(
          `SELECT r.*, c.name AS customer_name, w.display_name AS worker_name, s.name AS service_name
           FROM reviews r
           JOIN customers c ON r.customer_id = c.id
           LEFT JOIN workers w ON r.worker_id = w.id
           LEFT JOIN services s ON r.service_id = s.id
           WHERE ${where}
           ORDER BY r.created_at DESC
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        )
      ).rows;

      const items: ReviewItem[] = rows.map((r) => ({
        id: r.id,
        shopId: r.shop_id,
        appointmentId: r.appointment_id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        workerId: r.worker_id,
        workerName: r.worker_name,
        serviceId: r.service_id,
        serviceName: r.service_name,
        rating: r.rating,
        barberRating: r.barber_rating,
        comment: r.comment,
        status: r.status,
        ownerReply: r.owner_reply,
        ownerRepliedAt: r.owner_replied_at ? new Date(r.owner_replied_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }));

      // Summary
      const sumAgg = (
        await c.query(
          `SELECT
             COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS avg_rating,
             COUNT(*)::int AS total_reviews
           FROM reviews r
           WHERE ${where.replace(/LIMIT.*$/, '')}`,
          params.slice(0, params.length - 2)
        )
      ).rows[0];

      const distRows = (
        await c.query(
          `SELECT rating, COUNT(*)::int AS cnt
           FROM reviews r
           WHERE ${where.replace(/LIMIT.*$/, '')}
           GROUP BY rating`,
          params.slice(0, params.length - 2)
        )
      ).rows;

      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of distRows) {
        if (r.rating >= 1 && r.rating <= 5) {
          (ratingDistribution as any)[r.rating] = r.cnt;
        }
      }

      return {
        items,
        total,
        page: q.page,
        limit: q.limit,
        summary: {
          averageRating: sumAgg?.avg_rating || 0,
          totalReviews: sumAgg?.total_reviews || 0,
          ratingDistribution,
        },
      };
    });
  }

  async replyReview(
    ctx: AuthContext,
    reviewId: string,
    ownerReply: string
  ): Promise<ReviewItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const res = await c.query(
        `UPDATE reviews
         SET owner_reply = $1, owner_replied_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND shop_id = $3
         RETURNING *`,
        [ownerReply, reviewId, ctx.shopId]
      );

      if (res.rowCount === 0) throw notFound('Review not found.');
      const row = res.rows[0];

      const names = (
        await c.query(
          `SELECT w.display_name AS worker_name, s.name AS service_name
           FROM (SELECT 1) _
           LEFT JOIN workers w ON w.id = $1
           LEFT JOIN services s ON s.id = $2`,
          [row.worker_id, row.service_id]
        )
      ).rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'review.reply',
        entity: 'reviews',
        entityId: row.id,
        newValues: { ownerReply },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        appointmentId: row.appointment_id,
        customerId: row.customer_id,
        customerName: row.customer_name,
        workerId: row.worker_id,
        workerName: names?.worker_name,
        serviceId: row.service_id,
        serviceName: names?.service_name,
        rating: row.rating,
        barberRating: row.barber_rating,
        comment: row.comment,
        status: row.status,
        ownerReply: row.owner_reply,
        ownerRepliedAt: new Date(row.owner_replied_at).toISOString(),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async updateReviewStatus(
    ctx: AuthContext,
    reviewId: string,
    status: ReviewStatus
  ): Promise<ReviewItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const res = await c.query(
        `UPDATE reviews
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND shop_id = $3
         RETURNING *`,
        [status, reviewId, ctx.shopId]
      );

      if (res.rowCount === 0) throw notFound('Review not found.');
      const row = res.rows[0];

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'review.update_status',
        entity: 'reviews',
        entityId: row.id,
        newValues: { status },
        ip: ctx.ip,
      });

      return {
        id: row.id,
        shopId: row.shop_id,
        appointmentId: row.appointment_id,
        customerId: row.customer_id,
        workerId: row.worker_id,
        serviceId: row.service_id,
        rating: row.rating,
        barberRating: row.barber_rating,
        comment: row.comment,
        status: row.status,
        ownerReply: row.owner_reply,
        ownerRepliedAt: row.owner_replied_at ? new Date(row.owner_replied_at).toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }
}
