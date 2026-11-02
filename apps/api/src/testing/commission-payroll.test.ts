import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let workerTokenVikram: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let haircutIdA: string;
let productIdA: string;
let customerIdA: string;
let workerIdVikram: string;
let workerIdDeepak: string;

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

  const resA = await onboard('commission-shop-a', 'Commission Shop A', 'owner.ca@example.com');
  shopA = resA.shop;
  ownerTokenA = resA.token;

  const resB = await onboard('commission-shop-b', 'Commission Shop B', 'owner.cb@example.com');
  shopB = resB.shop;
  ownerTokenB = resB.token;

  // Create Haircut service in Shop A (Rs 500)
  const s1 = await h.call('POST', '/services', {
    token: ownerTokenA,
    body: { name: 'Premium Haircut', pricePaise: 50000, durationMinutes: 45 },
  });
  haircutIdA = s1.body.data.id;

  // Create Product in Shop A (Rs 600)
  const p1 = await h.call('POST', '/products', {
    token: ownerTokenA,
    body: {
      name: 'Matte Hair Clay',
      sku: 'CLAY-001',
      costPricePaise: 30000,
      sellingPricePaise: 60000,
      stockQuantity: 10,
    },
  });
  productIdA = p1.body.data.id;

  // Create customer in Shop A
  const c1 = await h.call('POST', '/customers', {
    token: ownerTokenA,
    body: { name: 'Aman Gupta', phone: '+919876543201' },
  });
  customerIdA = c1.body.data.id;

  // Create Worker 1: Vikram (40% service comm, 10% product comm) with login
  const w1 = await h.call('POST', '/workers', {
    token: ownerTokenA,
    body: {
      displayName: 'Vikram Stylist',
      phone: '+919876543211',
      email: 'vikram@shop-a.com',
      commissionRatePercent: 40,
      productCommissionRatePercent: 10,
      serviceIds: [haircutIdA],
      login: {
        email: 'vikram@shop-a.com',
        phone: '+919876543211',
        password: 'WorkerPassword!1',
      },
    },
  });
  workerIdVikram = w1.body.data.id;

  // Create Worker 2: Deepak (30% service comm, 5% product comm)
  const w2 = await h.call('POST', '/workers', {
    token: ownerTokenA,
    body: {
      displayName: 'Deepak Barber',
      phone: '+919876543212',
      commissionRatePercent: 30,
      productCommissionRatePercent: 5,
      serviceIds: [haircutIdA],
    },
  });
  workerIdDeepak = w2.body.data.id;

  // Create JWT for Vikram
  const { TokenService } = await import('../core/token.service');
  const tokens = new TokenService();
  workerTokenVikram = tokens.signAccess({
    id: w1.body.data.userId,
    type: 'staff',
    name: 'Vikram Stylist',
    shop_id: shopA.id,
  } as any);

  // Give Worker role commission.view permission with 'own' scope
  const workerRoleIdA = (
    await h.ownerPool.query(`SELECT id FROM roles WHERE shop_id = $1 AND system_key = 'worker'`, [shopA.id])
  ).rows[0].id;
  const commViewPermId = (await h.ownerPool.query(`SELECT id FROM permissions WHERE key = 'commission.view'`)).rows[0].id;
  await h.ownerPool.query(
    `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) VALUES ($1, $2, $3, 'own') ON CONFLICT DO NOTHING`,
    [workerRoleIdA, shopA.id, commViewPermId]
  );
});

after(async () => {
  await h?.close();
});

describe('Phase 3: Staff Commission & Tip Payout Ledger', () => {
  describe('1. Automatic Service Commission Accrual', () => {
    it('awards 40% commission to assigned worker upon full service invoice payment', async () => {
      // Create invoice for Rs 500 service
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          workerId: workerIdVikram,
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Premium Haircut', quantity: 1, unitPricePaise: 50000 }],
        },
      });
      assert.equal(invRes.status, 201);
      const invId = invRes.body.data.id;

      // Pay invoice
      const payRes = await h.call('POST', `/billing/invoices/${invId}/pay`, {
        token: ownerTokenA,
        body: { method: 'cash', amountPaise: 50000 },
      });
      assert.ok([200, 201].includes(payRes.status));

      // Verify commission ledger entry: 40% of 50000 = 20000 paise (Rs 200)
      const summaryRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      assert.equal(summaryRes.status, 200);
      const vikram = summaryRes.body.data.find((w: any) => w.workerId === workerIdVikram);
      assert.ok(vikram);
      assert.equal(vikram.totalServiceCommissionPaise, 20000);
      assert.equal(vikram.balancePendingPaise, 20000);
    });
  });

  describe('2. Product Commission & Tip Handling', () => {
    it('awards 10% product commission when retail product is sold', async () => {
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          workerId: workerIdVikram,
          items: [{ type: 'product', itemId: productIdA, itemName: 'Matte Hair Clay', quantity: 1, unitPricePaise: 60000 }],
        },
      });
      assert.equal(invRes.status, 201);
      const invId = invRes.body.data.id;

      await h.call('POST', `/billing/invoices/${invId}/pay`, {
        token: ownerTokenA,
        body: { method: 'upi_qr', amountPaise: 60000 },
      });

      // 10% of 60000 = 6000 paise (Rs 60). Prior balance was 20000 => now 26000
      const summaryRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      const vikram = summaryRes.body.data.find((w: any) => w.workerId === workerIdVikram);
      assert.equal(vikram.totalProductCommissionPaise, 6000);
      assert.equal(vikram.balancePendingPaise, 26000);
    });

    it('credits tip directly to assigned worker', async () => {
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          workerId: workerIdVikram,
          tipPaise: 5000, // Rs 50 tip
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Premium Haircut', quantity: 1, unitPricePaise: 50000 }],
        },
      });
      assert.equal(invRes.status, 201);
      // Final total = 50000 + 5000 tip = 55000 paise
      assert.equal(invRes.body.data.finalTotalPaise, 55000);
      const invId = invRes.body.data.id;

      await h.call('POST', `/billing/invoices/${invId}/pay`, {
        token: ownerTokenA,
        body: { method: 'cash', amountPaise: 55000 },
      });

      // Service comm: +20000, Tip: +5000 => Prior balance was 26000 => now 26000 + 25000 = 51000 paise
      const summaryRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      const vikram = summaryRes.body.data.find((w: any) => w.workerId === workerIdVikram);
      assert.equal(vikram.totalTipsPaise, 5000);
      assert.equal(vikram.totalEarnedPaise, 51000);
      assert.equal(vikram.balancePendingPaise, 51000);
    });
  });

  describe('3. Payout Settlements & Expense Logging', () => {
    it('settles payout, deducts pending balance, and logs shop expense', async () => {
      const payoutRes = await h.call('POST', '/commission/payout', {
        token: ownerTokenA,
        body: {
          workerId: workerIdVikram,
          amountPaise: 30000, // Rs 300 payout
          paymentMethod: 'upi',
          notes: 'Weekly commission settlement',
          recordExpense: true,
        },
      });
      assert.equal(payoutRes.status, 201);
      assert.ok(payoutRes.body.data.id);
      assert.ok(payoutRes.body.data.expenseId);

      // Verify new balance: 51000 - 30000 = 21000 paise
      const summaryRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      const vikram = summaryRes.body.data.find((w: any) => w.workerId === workerIdVikram);
      assert.equal(vikram.totalPaidOutPaise, 30000);
      assert.equal(vikram.balancePendingPaise, 21000);

      // Verify expense record in database
      const expRes = await h.call('GET', '/finance/expenses?limit=10', { token: ownerTokenA });
      assert.equal(expRes.status, 200);
      const payoutExp = expRes.body.data.items.find((e: any) => e.amountPaise === 30000);
      assert.ok(payoutExp);
      assert.ok(payoutExp.description.includes('Vikram Stylist'));
    });

    it('allows manual bonus adjustment', async () => {
      const adjRes = await h.call('POST', '/commission/adjust', {
        token: ownerTokenA,
        body: {
          workerId: workerIdVikram,
          amountPaise: 5000, // Rs 50 bonus
          type: 'manual_adjustment',
          notes: 'Festival performance bonus',
        },
      });
      assert.equal(adjRes.status, 201);

      // Balance was 21000 => now 26000
      const historyRes = await h.call('GET', `/commission/worker/${workerIdVikram}`, { token: ownerTokenA });
      assert.equal(historyRes.status, 200);
      assert.equal(historyRes.body.data.summary.balancePendingPaise, 26000);
      assert.equal(historyRes.body.data.summary.totalBonusesPaise, 5000);
    });
  });

  describe('4. Invoice Voiding Reversal', () => {
    it('reverses earned commissions when invoice is voided', async () => {
      // Deepak performs haircut: 30% of 50000 = 15000 paise (Rs 150)
      const invRes = await h.call('POST', '/billing/invoices', {
        token: ownerTokenA,
        body: {
          customerId: customerIdA,
          workerId: workerIdDeepak,
          items: [{ type: 'service', itemId: haircutIdA, itemName: 'Premium Haircut', quantity: 1, unitPricePaise: 50000 }],
        },
      });
      const invId = invRes.body.data.id;

      await h.call('POST', `/billing/invoices/${invId}/pay`, {
        token: ownerTokenA,
        body: { method: 'cash', amountPaise: 50000 },
      });

      // Verify Deepak has 15000 pending
      let sumRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      let deepak = sumRes.body.data.find((w: any) => w.workerId === workerIdDeepak);
      assert.equal(deepak.balancePendingPaise, 15000);

      // Void the invoice
      const voidRes = await h.call('POST', `/billing/invoices/${invId}/void`, { token: ownerTokenA });
      assert.equal(voidRes.status, 201);

      // Verify Deepak's commission was reversed back to 0
      sumRes = await h.call('GET', '/commission/summary', { token: ownerTokenA });
      deepak = sumRes.body.data.find((w: any) => w.workerId === workerIdDeepak);
      assert.equal(deepak.balancePendingPaise, 0);
    });
  });

  describe('5. RBAC Own Scope & Cross-Shop Isolation', () => {
    it('worker can view only their own earnings, not other workers', async () => {
      // Vikram accesses his own history
      const selfRes = await h.call('GET', `/commission/worker/${workerIdVikram}`, { token: workerTokenVikram });
      assert.equal(selfRes.status, 200);
      assert.equal(selfRes.body.data.worker.displayName, 'Vikram Stylist');

      // Vikram tries to view Deepak's history -> 404 (existence not disclosed)
      const peerRes = await h.call('GET', `/commission/worker/${workerIdDeepak}`, { token: workerTokenVikram });
      assert.equal(peerRes.status, 404);

      // Vikram gets summary -> only returns his own profile
      const sumRes = await h.call('GET', '/commission/summary', { token: workerTokenVikram });
      assert.equal(sumRes.status, 200);
      assert.equal(sumRes.body.data.length, 1);
      assert.equal(sumRes.body.data[0].workerId, workerIdVikram);
    });

    it('prevents Shop B from viewing Shop A commissions', async () => {
      const res = await h.call('GET', `/commission/worker/${workerIdVikram}`, { token: ownerTokenB });
      assert.equal(res.status, 404);

      const sumRes = await h.call('GET', '/commission/summary', { token: ownerTokenB });
      assert.equal(sumRes.status, 200);
      assert.equal(sumRes.body.data.length, 0);
    });
  });
});
