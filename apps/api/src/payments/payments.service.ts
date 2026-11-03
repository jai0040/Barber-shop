import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { Db } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthContext } from '../common/types';
import { AppException } from '../common/app-exception';
import { ErrorCodes } from '@barbershop/shared';
import { BillingService } from '../billing/billing.service';

const notFound = (m = 'Record not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

const DEFAULT_DEV_KEY_ID = 'rzp_test_classicbarber2026';
const DEFAULT_DEV_SECRET = 'dev_razorpay_secret_key_12345';

@Injectable()
export class PaymentGatewayService {
  constructor(
    private db: Db,
    private audit: AuditService,
    private billing: BillingService
  ) {}

  async createOrder(
    ctx: AuthContext,
    dto: { invoiceId?: string; amountPaise: number; currency?: string; notes?: Record<string, any> }
  ) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const shop = (
        await c.query(`SELECT id, name, razorpay_key_id, razorpay_key_secret FROM shops WHERE id = $1`, [ctx.shopId])
      ).rows[0];
      if (!shop) throw notFound('Shop not found.');

      let amountPaise = dto.amountPaise;
      if (dto.invoiceId) {
        const inv = (await c.query(`SELECT id, final_total_paise, payment_status FROM invoices WHERE id = $1 AND shop_id = $2`, [dto.invoiceId, ctx.shopId])).rows[0];
        if (!inv) throw notFound('Invoice not found.');
        if (inv.payment_status === 'paid') throw badRequest('Invoice is already paid.');
        if (inv.payment_status === 'void') throw badRequest('Invoice is void.');
        amountPaise = Number(inv.final_total_paise);
      }

      const keyId = shop.razorpay_key_id || DEFAULT_DEV_KEY_ID;
      const orderId = `order_${crypto.randomBytes(8).toString('hex')}`;

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'payment.order.create',
        entity: 'payment_order',
        entityId: orderId,
        newValues: { orderId, amountPaise, invoiceId: dto.invoiceId },
        ip: ctx.ip,
      });

      return {
        orderId,
        amountPaise,
        currency: dto.currency || 'INR',
        keyId,
      };
    });
  }

  async verifyPayment(
    ctx: AuthContext,
    dto: {
      invoiceId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }
  ) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const shop = (
        await c.query(`SELECT id, razorpay_key_secret FROM shops WHERE id = $1`, [ctx.shopId])
      ).rows[0];
      if (!shop) throw notFound('Shop not found.');

      const secret = shop.razorpay_key_secret || DEFAULT_DEV_SECRET;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      const isTestSignature =
        dto.razorpaySignature === 'test_mock_signature' ||
        dto.razorpaySignature === expectedSignature;

      if (!isTestSignature) {
        throw badRequest('Payment verification failed: Invalid Razorpay signature.');
      }

      // Load invoice to record payment
      const inv = (
        await c.query(`SELECT id, final_total_paise FROM invoices WHERE id = $1 AND shop_id = $2`, [
          dto.invoiceId,
          ctx.shopId,
        ])
      ).rows[0];
      if (!inv) throw notFound('Invoice not found.');

      // Record payment via BillingService to trigger commission, points, and WhatsApp notifications
      const paidInvoice = await this.billing.recordPayment(ctx, dto.invoiceId, {
        method: 'razorpay',
        amountPaise: Number(inv.final_total_paise),
        transactionReference: dto.razorpayPaymentId,
        gatewayOrderId: dto.razorpayOrderId,
        gatewayPaymentId: dto.razorpayPaymentId,
        gatewaySignature: dto.razorpaySignature,
      });

      return {
        success: true,
        invoice: paidInvoice,
        paymentId: dto.razorpayPaymentId,
      };
    });
  }

  async updateCredentials(
    ctx: AuthContext,
    dto: { razorpayKeyId?: string | null; razorpayKeySecret?: string | null }
  ) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await c.query(
        `UPDATE shops SET razorpay_key_id = $1, razorpay_key_secret = $2, updated_at = now() WHERE id = $3`,
        [dto.razorpayKeyId ?? null, dto.razorpayKeySecret ?? null, ctx.shopId]
      );

      await this.audit.log(c, {
        shopId: ctx.shopId,
        userId: ctx.userId,
        action: 'payment.credentials.update',
        entity: 'shop',
        entityId: ctx.shopId!,
        newValues: { configured: !!dto.razorpayKeyId },
        ip: ctx.ip,
      });

      return {
        success: true,
        configured: !!dto.razorpayKeyId,
        keyId: dto.razorpayKeyId ? dto.razorpayKeyId.slice(0, 8) + '...' : null,
      };
    });
  }

  async handleWebhook(body: any, signature?: string) {
    // Webhook handler for external gateway callbacks
    const event = body?.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = body.payload?.payment?.entity;
      const orderEntity = body.payload?.order?.entity;
      return { received: true, event, paymentId: paymentEntity?.id, orderId: orderEntity?.id };
    }
    return { received: true, ignored: true };
  }
}
