import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext, Effective } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes } from '@barbershop/shared';
import {
  NotificationChannel,
  NotificationCountSummary,
  NotificationItem,
  NotificationStatus,
  NotificationType,
  Paginated,
} from '@barbershop/shared';

const notFound = (m = 'Notification not found.') =>
  new AppException(404, ErrorCodes.NOT_FOUND, m);
const forbid = (m = 'You do not have permission to view or modify this notification.') =>
  new AppException(403, ErrorCodes.FORBIDDEN, m);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private db: Db, private audit: AuditService) {}

  private scope(p: Effective, key: string): 'all' | 'own' {
    if (p.isOwner) return 'all';
    return p.map.get(key) ?? 'own';
  }

  // ==================== ADMIN / STAFF NOTIFICATIONS ====================

  async list(
    ctx: AuthContext,
    p: Effective,
    q: {
      status?: 'unread' | 'read' | 'delivered' | 'failed' | 'all';
      channel?: NotificationChannel;
      type?: NotificationType;
      page: number;
      limit: number;
    }
  ): Promise<Paginated<NotificationItem>> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = ['n.shop_id = $1'];
      const v: unknown[] = [ctx.shopId];

      if (this.scope(p, 'notifications.view') === 'own') {
        v.push(ctx.userId);
        w.push(`(n.user_id = $${v.length} OR n.user_id IS NULL)`);
      }

      if (q.status && q.status !== 'all') {
        v.push(q.status);
        w.push(`n.status = $${v.length}`);
      }

      if (q.channel) {
        v.push(q.channel);
        w.push(`n.channel = $${v.length}`);
      }

      if (q.type) {
        v.push(q.type);
        w.push(`n.type = $${v.length}`);
      }

      const where = `WHERE ${w.join(' AND ')}`;
      const total = (
        await c.query(`SELECT count(*)::int n FROM notifications n ${where}`, v)
      ).rows[0].n;

      const offset = (q.page - 1) * q.limit;
      v.push(q.limit);
      const limitIdx = v.length;
      v.push(offset);
      const offsetIdx = v.length;

      const rows = (
        await c.query(
          `
        SELECT 
          n.id,
          n.shop_id as "shopId",
          n.user_id as "userId",
          n.customer_id as "customerId",
          cust.name as "customerName",
          n.title,
          n.message,
          n.type,
          n.channel,
          n.status,
          n.metadata,
          n.whatsapp_url as "whatsappUrl",
          n.read_at as "readAt",
          n.created_at as "createdAt"
        FROM notifications n
        LEFT JOIN customers cust ON cust.id = n.customer_id
        ${where}
        ORDER BY n.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
          v
        )
      ).rows;

      return {
        items: rows.map(this.mapNotification),
        page: q.page,
        limit: q.limit,
        total,
      };
    });
  }

  async getUnreadCount(ctx: AuthContext, p: Effective): Promise<NotificationCountSummary> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = [`shop_id = $1`, `status = 'unread'`];
      const v: unknown[] = [ctx.shopId];

      if (this.scope(p, 'notifications.view') === 'own') {
        v.push(ctx.userId);
        w.push(`(user_id = $${v.length} OR user_id IS NULL)`);
      }

      const count = (
        await c.query(`SELECT count(*)::int n FROM notifications WHERE ${w.join(' AND ')}`, v)
      ).rows[0].n;

      return { unreadCount: count };
    });
  }

  async markAsRead(ctx: AuthContext, p: Effective, id: string): Promise<NotificationItem> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const notif = (await c.query(`SELECT * FROM notifications WHERE id = $1`, [id])).rows[0];
      if (!notif) throw notFound();

      if (
        this.scope(p, 'notifications.view') === 'own' &&
        notif.user_id &&
        notif.user_id !== ctx.userId
      ) {
        throw forbid();
      }

      const updated = (
        await c.query(
          `
        UPDATE notifications
        SET status = 'read', read_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
          [id]
        )
      ).rows[0];

      return this.mapNotification(updated);
    });
  }

  async markAllAsRead(ctx: AuthContext, p: Effective): Promise<{ updatedCount: number }> {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = [`shop_id = $1`, `status = 'unread'`];
      const v: unknown[] = [ctx.shopId];

      if (this.scope(p, 'notifications.view') === 'own') {
        v.push(ctx.userId);
        w.push(`(user_id = $${v.length} OR user_id IS NULL)`);
      }

      const r = await c.query(
        `UPDATE notifications SET status = 'read', read_at = now(), updated_at = now() WHERE ${w.join(' AND ')}`,
        v
      );

      return { updatedCount: r.rowCount || 0 };
    });
  }

  // ==================== DISPATCH / ENGINE HELPERS ====================

  async dispatch(
    shopId: string,
    dto: {
      userId?: string | null;
      customerId?: string | null;
      title: string;
      message: string;
      type: NotificationType;
      channel?: NotificationChannel;
      customerPhone?: string | null;
      metadata?: Record<string, any>;
    }
  ): Promise<NotificationItem> {
    let whatsappUrl: string | null = null;
    const phone = dto.customerPhone || dto.metadata?.customerPhone;
    if (phone) {
      whatsappUrl = this.buildWhatsAppLink(phone, dto.message);
    }

    const created = await this.db.tenant({ shopId }, async (c) => {
      const row = (
        await c.query(
          `
        INSERT INTO notifications (
          shop_id,
          user_id,
          customer_id,
          title,
          message,
          type,
          channel,
          status,
          metadata,
          whatsapp_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
          [
            shopId,
            dto.userId ?? null,
            dto.customerId ?? null,
            dto.title,
            dto.message,
            dto.type,
            dto.channel ?? 'in_app',
            'unread',
            JSON.stringify(dto.metadata ?? {}),
            whatsappUrl,
          ]
        )
      ).rows[0];

      return this.mapNotification(row);
    });

    // Fire outbound webhook asynchronously without blocking caller
    this.dispatchWebhook(shopId, {
      event: 'notification.created',
      notification: created,
    }).catch((err) => {
      this.logger.debug(`Webhook dispatch ignored: ${err.message}`);
    });

    return created;
  }

  async testWebhook(ctx: AuthContext, dto: { webhookUrl: string; webhookSecret?: string }) {
    const started = Date.now();
    const payload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      shopId: ctx.shopId,
      message: 'Test ping from Barber Shop Management System webhook engine.',
    };
    const bodyStr = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'BarberShop-Webhook-Engine/1.0',
      'X-BarberShop-Event': 'webhook.test',
      'X-BarberShop-Timestamp': payload.timestamp,
    };

    if (dto.webhookSecret) {
      const sig = crypto.createHmac('sha256', dto.webhookSecret).update(bodyStr).digest('hex');
      headers['X-BarberShop-Signature'] = `sha256=${sig}`;
    }

    try {
      const res = await fetch(dto.webhookUrl, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(6000),
      });
      const durationMs = Date.now() - started;
      const responseSnippet = await res.text().catch(() => '');

      return {
        success: res.ok,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        responseSnippet: responseSnippet.slice(0, 250),
      };
    } catch (err: any) {
      return {
        success: false,
        status: 0,
        statusText: err.name === 'TimeoutError' ? 'Request timed out (6s)' : err.message,
        durationMs: Date.now() - started,
        error: err.message,
      };
    }
  }

  private async dispatchWebhook(shopId: string, payload: any) {
    try {
      const shop = await this.db.tenant({ shopId }, async (c) => {
        const res = await c.query('SELECT settings FROM shops WHERE id = $1', [shopId]);
        return res.rows[0];
      });
      const webhookUrl = shop?.settings?.webhook_url;
      if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
        return;
      }
      const webhookSecret = shop?.settings?.webhook_secret;

      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'BarberShop-Webhook-Engine/1.0',
        'X-BarberShop-Event': payload.event || 'notification.created',
        'X-BarberShop-Timestamp': new Date().toISOString(),
      };

      if (webhookSecret) {
        const sig = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');
        headers['X-BarberShop-Signature'] = `sha256=${sig}`;
      }

      await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch webhook for shop ${shopId}: ${err.message}`);
    }
  }

  buildWhatsAppLink(phone: string, text: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  // ==================== TRIGGER HOOKS ====================

  async notifyAppointmentBooked(shopId: string, details: {
    appointmentId: string;
    appointmentNumber: number;
    customerName: string;
    customerPhone: string;
    customerId?: string;
    date: string;
    startTime: string;
    workerName?: string;
    workerUserId?: string;
    serviceNames: string[];
    shopName?: string;
  }) {
    const shop = details.shopName || 'Classic Barber Shop';
    const srvText = details.serviceNames.join(', ');
    const workerText = details.workerName ? ` with ${details.workerName}` : '';

    const clientMsg = `${shop}: Hello ${details.customerName}! Your appointment #${details.appointmentNumber} for ${srvText} is received for ${details.date} at ${details.startTime}${workerText}. Thank you!`;
    const adminMsg = `New booking #${details.appointmentNumber} from ${details.customerName} for ${details.date} at ${details.startTime} (${srvText}${workerText}).`;

    // 1. Alert for admin / staff
    await this.dispatch(shopId, {
      userId: details.workerUserId ?? null,
      customerId: details.customerId ?? null,
      title: `New Appointment #${details.appointmentNumber}`,
      message: adminMsg,
      type: 'appointment_booked',
      channel: 'in_app',
      customerPhone: details.customerPhone,
      metadata: {
        appointmentId: details.appointmentId,
        appointmentNumber: details.appointmentNumber,
        customerPhone: details.customerPhone,
        customerName: details.customerName,
      },
    });

    // 2. WhatsApp notification entry for customer
    await this.dispatch(shopId, {
      customerId: details.customerId ?? null,
      title: `Booking Confirmation #${details.appointmentNumber}`,
      message: clientMsg,
      type: 'appointment_booked',
      channel: 'whatsapp',
      customerPhone: details.customerPhone,
      metadata: {
        appointmentId: details.appointmentId,
        appointmentNumber: details.appointmentNumber,
        customerPhone: details.customerPhone,
      },
    });
  }

  async notifyAppointmentStatus(shopId: string, details: {
    appointmentId: string;
    appointmentNumber: number;
    customerName: string;
    customerPhone: string;
    customerId?: string;
    status: string;
    date: string;
    startTime: string;
    workerName?: string;
    shopName?: string;
  }) {
    const shop = details.shopName || 'Classic Barber Shop';
    let title = `Appointment #${details.appointmentNumber} Update`;
    let clientMsg = `${shop}: Hello ${details.customerName}, your appointment #${details.appointmentNumber} status is now ${details.status.toUpperCase()}.`;
    let type: NotificationType = 'appointment_confirmed';

    if (details.status === 'confirmed') {
      type = 'appointment_confirmed';
      title = `Appointment #${details.appointmentNumber} Confirmed`;
      clientMsg = `${shop}: Great news ${details.customerName}! Your appointment #${details.appointmentNumber} for ${details.date} at ${details.startTime} is confirmed. See you soon!`;
    } else if (details.status === 'completed') {
      type = 'appointment_completed';
      title = `Appointment #${details.appointmentNumber} Completed`;
      clientMsg = `${shop}: Thanks for visiting us, ${details.customerName}! We hope you enjoyed your haircut. Leave us a quick review to help us serve you better!`;
    } else if (details.status === 'cancelled') {
      type = 'appointment_cancelled';
      title = `Appointment #${details.appointmentNumber} Cancelled`;
      clientMsg = `${shop}: Notice: Your appointment #${details.appointmentNumber} scheduled for ${details.date} at ${details.startTime} has been cancelled.`;
    }

    await this.dispatch(shopId, {
      customerId: details.customerId ?? null,
      title,
      message: clientMsg,
      type,
      channel: 'whatsapp',
      customerPhone: details.customerPhone,
      metadata: {
        appointmentId: details.appointmentId,
        appointmentNumber: details.appointmentNumber,
        status: details.status,
      },
    });
  }

  async notifyPaymentReceived(shopId: string, details: {
    invoiceId: string;
    invoiceNumber: string;
    customerName: string;
    customerPhone: string;
    customerId?: string;
    totalAmountPaise: number;
    paymentMethod: string;
    shopName?: string;
  }) {
    const shop = details.shopName || 'Classic Barber Shop';
    const amountRs = (details.totalAmountPaise / 100).toFixed(2);
    const msg = `${shop}: Receipt for invoice #${details.invoiceNumber}. Paid Rs ${amountRs} via ${details.paymentMethod.toUpperCase()}. Thank you for your business!`;

    await this.dispatch(shopId, {
      customerId: details.customerId ?? null,
      title: `Payment Receipt #${details.invoiceNumber}`,
      message: msg,
      type: 'payment_received',
      channel: 'whatsapp',
      customerPhone: details.customerPhone,
      metadata: {
        invoiceId: details.invoiceId,
        invoiceNumber: details.invoiceNumber,
        totalAmountPaise: details.totalAmountPaise,
        paymentMethod: details.paymentMethod,
      },
    });
  }

  async notifyLowStock(shopId: string, details: {
    productId: string;
    productName: string;
    currentStock: number;
    threshold: number;
  }) {
    const msg = `Low stock alert: Product "${details.productName}" has only ${details.currentStock} units remaining (minimum alert threshold: ${details.threshold}). Please reorder stock.`;

    await this.dispatch(shopId, {
      title: `Low Stock: ${details.productName}`,
      message: msg,
      type: 'low_stock',
      channel: 'in_app',
      metadata: {
        productId: details.productId,
        productName: details.productName,
        currentStock: details.currentStock,
        threshold: details.threshold,
      },
    });
  }

  async notifyReviewReceived(shopId: string, details: {
    reviewId: string;
    customerName: string;
    rating: number;
    workerName?: string;
    workerUserId?: string;
    comment?: string;
  }) {
    const barberNote = details.workerName ? ` for barber ${details.workerName}` : '';
    const msg = `New ${details.rating}-star review received from ${details.customerName}${barberNote}${details.comment ? `: "${details.comment}"` : ''}`;

    await this.dispatch(shopId, {
      userId: details.workerUserId ?? null,
      title: `New ${details.rating}★ Review`,
      message: msg,
      type: 'review_received',
      channel: 'in_app',
      metadata: {
        reviewId: details.reviewId,
        customerName: details.customerName,
        rating: details.rating,
      },
    });
  }

  // ==================== CUSTOMER PORTAL ====================

  async listCustomerNotifications(
    shopId: string,
    customerId: string
  ): Promise<NotificationItem[]> {
    return this.db.tenant({ shopId }, async (c) => {
      const rows = (
        await c.query(
          `
        SELECT 
          n.id,
          n.shop_id as "shopId",
          n.user_id as "userId",
          n.customer_id as "customerId",
          cust.name as "customerName",
          n.title,
          n.message,
          n.type,
          n.channel,
          n.status,
          n.metadata,
          n.whatsapp_url as "whatsappUrl",
          n.read_at as "readAt",
          n.created_at as "createdAt"
        FROM notifications n
        LEFT JOIN customers cust ON cust.id = n.customer_id
        WHERE n.customer_id = $1
        ORDER BY n.created_at DESC
        LIMIT 30
      `,
          [customerId]
        )
      ).rows;

      return rows.map(this.mapNotification);
    });
  }

  async markCustomerNotificationRead(
    shopId: string,
    customerId: string,
    id: string
  ): Promise<NotificationItem> {
    return this.db.tenant({ shopId }, async (c) => {
      const notif = (
        await c.query(
          `SELECT * FROM notifications WHERE id = $1 AND customer_id = $2`,
          [id, customerId]
        )
      ).rows[0];
      if (!notif) throw notFound();

      const updated = (
        await c.query(
          `
        UPDATE notifications
        SET status = 'read', read_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
          [id]
        )
      ).rows[0];

      return this.mapNotification(updated);
    });
  }

  // ==================== PRIVATE MAPPER ====================

  private mapNotification(row: any): NotificationItem {
    return {
      id: row.id,
      shopId: row.shop_id || row.shopId,
      userId: row.user_id || row.userId || null,
      customerId: row.customer_id || row.customerId || null,
      customerName: row.customerName || null,
      title: row.title,
      message: row.message,
      type: row.type,
      channel: row.channel,
      status: row.status,
      metadata: row.metadata || {},
      whatsappUrl: row.whatsapp_url || row.whatsappUrl || null,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: row.created_at
        ? new Date(row.created_at).toISOString()
        : new Date().toISOString(),
    };
  }
}
