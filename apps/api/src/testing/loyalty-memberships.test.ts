import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let haircutIdA: string;
let customerIdA: string;

before(async () => {
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

  const resA = await onboard('loyalty-shop-a', 'Loyalty Shop A', 'owner.la@example.com');
  shopA = resA.shop;
  ownerTokenA = resA.token;

  const resB = await onboard('loyalty-shop-b', 'Loyalty Shop B', 'owner.lb@example.com');
  shopB = resB.shop;
  ownerTokenB = resB.token;

  // Create Haircut service in Shop A
  const s1 = await h.call('POST', '/services', {
    token: ownerTokenA,
    body: { name: 'Haircut', pricePaise: 30000, durationMinutes: 30 },
  });
  haircutIdA = s1.body.data.id;

  // Create customer in Shop A
  const c1 = await h.call('POST', '/customers', {
    token: ownerTokenA,
    body: { name: 'Kunal Verma', phone: '+919876599901' },
  });
  customerIdA = c1.body.data.id;
});

after(async () => {
  await h?.close();
});

describe('Phase 2: Customer Loyalty Points & Memberships', () => {
  describe('1. Loyalty Program Settings', () => {
    it('returns default loyalty settings if not yet customized', async () => {
      const res = await h.call('GET', '/loyalty/settings', { token: ownerTokenA });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.isEnabled, true);
      assert.equal(res.body.data.earnPerRupeePaise, 10000); // 1 pt per Rs 100
      assert.equal(res.body.data.pointValuePaise, 100);     // 1 pt = Rs 1
      assert.equal(res.body.data.minRedeemPoints, 50);
      assert.equal(res.body.data.maxDiscountPercentage, 50);
    });

    it('allows manager/owner to update loyalty settings', async () => {
      const res = await h.call('PUT', '/loyalty/settings', {
        token: ownerTokenA,
        body: {
          earnPerRupeePaise: 5000, // 1 pt per Rs 50
          pointValuePaise: 200,    // 1 pt = Rs 2
          minRedeemPoints: 20,
          maxDiscountPercentage: 40,
        },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.earnPerRupeePaise, 5000);
      assert.equal(res.body.data.pointValuePaise, 200);
      assert.equal(res.body.data.minRedeemPoints, 20);
      assert.equal(res.body.data.maxDiscountPercentage, 40);
    });
  });

  describe('2. Points Ledger & Manual Adjustments', () => {
    it('initial customer points balance is 0', async () => {
      const res = await h.call('GET', `/loyalty/customer/${customerIdA}`, { token: ownerTokenA });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.pointsBalance, 0);
      assert.equal(res.body.data.monetaryValuePaise, 0);
    });

    it('allows manual points grant (welcome bonus) with audit trail', async () => {
      const res = await h.call('POST', '/loyalty/adjust', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          pointsDelta: 100,
          type: 'welcome_bonus',
          notes: 'Welcome bonus on sign up',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.pointsBalance, 100);
      assert.equal(res.body.data.monetaryValuePaise, 20000); // 100 pts * Rs 2 (200 paise)
      assert.equal(res.body.data.recentTransactions.length, 1);
      assert.equal(res.body.data.recentTransactions[0].type, 'welcome_bonus');
    });

    it('rejects deducting more points than the customer has', async () => {
      const res = await h.call('POST', '/loyalty/adjust', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          pointsDelta: -150,
          type: 'manual_adjustment',
        },
      });
      assert.equal(res.status, 400);
    });
  });

  describe('3. POS Billing with Loyalty Points Redemption', () => {
    it('rejects redeeming points below minRedeemPoints threshold', async () => {
      const res = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          redeemPoints: 10, // min is 20
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Haircut', quantity: 1, unitPricePaise: 30000 }],
        },
      });
      assert.equal(res.status, 400);
    });

    it('rejects redeeming points that exceed maxDiscountPercentage', async () => {
      // Subtotal = 30000 paise (Rs 300). Max discount 40% = 12000 paise (Rs 120).
      // At Rs 2/point, 70 points = 14000 paise (Rs 140), which exceeds Rs 120!
      const res = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          redeemPoints: 70,
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Haircut', quantity: 1, unitPricePaise: 30000 }],
        },
      });
      assert.equal(res.status, 400);
    });

    it('successfully redeems 50 points (Rs 100 discount) on Rs 300 bill', async () => {
      // 50 points * 200 paise = 10000 paise discount.
      // Final total = 30000 - 10000 = 20000 paise.
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          redeemPoints: 50,
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Haircut', quantity: 1, unitPricePaise: 30000 }],
        },
      });
      assert.equal(invRes.status, 201);
      assert.equal(invRes.body.data.subtotalPaise, 30000);
      assert.equal(invRes.body.data.discountPaise, 10000);
      assert.equal(invRes.body.data.finalTotalPaise, 20000);

      // Verify customer points balance was deducted (100 - 50 = 50)
      const custSummary = await h.call('GET', `/loyalty/customer/${customerIdA}`, { token: ownerTokenA });
      assert.equal(custSummary.body.data.pointsBalance, 50);

      // Pay the invoice and verify newly earned points!
      // Paid amount: 20000 paise. Earn rate: 1 pt per 5000 paise (Rs 50).
      // Earned points: 20000 / 5000 = 4 points.
      // Final balance: 50 + 4 = 54 points!
      const payRes = await h.call('POST', `/billing/invoices/${invRes.body.data.id}/pay`, {
        token: ownerTokenA,
        body: { method: 'upi_qr', amountPaise: 20000 },
      });
      assert.ok([200, 201].includes(payRes.status));
      assert.equal(payRes.body.data.paymentStatus, 'paid');

      const afterPay = await h.call('GET', `/loyalty/customer/${customerIdA}`, { token: ownerTokenA });
      if (afterPay.body.data.pointsBalance !== 54) console.log('POINTS_AFTER_PAY:', afterPay.body);
      assert.equal(afterPay.body.data.pointsBalance, 54);
    });
  });

  describe('4. Membership Plans & Subscriptions', () => {
    let planId: string;
    let customerMembershipId: string;

    it('creates a membership plan with discounts and included services', async () => {
      const res = await h.call('POST', '/memberships/plans', {
        token: ownerTokenA,
        body: {
          name: 'VIP Gold Club',
          description: 'Unlimited style with 20% off services and 2 free haircuts',
          pricePaise: 99900, // Rs 999
          durationDays: 30,
          discountPercentServices: 20,
          discountPercentProducts: 10,
          pointsMultiplier: 2.0, // 2x loyalty points on all purchases!
          includedServices: [{ serviceId: haircutIdA, quantity: 2 }],
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, 'VIP Gold Club');
      assert.equal(res.body.data.discountPercentServices, 20);
      assert.equal(res.body.data.pointsMultiplier, 2.0);
      assert.equal(res.body.data.includedServices.length, 1);
      assert.equal(res.body.data.includedServices[0].quantity, 2);
      planId = res.body.data.id;
    });

    it('lists active membership plans publicly', async () => {
      const res = await h.call('GET', `/memberships/public/${shopA.slug}/plans`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.find((p: any) => p.name === 'VIP Gold Club'));
    });

    it('assigns customer to the membership plan', async () => {
      const res = await h.call('POST', '/memberships/assign', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          planId,
          notes: 'Subscribed in shop via UPI payment',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.status, 'active');
      assert.equal(res.body.data.planName, 'VIP Gold Club');
      assert.equal(res.body.data.includedServicesUsage[0].totalAllowed, 2);
      assert.equal(res.body.data.includedServicesUsage[0].remainingCount, 2);
      customerMembershipId = res.body.data.id;
    });

    it('retrieves active membership with quota calculation', async () => {
      const res = await h.call('GET', `/memberships/customer/${customerIdA}/active`, { token: ownerTokenA });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.id, customerMembershipId);
      assert.equal(res.body.data.discountPercentServices, 20);
      assert.equal(res.body.data.pointsMultiplier, 2.0);
    });

    it('records usage when customer redeems an included free service in billing', async () => {
      // Create invoice with 1 free haircut (unitPricePaise: 0) claiming membership
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          customerMembershipId,
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Haircut (Member Free)', quantity: 1, unitPricePaise: 0 }],
        },
      });
      assert.equal(invRes.status, 201);
      assert.equal(invRes.body.data.finalTotalPaise, 0);

      // Verify remaining quota is now 1 (2 allowed - 1 used)
      const updatedMem = await h.call('GET', `/memberships/customer/${customerIdA}/active`, { token: ownerTokenA });
      assert.equal(updatedMem.body.data.includedServicesUsage[0].usedCount, 1);
      assert.equal(updatedMem.body.data.includedServicesUsage[0].remainingCount, 1);
    });
  });

  describe('5. Cross-Shop Multi-Tenant Data Isolation', () => {
    it('prevents Shop B from viewing or accessing Shop A customer loyalty data', async () => {
      const res = await h.call('GET', `/loyalty/customer/${customerIdA}`, { token: ownerTokenB });
      assert.equal(res.status, 404);
    });

    it('prevents Shop B from viewing Shop A membership subscriptions', async () => {
      const res = await h.call('GET', `/memberships/customer/${customerIdA}/active`, { token: ownerTokenB });
      assert.equal(res.status, 200);
      assert.equal(res.body.data, null);
    });
  });
});
