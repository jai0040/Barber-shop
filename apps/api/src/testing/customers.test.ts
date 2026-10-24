import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

describe('Phase 5: Customers & Customer Preferences', () => {
  let h: Harness;
  let ownerTokenA: string;
  let ownerTokenB: string;
  let workerTokenRahul: string;
  let customerTokenJay: string;
  let shopA: { id: string; slug: string };
  let shopB: { id: string; slug: string };
  let rahulId: string;
  let amitId: string;

  before(async () => {
    h = await boot(25435);

    // Onboard Shop A & Shop B
    const onboard = async (slug: string, name: string, email: string) => {
      const s = (await h.ownerPool.query(
        `INSERT INTO shops (name, slug, timezone, status) VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
        [name, slug]
      )).rows[0];

      const r = (await h.ownerPool.query(
        `INSERT INTO roles (shop_id, name, is_system, system_key)
         VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
        [s.id]
      )).rows;
      const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

      const u = (await h.ownerPool.query(
        `INSERT INTO users (type, name, email, password_hash, shop_id)
         VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
        [name + ' Owner', email, s.id]
      )).rows[0];

      await h.ownerPool.query(
        `INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`,
        [u.id, s.id, ownerRoleId]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('classic-barber', 'Classic Barber', 'owner.a@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('royal-barber', 'Royal Barber', 'owner.b@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create workers Rahul and Amit in Shop A
    const w1 = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: { displayName: 'Rahul', phone: '+919876543201', email: 'rahul@classic.com' },
    });
    rahulId = w1.body.data.id;

    const w2 = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: { displayName: 'Amit', phone: '+919876543202', email: 'amit@classic.com' },
    });
    amitId = w2.body.data.id;

    // Fetch user for Rahul to create worker token
    const rahulUser = (await h.ownerPool.query(`SELECT id, name FROM users WHERE email = 'rahul@classic.com'`)).rows[0];
    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    workerTokenRahul = tokens.signAccess({
      id: rahulUser.id,
      type: 'staff',
      name: rahulUser.name,
      shop_id: shopA.id,
    } as any);

    // Register customer Jay
    const regRes = await h.call('POST', '/auth/register', {
      body: { name: 'Jay Patel', phone: '+919876500001', email: 'jay@example.com', password: 'Password!123' },
    });
    customerTokenJay = regRes.body.data.token;
  });

  after(async () => {
    await h.close();
  });

  describe('Customer Creation & Validation', () => {
    let customerJayId: string;

    it('creates customer in Shop A with preferred barber and preferences notes', async () => {
      const res = await h.call('POST', '/customers', {
        token: ownerTokenA,
        body: {
          name: 'Jay Patel',
          phone: '+919876500001',
          email: 'jay@example.com',
          preferredWorkerId: rahulId,
          notes: 'Prefers short haircut, zero fade on sides',
        },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Jay Patel');
      assert.equal(res.body.data.preferredWorkerId, rahulId);
      assert.equal(res.body.data.preferredWorkerName, 'Rahul');
      assert.equal(res.body.data.notes, 'Prefers short haircut, zero fade on sides');
      customerJayId = res.body.data.id;
    });

    it('rejects duplicate phone within the same shop', async () => {
      const dup = await h.call('POST', '/customers', {
        token: ownerTokenA,
        body: {
          name: 'Another Jay',
          phone: '+919876500001',
        },
      });
      assert.equal(dup.status, 409);
    });

    it('allows same phone in different shop (Shop A vs Shop B customer isolation)', async () => {
      const shopBRes = await h.call('POST', '/customers', {
        token: ownerTokenB,
        body: {
          name: 'Jay Patel',
          phone: '+919876500001',
          notes: 'Customer visited Royal Barber too',
        },
      });
      assert.equal(shopBRes.status, 201);
      assert.equal(shopBRes.body.data.notes, 'Customer visited Royal Barber too');
    });

    it('updates customer preferences and notes', async () => {
      const upd = await h.call('PATCH', `/customers/${customerJayId}`, {
        token: ownerTokenA,
        body: {
          preferredWorkerId: amitId,
          notes: 'Prefers medium textured crop with beard shape-up',
        },
      });
      assert.equal(upd.status, 200);
      assert.equal(upd.body.data.preferredWorkerId, amitId);
      assert.equal(upd.body.data.preferredWorkerName, 'Amit');
      assert.equal(upd.body.data.notes, 'Prefers medium textured crop with beard shape-up');
    });

    it('Shop B cannot view or edit Shop A customer records (404)', async () => {
      const cross = await h.call('GET', `/customers/${customerJayId}`, { token: ownerTokenB });
      assert.equal(cross.status, 404);

      const crossPatch = await h.call('PATCH', `/customers/${customerJayId}`, {
        token: ownerTokenB,
        body: { name: 'Hacked' },
      });
      assert.equal(crossPatch.status, 404);
    });
  });

  describe('Worker Customer Access (Rule 34 & Permission Scopes)', () => {
    it('worker only sees customers matching their scope', async () => {
      // Create a customer with preferred barber = Rahul
      await h.call('POST', '/customers', {
        token: ownerTokenA,
        body: { name: 'Rahul Fan', phone: '+919876500002', preferredWorkerId: rahulId },
      });

      // Rahul list customers (scope = own): should only see customers where preferredWorkerId is Rahul
      const list = await h.call('GET', '/customers', { token: workerTokenRahul });
      assert.equal(list.status, 200);
      assert.ok(list.body.data.items.length >= 1);
      assert.ok(list.body.data.items.every((c: any) => c.preferredWorkerId === rahulId));
    });
  });

  describe('Customer Self Profile', () => {
    it('logged in customer can access their own profile across shops', async () => {
      const me = await h.call('GET', '/customers/me/profile', { token: customerTokenJay });
      assert.equal(me.status, 200);
      assert.ok(Array.isArray(me.body.data));
      assert.ok(me.body.data.length >= 1);
      assert.equal(me.body.data[0].phone, '+919876500001');
    });
  });
});
