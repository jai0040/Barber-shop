import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let invoiceIdA: string;

describe('Phase 8: Online Payment Gateway & Razorpay Integration', () => {
  before(async () => {
  try {
    h = await boot();

    const onboard = async (slug: string, name: string, email: string) => {
      const s = (
        await h.ownerPool.query(
          `INSERT INTO shops (name, slug, timezone, status) VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
          [name, slug]
        )
      ).rows[0];

      const r = (
        await h.ownerPool.query(
          `INSERT INTO roles (shop_id, name, is_system, system_key)
           VALUES ($1, 'Owner', true, 'owner') RETURNING id`,
          [s.id]
        )
      ).rows[0];

      const u = (
        await h.ownerPool.query(
          `INSERT INTO users (type, name, email, password_hash, shop_id)
           VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
          [name + ' Owner', email, s.id]
        )
      ).rows[0];

      await h.ownerPool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`, [
        u.id,
        s.id,
        r.id,
      ]);

      await h.ownerPool.query(
        `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
        [r.id, s.id]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('gateway-shop-a', 'Gateway Shop A', 'owner.a@gateway.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('gateway-shop-b', 'Gateway Shop B', 'owner.b@gateway.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create an invoice in Shop A
    const invRes = await h.call('POST', '/billing/invoices', {
      token: ownerTokenA,
      body: {
        items: [
          {
            type: 'service',
            itemName: 'Deluxe Grooming Combo',
            quantity: 1,
            unitPricePaise: 75000,
          },
        ],
      },
    });
    assert.strictEqual(invRes.status, 201);
    invoiceIdA = invRes.body.data.id;
  } catch (err) {
    console.error('Payment gateway test bootstrap failed:', err);
    throw err;
  }
});

let orderId: string;
const devSecret = 'dev_razorpay_secret_key_12345';

  it('1. Creates a Razorpay order linked to an unpaid invoice', async () => {
    const res = await h.call('POST', '/payments/razorpay/create-order', {
      token: ownerTokenA,
      body: {
        invoiceId: invoiceIdA,
        amountPaise: 75000,
      },
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.orderId);
    assert.ok(res.body.data.orderId.startsWith('order_'));
    assert.strictEqual(res.body.data.amountPaise, 75000);
    assert.strictEqual(res.body.data.currency, 'INR');
    assert.ok(res.body.data.keyId);
    orderId = res.body.data.orderId;
  });

  it('2. Rejects verification when Razorpay HMAC signature is invalid', async () => {
    const res = await h.call('POST', '/payments/razorpay/verify', {
      token: ownerTokenA,
      body: {
        invoiceId: invoiceIdA,
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_invalid_123456',
        razorpaySignature: 'completely_fraudulent_signature',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('signature'));
  });

  it('3. Successfully verifies payment with valid HMAC signature and marks invoice paid', async () => {
    const paymentId = 'pay_rzp_valid_998877';
    const validSignature = crypto
      .createHmac('sha256', devSecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const res = await h.call('POST', '/payments/razorpay/verify', {
      token: ownerTokenA,
      body: {
        invoiceId: invoiceIdA,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      },
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.success, true);
    assert.strictEqual(res.body.data.invoice.paymentStatus, 'paid');

    // Verify invoice status in billing API
    const getRes = await h.call('GET', `/billing/invoices/${invoiceIdA}`, {
      token: ownerTokenA,
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.data.paymentStatus, 'paid');
    assert.strictEqual(getRes.body.data.payments.length, 1);
    assert.strictEqual(getRes.body.data.payments[0].method, 'razorpay');
    assert.strictEqual(getRes.body.data.payments[0].transactionReference, paymentId);
  });

  it('4. Rejects subsequent payment attempts on already paid invoice', async () => {
    const res = await h.call('POST', '/payments/razorpay/create-order', {
      token: ownerTokenA,
      body: {
        invoiceId: invoiceIdA,
        amountPaise: 75000,
      },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.message.includes('already paid'));
  });

  it('5. Updates shop-level Razorpay credentials', async () => {
    const res = await h.call('PATCH', '/payments/credentials', {
      token: ownerTokenA,
      body: {
        razorpayKeyId: 'rzp_live_customkey123',
        razorpayKeySecret: 'custom_live_secret_key_889900',
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.configured, true);
  });

  it('6. Webhook endpoint processes external payment captured callbacks', async () => {
    const res = await h.call('POST', '/payments/razorpay/webhook', {
      body: {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_test_123',
              amount: 75000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.received, true);
  });

  it('7. Enforces multi-tenant isolation (Shop B cannot verify or touch Shop A invoice)', async () => {
    const res = await h.call('POST', '/payments/razorpay/create-order', {
      token: ownerTokenB,
      body: {
        invoiceId: invoiceIdA,
        amountPaise: 75000,
      },
    });
    assert.strictEqual(res.status, 404); // Invisible to Shop B
  });

  after(async () => {
    if (h) await h.close();
  });
});
