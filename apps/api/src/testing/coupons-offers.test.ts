import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let haircutIdA: string;
let productIdA: string;
let customerIdA1: string;
let customerIdA2: string;
let workerIdA: string;

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
           VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
          [s.id]
        )
      ).rows;
      const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

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
        ownerRoleId,
      ]);

      await h.ownerPool.query(
        `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
        [ownerRoleId, s.id]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('coupons-shop-a', 'Coupons Shop A', 'owner.ca@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('coupons-shop-b', 'Coupons Shop B', 'owner.cb@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create Haircut service in Shop A (₹500 / 50000 paise)
    const sRes = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Premium Haircut', pricePaise: 50000, durationMinutes: 30 },
    });
    if (sRes.status !== 201) console.error('sRes failed:', sRes.status, sRes.body);
    haircutIdA = sRes.body.data?.id;

    // Create Product in Shop A (₹600 / 60000 paise)
    const pRes = await h.call('POST', '/products', {
      token: ownerTokenA,
      body: {
        name: 'Styling Matte Clay',
        sku: 'CLAY-001',
        sellingPricePaise: 60000,
        costPricePaise: 30000,
        stockQuantity: 20,
        lowStockThreshold: 3,
      },
    });
    if (pRes.status !== 201) console.error('pRes failed:', pRes.status, pRes.body);
    productIdA = pRes.body.data?.id;

    // Create Worker in Shop A
    const wRes = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: {
        displayName: 'Vikram Stylist',
        phone: '+919876500111',
        serviceIds: [haircutIdA],
        commissionRatePercent: 40,
      },
    });
    if (wRes.status !== 201) console.error('wRes failed:', wRes.status, wRes.body);
    workerIdA = wRes.body.data?.id;

    // Create Customers in Shop A
    const c1 = await h.call('POST', '/customers', {
      token: ownerTokenA,
      body: { name: 'Rohan Sharma', phone: '+919988776655' },
    });
    if (c1.status !== 201) console.error('c1 failed:', c1.status, c1.body);
    customerIdA1 = c1.body.data?.id;

    const c2 = await h.call('POST', '/customers', {
      token: ownerTokenA,
      body: { name: 'Pooja Verma', phone: '+919988776644' },
    });
    if (c2.status !== 201) console.error('c2 failed:', c2.status, c2.body);
    customerIdA2 = c2.body.data?.id;
  } catch (err) {
    console.error('BEFORE EXCEPTION:', err);
    await h?.close();
    throw err;
  }
});

after(async () => {
  await h?.close();
});

describe('Phase 4: Promotional Offers & Discount Coupons', () => {
  let welcome10Id: string;
  let flat100Id: string;
  let festive20Id: string;

  describe('1. Coupon Creation & Validation', () => {
    it('creates percentage coupon with max discount cap and validates calculation', async () => {
      // 10% off up to Rs 150 (15000 paise), min order Rs 300 (30000 paise)
      const res = await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'WELCOME10',
          description: '10% off up to Rs 150 for new customers',
          discountType: 'percentage',
          discountValue: 10,
          maxDiscountPaise: 15000,
          minOrderPaise: 30000,
          applicableTo: 'all',
          maxRedemptionsPerCustomer: 1,
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.code, 'WELCOME10');
      assert.equal(res.body.data.discountType, 'percentage');
      assert.equal(res.body.data.discountValue, 10);
      assert.equal(res.body.data.maxDiscountPaise, 15000);
      welcome10Id = res.body.data.id;

      // Validate on Rs 800 order -> 10% of Rs 800 = Rs 80 (8000 paise)
      const val1 = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: {
          code: 'WELCOME10',
          subtotalPaise: 80000,
          customerId: customerIdA1,
        },
      });
      if (val1.status !== 201) console.error('val1 failed:', val1.status, JSON.stringify(val1.body));
      assert.equal(val1.status, 201);
      assert.equal(val1.body.data.valid, true);
      assert.equal(val1.body.data.discountPaise, 8000);

      // Validate on Rs 2,000 order -> 10% of Rs 2,000 is Rs 200, but cap is Rs 150 (15000 paise)
      const val2 = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: {
          code: 'WELCOME10',
          subtotalPaise: 200000,
          customerId: customerIdA1,
        },
      });
      assert.equal(val2.status, 201);
      assert.equal(val2.body.data.valid, true);
      assert.equal(val2.body.data.discountPaise, 15000); // capped at maxDiscountPaise
    });

    it('creates flat coupon with minimum order requirement and validates calculation', async () => {
      // Flat Rs 100 off (10000 paise) on orders Rs 500+ (50000 paise)
      const res = await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'FLAT100',
          description: 'Flat Rs 100 off on bills over Rs 500',
          discountType: 'flat',
          discountValue: 10000,
          minOrderPaise: 50000,
          applicableTo: 'all',
          maxRedemptionsPerCustomer: 2,
        },
      });

      assert.equal(res.status, 201);
      flat100Id = res.body.data.id;

      // Subtotal Rs 400 (40000 paise) is below Rs 500 min order -> invalid
      const belowMin = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: {
          code: 'FLAT100',
          subtotalPaise: 40000,
          customerId: customerIdA1,
        },
      });
      assert.equal(belowMin.status, 201);
      assert.equal(belowMin.body.data.valid, false);
      assert.ok(belowMin.body.data.message.includes('Minimum order amount'));

      // Subtotal Rs 600 (60000 paise) meets min order -> valid Rs 100 discount
      const validOrder = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: {
          code: 'FLAT100',
          subtotalPaise: 60000,
          customerId: customerIdA1,
        },
      });
      assert.equal(validOrder.status, 201);
      assert.equal(validOrder.body.data.valid, true);
      assert.equal(validOrder.body.data.discountPaise, 10000);
    });

    it('validates service-only coupon applicability', async () => {
      // 20% off services only
      const res = await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'FESTIVE20',
          description: '20% off all grooming services',
          discountType: 'percentage',
          discountValue: 20,
          applicableTo: 'services',
          minOrderPaise: 0,
        },
      });
      assert.equal(res.status, 201);
      festive20Id = res.body.data.id;

      // Mixed cart: ₹500 service + ₹600 product = ₹1,100 total
      // Discount applies only to ₹500 service (20% of ₹500 = ₹100 / 10000 paise)
      const mixedCart = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: {
          code: 'FESTIVE20',
          subtotalPaise: 110000,
          servicesTotalPaise: 50000,
          productsTotalPaise: 60000,
        },
      });
      assert.equal(mixedCart.status, 201);
      assert.equal(mixedCart.body.data.valid, true);
      assert.equal(mixedCart.body.data.discountPaise, 10000); // 20% on 50000, ignoring products
    });
  });

  describe('2. Invoice Creation with Coupon & Redemption Tracking', () => {
    let invoiceWithCouponId: string;

    it('creates invoice with coupon and deducts discount from grand total', async () => {
      // Haircut ₹500 (50000 paise) + FLAT100 (₹100 discount)
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA1,
          workerId: workerIdA,
          couponCode: 'FLAT100',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });

      if (invRes.status !== 201) console.error('invRes failed:', invRes.status, JSON.stringify(invRes.body));
      assert.equal(invRes.status, 201);
      const data = invRes.body.data;
      assert.equal(data.subtotalPaise, 50000);
      assert.equal(data.discountPaise, 10000); // Flat ₹100 discount
      assert.equal(data.couponDiscountPaise, 10000);
      assert.equal(data.finalTotalPaise, 40000); // 500 - 100 = 400
      invoiceWithCouponId = data.id;

      // Check coupon times_redeemed incremented to 1
      const couponCheck = await h.call('GET', `/coupons/${flat100Id}`, { token: ownerTokenA });
      assert.equal(couponCheck.status, 200);
      assert.equal(couponCheck.body.data.timesRedeemed, 1);
    });

    it('enforces per-customer redemption limit', async () => {
      // Customer A1 creates invoice with WELCOME10 (max 1 per customer)
      const firstInv = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA1,
          workerId: workerIdA,
          couponCode: 'WELCOME10',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(firstInv.status, 201);

      // Customer A1 tries to use WELCOME10 again -> Rejected
      const secondTry = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA1,
          workerId: workerIdA,
          couponCode: 'WELCOME10',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(secondTry.status, 400);
      assert.ok(secondTry.body.message.includes('maximum allowed times'));

      // But Customer A2 CAN use WELCOME10!
      const c2Try = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA2,
          workerId: workerIdA,
          couponCode: 'WELCOME10',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(c2Try.status, 201);
    });
  });

  describe('3. Usage Limits, Expiry, and Voiding Rollback', () => {
    it('enforces total maximum redemption limit', async () => {
      // Create a coupon with max_redemptions_total: 1
      const limited = await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'ONETIME50',
          description: 'Only 1 customer can use this ever',
          discountType: 'flat',
          discountValue: 5000,
          maxRedemptionsTotal: 1,
        },
      });
      assert.equal(limited.status, 201);

      // 1st redemption succeeds
      const r1 = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          couponCode: 'ONETIME50',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(r1.status, 201);

      // 2nd redemption fails total limit
      const r2 = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          couponCode: 'ONETIME50',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(r2.status, 400);
      assert.ok(r2.body.message.includes('maximum'));
    });

    it('rejects expired and deactivated coupons', async () => {
      // 1. Expired coupon
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'EXPIRED10',
          discountType: 'percentage',
          discountValue: 10,
          validUntil: yesterday,
        },
      });

      const expVal = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: { code: 'EXPIRED10', subtotalPaise: 50000 },
      });
      assert.equal(expVal.status, 201);
      assert.equal(expVal.body.data.valid, false);
      assert.ok(expVal.body.data.message.includes('expired'));

      // 2. Deactivate FLAT100
      const del = await h.call('DELETE', `/coupons/${flat100Id}`, { token: ownerTokenA });
      if (del.status !== 200) console.error('del failed:', del.status, JSON.stringify(del.body), 'flat100Id:', flat100Id);
      assert.equal(del.status, 200);

      const inactVal = await h.call('POST', '/coupons/validate', {
        token: ownerTokenA,
        body: { code: 'FLAT100', subtotalPaise: 50000 },
      });
      assert.equal(inactVal.status, 201);
      assert.equal(inactVal.body.data.valid, false);
      assert.ok(inactVal.body.data.message.includes('no longer active'));
    });

    it('voiding invoice rolls back coupon redemption and times_redeemed', async () => {
      // Create a test coupon with 0 redemptions
      const cp = await h.call('POST', '/coupons', {
        token: ownerTokenA,
        body: {
          code: 'ROLLBACK50',
          discountType: 'flat',
          discountValue: 5000,
        },
      });
      assert.equal(cp.status, 201);

      // Create invoice using ROLLBACK50
      const inv = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          couponCode: 'ROLLBACK50',
          items: [
            {
              type: 'service',
              itemId: haircutIdA,
              itemName: 'Premium Haircut',
              quantity: 1,
              unitPricePaise: 50000,
            },
          ],
        },
      });
      assert.equal(inv.status, 201);
      const invId = inv.body.data.id;

      // Verify times_redeemed = 1
      const c1 = await h.call('GET', `/coupons/${cp.body.data.id}`, { token: ownerTokenA });
      assert.equal(c1.body.data.timesRedeemed, 1);

      // Void the invoice
      const voidRes = await h.call('POST', `/billing/invoices/${invId}/void`, { token: ownerTokenA });
      assert.equal(voidRes.status, 201);

      // Verify times_redeemed rolled back to 0
      const c2 = await h.call('GET', `/coupons/${cp.body.data.id}`, { token: ownerTokenA });
      assert.equal(c2.body.data.timesRedeemed, 0);
    });
  });

  describe('4. Multi-Tenant Isolation', () => {
    it('Shop B cannot view or redeem Shop A coupon codes', async () => {
      // Shop B listing coupons should not see WELCOME10
      const listB = await h.call('GET', '/coupons', { token: ownerTokenB });
      assert.equal(listB.status, 200);
      const codesB = listB.body.data.map((c: any) => c.code);
      assert.ok(!codesB.includes('WELCOME10'));

      // Shop B cannot validate Shop A coupon
      const valB = await h.call('POST', '/coupons/validate', {
        token: ownerTokenB,
        body: { code: 'WELCOME10', subtotalPaise: 50000 },
      });
      assert.equal(valB.status, 201);
      assert.equal(valB.body.data.valid, false);
      assert.ok(valB.body.data.message.includes('does not exist'));

      // Shop B cannot view Shop A coupon details
      const viewB = await h.call('GET', `/coupons/${welcome10Id}`, { token: ownerTokenB });
      if (viewB.status !== 404) console.error('viewB failed:', viewB.status, JSON.stringify(viewB.body), 'welcome10Id:', welcome10Id);
      assert.equal(viewB.status, 404);
    });
  });

  describe('5. Public Customer Coupon Discovery & Online Booking', () => {
    it('public client can list active coupons without auth token', async () => {
      const pubList = await h.call('GET', `/coupons/public/${shopA.slug}`);
      assert.equal(pubList.status, 200);
      assert.ok(Array.isArray(pubList.body.data));
      const codes = pubList.body.data.map((c: any) => c.code);
      assert.ok(codes.includes('WELCOME10'));
    });

    it('public client can validate promo coupon and receive discount preview', async () => {
      const val = await h.call('POST', `/coupons/public/${shopA.slug}/validate`, {
        body: {
          code: 'WELCOME10',
          subtotalPaise: 50000,
          servicesTotalPaise: 50000,
          productsTotalPaise: 0,
        },
      });
      assert.equal(val.status, 201);
      assert.equal(val.body.data.valid, true);
      assert.equal(val.body.data.discountPaise, 5000); // 10% of 50000 is 5000
    });

    it('public booking records promo coupon code in appointment notes', async () => {
      // 1. Ensure shop hours exist for Monday
      await h.ownerPool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         VALUES ($1, 1, false, '09:00'::time, '21:00'::time)
         ON CONFLICT (shop_id, weekday) DO UPDATE SET is_closed = false, open_time = '09:00', close_time = '21:00'`,
        [shopA.id]
      );

      // 2. Ensure worker schedule exists for Monday
      await h.call('PUT', `/workers/${workerIdA}/schedule`, {
        token: ownerTokenA,
        body: { schedule: [{ weekday: 1, isWorking: true, startTime: '09:00', endTime: '21:00' }] },
      });

      const getNextMondayStr = (): string => {
        const d = new Date();
        const day = d.getUTCDay();
        const diff = (8 - day) % 7 || 7;
        const nextMon = new Date(d.getTime() + diff * 86400000);
        return nextMon.toISOString().slice(0, 10);
      };

      const mondayStr = getNextMondayStr();
      const bookRes = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
        body: {
          name: 'Online Booker',
          phone: '+919876599999',
          date: mondayStr,
          startTime: '11:00',
          serviceIds: [haircutIdA],
          workerId: workerIdA,
          couponCode: 'WELCOME10',
          notes: 'Customer prefers side parting',
        },
      });

      assert.equal(bookRes.status, 201);
      assert.equal(bookRes.body.success, true);
      assert.ok(bookRes.body.data.notes.includes('[Promo: WELCOME10]'));
      assert.ok(bookRes.body.data.notes.includes('side parting'));
    });
  });
});
