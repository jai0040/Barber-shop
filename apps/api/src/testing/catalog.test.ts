import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {}, S: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const call = (m: string, p: string, token?: string, body?: unknown) => h.call(m, p, { token, body });

before(async () => {
  h = await boot();
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await login('root@platform.test');
  for (const [k, name, slug, phone] of [['A', 'Classic Barber Shop', 'classic', '9000000001'], ['B', 'Sharp Cuts', 'sharp', '9000000002']]) {
    const r = await call('POST', '/platform/shops', T.platform, { name, slug, owner: { name: name + ' Owner', phone, password: pw } });
    ID['shop' + k] = r.body.data.id; T['owner' + k] = await login(phone);
  }
  const roles = Object.fromEntries((await call('GET', '/roles', T.ownerA)).body.data.map((r: any) => [r.system_key, r.id]));
  for (const [k, phone, role] of [['managerA', '9000000012', 'manager'], ['cashierA', '9000000013', 'cashier']]) {
    await call('POST', '/users', T.ownerA, { name: k + ' person', phone, password: pw, roleIds: [roles[role]] }); T[k] = await login(phone);
  }
  await h.call('POST', '/auth/register', { body: { name: 'Jay Patel', phone: '9876543210', password: pw } });
  T.cust = await login('9876543210');
});
after(() => h?.close());

describe('4A: permissions', () => {
  it('only roles with services.* may change the catalog; staff can read it; customers and anonymous cannot', async () => {
    for (const t of [T.managerA, T.cashierA, T.cust]) assert.equal((await call('POST', '/services', t, { name: 'Haircut', pricePaise: 30000, durationMin: 30 })).status, 403);
    assert.equal((await call('POST', '/services/categories', T.managerA, { name: 'Hair' })).status, 403);
    assert.equal((await call('GET', '/services', T.cashierA)).status, 200);
    assert.equal((await call('GET', '/services', T.cust)).status, 403);
    assert.equal((await call('GET', '/services')).status, 401);
  });
});

describe('4A: categories', () => {
  it('create, case-insensitive duplicate 409, list; /categories is not captured by /:id', async () => {
    const c = await call('POST', '/services/categories', T.ownerA, { name: 'Hair', sortOrder: 1 });
    assert.equal(c.status, 201); ID.catHair = c.body.data.id;
    assert.equal((await call('POST', '/services/categories', T.ownerA, { name: 'hair' })).status, 409);
    ID.catFace = (await call('POST', '/services/categories', T.ownerA, { name: 'Face', sortOrder: 2 })).body.data.id;
    const l = await call('GET', '/services/categories', T.ownerA);
    assert.equal(l.status, 200); assert.deepEqual(l.body.data.map((x: any) => x.name), ['Hair', 'Face']);
    assert.equal((await call('POST', '/services/categories', T.ownerA, { name: 'X' })).status, 400);
  });
  it('rename (duplicate rejected); cannot delete while holding services; empty ones can go', async () => {
    assert.equal((await call('PATCH', `/services/categories/${ID.catFace}`, T.ownerA, { name: 'Facials' })).status, 200);
    assert.equal((await call('PATCH', `/services/categories/${ID.catFace}`, T.ownerA, { name: 'hair' })).status, 409);
    const tmp = (await call('POST', '/services/categories', T.ownerA, { name: 'Empty' })).body.data.id;
    assert.equal((await call('DELETE', `/services/categories/${tmp}`, T.ownerA)).status, 200);
    assert.equal((await call('DELETE', `/services/categories/${tmp}`, T.ownerA)).status, 404);
  });
});

describe('4A: services', () => {
  it('validates price/duration/name; money must be whole paise; ₹0 is allowed', async () => {
    const bad = async (b: object) => assert.equal((await call('POST', '/services', T.ownerA, { name: 'Test svc', pricePaise: 100, durationMin: 30, ...b })).status, 400, JSON.stringify(b));
    await bad({ pricePaise: -1 }); await bad({ pricePaise: 10_000_001 }); await bad({ pricePaise: 150.5 }); await bad({ pricePaise: '300' });
    await bad({ durationMin: 4 }); await bad({ durationMin: 481 }); await bad({ durationMin: 30.5 }); await bad({ name: 'X' }); await bad({ categoryId: 'nope' });
    const free = await call('POST', '/services', T.ownerA, { name: 'Free Consultation', pricePaise: 0, durationMin: 5 });
    assert.equal(free.status, 201); await call('DELETE', `/services/${free.body.data.id}`, T.ownerA);
  });
  it('creates the demo catalog', async () => {
    const mk = async (name: string, price: number, dur: number, cat: string) => {
      const r = await call('POST', '/services', T.ownerA, { name, pricePaise: price, durationMin: dur, categoryId: cat, description: name + ' service' });
      assert.equal(r.status, 201, name); return r.body.data.id as string;
    };
    S.haircut = await mk('Haircut', 30000, 30, ID.catHair); S.beard = await mk('Beard', 15000, 15, ID.catHair);
    S.color = await mk('Hair Color', 80000, 60, ID.catHair); S.facial = await mk('Facial', 60000, 45, ID.catFace);
    const l = (await call('GET', '/services', T.ownerA)).body.data;
    assert.equal(l.total, 4); assert.equal(l.items.find((s: any) => s.name === 'Haircut').categoryName, 'Hair');
  });
  it('category with services cannot be deleted', async () => {
    const r = await call('DELETE', `/services/categories/${ID.catHair}`, T.ownerA);
    assert.equal(r.status, 409); assert.match(r.body.message, /3 service/);
  });
  it('duplicate active names rejected (case-insensitive); archived names can be reused', async () => {
    assert.equal((await call('POST', '/services', T.ownerA, { name: 'HAIRCUT', pricePaise: 1, durationMin: 5 })).status, 409);
    const tmp = (await call('POST', '/services', T.ownerA, { name: 'Temp Cut', pricePaise: 10000, durationMin: 20 })).body.data.id;
    assert.equal((await call('DELETE', `/services/${tmp}`, T.ownerA)).status, 200);
    const again = await call('POST', '/services', T.ownerA, { name: 'Temp Cut', pricePaise: 12000, durationMin: 20 });
    assert.equal(again.status, 201);
    assert.equal((await call('POST', `/services/${tmp}/restore`, T.ownerA)).status, 409);   // name now taken
    assert.equal((await call('DELETE', `/services/${tmp}`, T.ownerA)).status, 409);          // already archived
    assert.equal((await call('PATCH', `/services/${tmp}`, T.ownerA, { pricePaise: 5 })).status, 409); // archived can't be edited
    await call('DELETE', `/services/${again.body.data.id}`, T.ownerA);
    assert.equal((await call('POST', `/services/${tmp}/restore`, T.ownerA)).status, 200);    // name free again
    await call('DELETE', `/services/${tmp}`, T.ownerA);
  });
  it('PRICE HISTORY: a change is audited with old/new values; no-op edits add no noise', async () => {
    const r = await call('PATCH', `/services/${S.haircut}`, T.ownerA, { pricePaise: 35000 });
    assert.equal(r.status, 200); assert.equal(r.body.data.pricePaise, 35000);
    const log = (await call('GET', `/audit-logs?action=service.update&entityId=${S.haircut}`, T.ownerA)).body.data.items[0];
    assert.deepEqual(log.old_values, { pricePaise: 30000 }); assert.deepEqual(log.new_values, { pricePaise: 35000 });
    assert.equal((await call('PATCH', `/services/${S.haircut}`, T.managerA, { pricePaise: 1 })).status, 403);
    await call('PATCH', `/services/${S.haircut}`, T.ownerA, { pricePaise: 30000 });
    assert.equal((await call('PATCH', `/services/${S.haircut}`, T.ownerA, { pricePaise: 30000 })).status, 200);
    assert.equal((await call('GET', `/audit-logs?action=service.update&entityId=${S.haircut}`, T.ownerA)).body.data.total, 2);
    assert.equal((await call('PATCH', `/services/${S.haircut}`, T.ownerA, {})).status, 400);
  });
  it('list filters, pagination and literal-% search', async () => {
    assert.deepEqual((await call('GET', '/services?q=beard', T.ownerA)).body.data.items.map((s: any) => s.name), ['Beard']);
    assert.equal((await call('GET', `/services?categoryId=${ID.catFace}`, T.ownerA)).body.data.total, 1);
    const p = (await call('GET', '/services?limit=2&page=2', T.ownerA)).body.data; assert.equal(p.items.length, 2); assert.equal(p.total, 4);
    assert.equal((await call('GET', '/services?limit=500', T.ownerA)).status, 400);
    assert.equal((await call('GET', '/services?q=%25', T.ownerA)).body.data.total, 0);
  });
  it('archived services are hidden unless asked for', async () => {
    assert.equal((await call('GET', '/services', T.ownerA)).body.data.items.some((s: any) => s.archived), false);
    assert.equal((await call('GET', '/services?includeArchived=true', T.ownerA)).body.data.items.some((s: any) => s.archived), true);
  });
});

describe('4A: TENANT ISOLATION', () => {
  it("Shop B cannot read or change Shop A's services and categories (404)", async () => {
    for (const [m, p, b] of [['GET', `/services/${S.haircut}`], ['PATCH', `/services/${S.haircut}`, { name: 'Pwned' }], ['DELETE', `/services/${S.haircut}`],
      ['POST', `/services/${S.haircut}/restore`], ['PATCH', `/services/categories/${ID.catHair}`, { name: 'Pwned' }], ['DELETE', `/services/categories/${ID.catHair}`]] as any)
      assert.equal((await call(m, p, T.ownerB, b)).status, 404, `${m} ${p}`);
    assert.equal((await call('GET', '/services', T.ownerB)).body.data.total, 0);
    assert.equal((await call('GET', '/services/categories', T.ownerB)).body.data.length, 0);
  });
  it("Shop B cannot attach A's category; the same name is fine in another shop; A is untouched", async () => {
    assert.equal((await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25, categoryId: ID.catHair })).status, 400);
    assert.equal((await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25 })).status, 201);
    assert.equal((await call('GET', `/services/${S.haircut}`, T.ownerA)).body.data.pricePaise, 30000);
  });
});

describe('4A: public services (customer website)', () => {
  it('groups bookable services by category and exposes no internal fields', async () => {
    const r = (await call('GET', '/shops/public/classic/services')).body.data;
    assert.deepEqual(r.categories.map((c: any) => c.name), ['Hair', 'Facials']);
    assert.deepEqual(r.categories[0].services.map((s: any) => s.name), ['Beard', 'Hair Color', 'Haircut']);
    assert.equal(r.categories[0].services.find((s: any) => s.name === 'Haircut').pricePaise, 30000);
    for (const k of ['archived', 'status', 'shop_id', 'shopId']) assert.equal(JSON.stringify(r).includes(`"${k}"`), false, k);
  });
  it('inactive and archived services disappear; unknown shop is 404; shops are separate', async () => {
    await call('PATCH', `/services/${S.beard}`, T.ownerA, { status: 'inactive' });
    assert.equal((await call('GET', '/shops/public/classic/services')).body.data.categories[0].services.some((s: any) => s.name === 'Beard'), false);
    await call('PATCH', `/services/${S.beard}`, T.ownerA, { status: 'active' });
    assert.equal((await call('GET', '/shops/public/nope-shop/services')).status, 404);
    assert.equal((await call('GET', '/shops/public/BAD_SLUG!/services')).status, 400);
    const b = (await call('GET', '/shops/public/sharp/services')).body.data;
    assert.deepEqual(b.uncategorized.map((s: any) => s.name), ['Haircut']); assert.equal(b.uncategorized[0].pricePaise, 25000);
  });
  it('suspended shops are hidden', async () => {
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'suspended' });
    assert.equal((await call('GET', '/shops/public/sharp/services')).status, 404);
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'active' });
  });
});

describe('4A: DATABASE-LEVEL guarantees', () => {
  it('composite FK: a service cannot reference another shop\'s category, even with owner-level SQL', async () => {
    await assert.rejects(h.ownerPool.query(`INSERT INTO services (shop_id, category_id, name, price_paise, duration_min) VALUES ($1,$2,'X Svc',100,10)`, [ID.shopB, ID.catHair]), /foreign key/);
  });
  it('CHECK constraints hold without the API', async () => {
    await assert.rejects(h.ownerPool.query(`INSERT INTO services (shop_id, name, price_paise, duration_min) VALUES ($1,'Neg',-5,10)`, [ID.shopA]), /services_price_paise_check/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO services (shop_id, name, price_paise, duration_min) VALUES ($1,'Zero',100,0)`, [ID.shopA]), /services_duration_min_check/);
  });
  it('RLS: no context sees nothing; shop context sees only its shop; public sees only bookable, read-only', async () => {
    const q = async (setup: [string, string][], sql: string) => {
      const c = await h.appPool.connect();
      try { await c.query('BEGIN'); for (const [k, v] of setup) await c.query('SELECT set_config($1,$2,true)', [k, v]); const r = (await c.query(sql)).rows[0].n; await c.query('ROLLBACK'); return r; } finally { c.release(); }
    };
    for (const t of ['services', 'service_categories']) assert.equal(await q([], `SELECT count(*)::int n FROM ${t}`), 0, t);
    assert.equal(await q([['app.shop_id', ID.shopB]], `SELECT count(*)::int n FROM services WHERE shop_id <> '${ID.shopB}'`), 0);
    const pub: [string, string][] = [['app.public_read', 'on']];
    assert.equal(await q(pub, `SELECT count(*)::int n FROM services WHERE status <> 'active' OR archived_at IS NOT NULL`), 0);
    assert.ok((await q(pub, 'SELECT count(*)::int n FROM services')) >= 4);
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN'); await c.query(`SELECT set_config('app.public_read','on',true)`);
      assert.equal((await c.query('UPDATE services SET price_paise = 1')).rowCount, 0);   // nothing is writable from public scope
      assert.equal((await c.query('DELETE FROM services')).rowCount, 0);
      await assert.rejects(c.query(`INSERT INTO services (shop_id, name, price_paise, duration_min) VALUES ($1,'Evil',1,5)`, [ID.shopA]), /row-level security/); // last: a failed statement aborts the txn
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
  it('audit trail covers the catalog', async () => {
    const actions = new Set((await call('GET', '/audit-logs?limit=100', T.ownerA)).body.data.items.map((i: any) => i.action));
    for (const a of ['category.create', 'category.update', 'category.delete', 'service.create', 'service.update', 'service.archive', 'service.restore']) assert.ok(actions.has(a), a);
  });
});
