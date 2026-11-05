import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let customerToken: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let serviceIdA: string;

describe('Section 41: Security & Activity Audit Trail Engine', () => {
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

      const resA = await onboard('audit-shop-a', 'Audit Shop A', 'owner.a@audit.com');
      shopA = resA.shop;
      ownerTokenA = resA.token;

      const resB = await onboard('audit-shop-b', 'Audit Shop B', 'owner.b@audit.com');
      shopB = resB.shop;
      ownerTokenB = resB.token;

      // Customer account
      const custUser = (
        await h.ownerPool.query(
          `INSERT INTO users (type, name, phone, email, password_hash)
           VALUES ('customer', 'Audit Customer', '+919876543210', 'cust@audit.com', 'x') RETURNING id, name`,
          []
        )
      ).rows[0];

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      customerToken = tokens.signAccess({ id: custUser.id, type: 'customer', name: custUser.name, shop_id: null } as any);
    } catch (err) {
      console.error('Audit trail test bootstrap error:', err);
      throw err;
    }
  });

  it('1. Retrieves audit logs list with total count and pagination', async () => {
    const res = await h.call('GET', '/audit-logs?page=1&limit=10', {
      token: ownerTokenA,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.items));
    assert.strictEqual(res.body.data.page, 1);
    assert.strictEqual(res.body.data.limit, 10);
    assert.ok(typeof res.body.data.total === 'number');
  });

  it('2. Creating a service generates an audited log entry with new_values', async () => {
    const srvRes = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: {
        name: 'Royal Shave',
        durationMin: 25,
        pricePaise: 25000,
      },
    });
    assert.strictEqual(srvRes.status, 201);
    serviceIdA = srvRes.body.data.id;

    // Check audit log
    const auditRes = await h.call('GET', `/audit-logs?action=service.create&entityId=${serviceIdA}`, {
      token: ownerTokenA,
    });
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.body.data.items.length >= 1);
    const entry = auditRes.body.data.items[0];
    assert.strictEqual(entry.action, 'service.create');
    assert.strictEqual(entry.entity, 'service');
    assert.strictEqual(entry.entity_id, serviceIdA);
    assert.ok(entry.new_values);
    assert.strictEqual(entry.new_values.name, 'Royal Shave');
    assert.strictEqual(entry.new_values.pricePaise, 25000);
  });

  it('3. Updating a service logs an audit entry with both old_values and new_values diff', async () => {
    const updateRes = await h.call('PATCH', `/services/${serviceIdA}`, {
      token: ownerTokenA,
      body: {
        name: 'Royal Shave & Hot Towel',
        pricePaise: 35000,
      },
    });
    assert.strictEqual(updateRes.status, 200);

    const auditRes = await h.call('GET', `/audit-logs?action=service.update&entityId=${serviceIdA}`, {
      token: ownerTokenA,
    });
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.body.data.items.length >= 1);
    const entry = auditRes.body.data.items[0];
    assert.strictEqual(entry.action, 'service.update');
    assert.ok(entry.old_values);
    assert.ok(entry.new_values);
    assert.strictEqual(entry.old_values.pricePaise, 25000);
    assert.strictEqual(entry.new_values.pricePaise, 35000);
  });

  it('4. Filters audit logs by entity and action', async () => {
    const resEntity = await h.call('GET', '/audit-logs?entity=service', {
      token: ownerTokenA,
    });
    assert.strictEqual(resEntity.status, 200);
    assert.ok(resEntity.body.data.items.every((i: any) => i.entity === 'service'));

    const resAction = await h.call('GET', '/audit-logs?action=service.update', {
      token: ownerTokenA,
    });
    assert.strictEqual(resAction.status, 200);
    assert.ok(resAction.body.data.items.every((i: any) => i.action === 'service.update'));
  });

  it('5. Filters audit logs by entityId', async () => {
    const res = await h.call('GET', `/audit-logs?entityId=${serviceIdA}`, {
      token: ownerTokenA,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.items.length >= 2); // create and update
    assert.ok(res.body.data.items.every((i: any) => i.entity_id === serviceIdA));
  });

  it('6. Requires authentication and audit.view permission', async () => {
    // Unauthenticated
    const anonRes = await h.call('GET', '/audit-logs');
    assert.strictEqual(anonRes.status, 401);

    // Customer
    const custRes = await h.call('GET', '/audit-logs', {
      token: customerToken,
    });
    assert.strictEqual(custRes.status, 403);
  });

  it('7. Enforces multi-tenant isolation (Shop B cannot view Shop A audit logs)', async () => {
    const resB = await h.call('GET', `/audit-logs?entityId=${serviceIdA}`, {
      token: ownerTokenB,
    });
    assert.strictEqual(resB.status, 200);
    assert.strictEqual(resB.body.data.items.length, 0); // Isolated
  });

  after(async () => {
    if (h) await h.close();
  });
});
