import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {}, S: Record<string, string> = {}, W: Record<string, string> = {}, C: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const call = (m: string, p: string, token?: string, body?: unknown) => h.call(m, p, { token, body });
const register = async (name: string, phone: string) => { await h.call('POST', '/auth/register', { body: { name, phone, password: pw } }); return login(phone); };
const mk = (t: string, name: string, phone: string, extra: object = {}) => call('POST', '/customers', t, { name, phone, ...extra });

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
  for (const [name, phone] of [['Rahul', '9000000021'], ['Amit', '9000000022']]) {
    const r = await call('POST', '/workers', T.ownerA, { displayName: name, login: { phone, password: pw } }); W[name] = r.body.data.id; T[name] = await login(phone);
  }
  W.Bhavin = (await call('POST', '/workers', T.ownerB, { displayName: 'Bhavin' })).body.data.id;
  S.haircut = (await call('POST', '/services', T.ownerA, { name: 'Haircut', pricePaise: 30000, durationMin: 30 })).body.data.id;
  S.beard = (await call('POST', '/services', T.ownerA, { name: 'Beard', pricePaise: 15000, durationMin: 15 })).body.data.id;
  S.haircutB = (await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25 })).body.data.id;
  T.jay = await register('Jay Patel', '9876543210');
});
after(() => h?.close());

describe('5: staff creating & validating customers', () => {
  it('roles with customers.create can add; customers/anonymous cannot; phone is normalised', async () => {
    assert.equal((await mk(T.jay, 'Nope Person', '9300000099')).status, 403);
    assert.equal((await mk(undefined as any, 'Nope Person', '9300000099')).status, 401);
    const r = await mk(T.cashierA, 'Aarav Shah', '94000 00001', { email: 'Aarav@Mail.com', notes: 'Prefers short haircut', internalNotes: 'Pays late' });
    assert.equal(r.status, 201); C.aarav = r.body.data.id;
    assert.equal(r.body.data.phone, '+919400000001'); assert.equal(r.body.data.email, 'aarav@mail.com'); assert.equal(r.body.data.hasAccount, false);
    assert.equal(r.body.data.internalNotes, 'Pays late');
  });
  it('validates input', async () => {
    const bad = async (b: object, why: string) => assert.equal((await call('POST', '/customers', T.ownerA, { name: 'Valid Name', phone: '9400000050', ...b })).status, 400, why);
    await bad({ name: 'X' }, 'short name'); await bad({ phone: '123' }, 'bad phone'); await bad({ email: 'nope' }, 'bad email'); await bad({ notes: 'x'.repeat(501) }, 'long notes');
    await bad({ internalNotes: 'x'.repeat(1001) }, 'long internal notes'); await bad({ preferredWorkerId: '11111111-1111-4111-8111-111111111111' }, 'unknown worker');
    await bad({ preferredWorkerId: W.Bhavin }, "other shop's worker"); await bad({ serviceIds: [S.haircutB] }, "other shop's service"); await bad({ preferredWorkerId: 'nope' }, 'not a uuid');
    assert.equal((await call('POST', '/customers', T.ownerA, { phone: '9400000050' })).status, 400);
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'inactive' });
    await bad({ preferredWorkerId: W.Amit }, 'inactive worker');
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'active' });
  });
  it('DUPLICATE PHONE: refused in the same shop (any format), allowed in another shop', async () => {
    const d = await mk(T.ownerA, 'Dup Aarav', '+91 94000-00001');
    assert.equal(d.status, 409); assert.deepEqual(d.body.details, { customerId: C.aarav }); // owner may be told which record
    assert.equal((await mk(T.ownerB, 'Aarav Elsewhere', '9400000001')).status, 201);
  });
  it('preferences: preferred barber and service preferences are stored', async () => {
    const r = await mk(T.ownerA, 'Priya Patel', '9400000002', { preferredWorkerId: W.Rahul, serviceIds: [S.haircut, S.beard] });
    assert.equal(r.status, 201); C.priya = r.body.data.id;
    assert.equal(r.body.data.preferredWorkerName, 'Rahul'); assert.deepEqual(r.body.data.serviceIds.sort(), [S.haircut, S.beard].sort());
  });
});

describe('5: search & filters', () => {
  const names = async (q: string, t = T.ownerA) => (await call('GET', `/customers?${q}`, t)).body.data.items.map((c: any) => c.name);
  it('by name, phone (any format, partial) and combined filters', async () => {
    assert.deepEqual(await names('q=aarav'), ['Aarav Shah']);
    assert.deepEqual(await names('q=9400000002'), ['Priya Patel']);
    assert.deepEqual(await names('q=%2B91%2094000%2000002'), ['Priya Patel']); // "+91 94000 00002"
    assert.deepEqual((await names('q=94000')).sort(), ['Aarav Shah', 'Priya Patel']);
    assert.deepEqual(await names(`preferredWorkerId=${W.Rahul}`), ['Priya Patel']);
    assert.deepEqual(await names('q=%25'), []); assert.deepEqual(await names("q=%27%3B%20DROP%20TABLE%20customers%3B--"), []);
  });
  it('pagination and limits', async () => {
    const p = (await call('GET', '/customers?limit=1&page=2', T.ownerA)).body.data; assert.equal(p.items.length, 1); assert.ok(p.total >= 2);
    assert.equal((await call('GET', '/customers?limit=500', T.ownerA)).status, 400);
    assert.equal((await call('GET', '/customers', T.jay)).status, 403);
  });
});

describe('5: OWN SCOPE (a barber sees only their own customers)', () => {
  it("a barber's new customers are assigned to them automatically and are visible to them only", async () => {
    const w = await mk(T.Rahul, 'Wally Walkin', '9300000001');
    assert.equal(w.status, 201); assert.equal(w.body.data.preferredWorkerId, W.Rahul); C.wally = w.body.data.id;
    const a = await mk(T.Amit, 'Amit Client', '9300000002'); assert.equal(a.body.data.preferredWorkerId, W.Amit); C.amitClient = a.body.data.id;
    const mine = (await call('GET', '/customers', T.Rahul)).body.data.items.map((c: any) => c.name).sort();
    assert.deepEqual(mine, ['Priya Patel', 'Wally Walkin']); // Priya prefers Rahul
    assert.equal((await call('GET', `/customers/${C.wally}`, T.Rahul)).status, 200);
    assert.equal((await call('GET', `/customers/${C.amitClient}`, T.Rahul)).status, 404);   // hidden, not "forbidden"
    assert.equal((await call('PATCH', `/customers/${C.amitClient}`, T.Rahul, { notes: 'x' })).status, 404);
    assert.equal((await call('GET', `/customers/${C.aarav}`, T.Rahul)).status, 404);
  });
  it('a barber cannot hand customers to others, create for others, or learn who owns a duplicate phone', async () => {
    assert.equal((await call('PATCH', `/customers/${C.wally}`, T.Rahul, { notes: 'Likes a fade' })).status, 200);
    assert.equal((await call('PATCH', `/customers/${C.wally}`, T.Rahul, { preferredWorkerId: W.Amit })).status, 403);
    assert.equal((await mk(T.Rahul, 'For Amit', '9300000003', { preferredWorkerId: W.Amit })).status, 403);
    const dup = await mk(T.Rahul, 'Dup Of Amits', '9300000002');
    assert.equal(dup.status, 409); assert.equal(dup.body.details, undefined);
    assert.equal((await call('DELETE', `/customers/${C.wally}`, T.Rahul)).status, 403);
    assert.equal((await call('POST', `/customers/${C.wally}/link/approve`, T.Rahul)).status, 403);
  });
  it('managers see everyone and can reassign; the barber then loses sight of that customer', async () => {
    const all = (await call('GET', '/customers?limit=100', T.managerA)).body.data.items.map((c: any) => c.name);
    for (const n of ['Aarav Shah', 'Priya Patel', 'Wally Walkin', 'Amit Client']) assert.ok(all.includes(n), n);
    assert.equal((await call('PATCH', `/customers/${C.wally}`, T.managerA, { preferredWorkerId: W.Amit })).status, 200);
    assert.equal((await call('GET', `/customers/${C.wally}`, T.Rahul)).status, 404);
    assert.equal((await call('GET', `/customers/${C.wally}`, T.Amit)).status, 200);
  });
  it('a worker without a worker profile cannot own customers', async () => {
    const role = (await call('POST', '/roles', T.ownerA, { name: 'Front Desk Own', permissions: { 'customers.create': 'own', 'customers.view': 'own' } })).body.data.id;
    await call('POST', '/users', T.ownerA, { name: 'Front Desk', phone: '9000000014', password: pw, roleIds: [role] });
    assert.equal((await mk(await login('9000000014'), 'Orphan Cust', '9300000010')).status, 403);
  });
});

describe('5: updating, archiving, restoring', () => {
  it('update is audited with old/new values; no-op edits add no log; empty/invalid refused', async () => {
    const r = await call('PATCH', `/customers/${C.aarav}`, T.cashierA, { name: 'Aarav S. Shah', notes: null });
    assert.equal(r.status, 200); assert.equal(r.body.data.name, 'Aarav S. Shah'); assert.equal(r.body.data.notes, null);
    assert.equal((await call('PATCH', `/customers/${C.aarav}`, T.cashierA, { name: 'Aarav S. Shah' })).status, 200);
    const logs = (await call('GET', `/audit-logs?action=customer.update&entityId=${C.aarav}`, T.ownerA)).body.data;
    assert.equal(logs.total, 1); assert.equal(logs.items[0].old_values.name, 'Aarav Shah'); assert.equal(logs.items[0].new_values.name, 'Aarav S. Shah');
    assert.equal((await call('PATCH', `/customers/${C.aarav}`, T.cashierA, {})).status, 400);
    assert.equal((await call('PATCH', `/customers/${C.aarav}`, T.cashierA, { phone: '9400000002' })).status, 409); // another customer's number
    assert.equal((await call('PATCH', `/customers/${C.aarav}`, T.cashierA, { phone: '9400000077' })).status, 200);  // free number, no account: allowed
    await call('PATCH', `/customers/${C.aarav}`, T.cashierA, { phone: '9400000001' });
  });
  it('archive hides them and frees the phone; restore conflicts if the number was reused', async () => {
    const x = (await mk(T.ownerA, 'Temp Customer', '9300000020')).body.data.id;
    assert.equal((await call('DELETE', `/customers/${x}`, T.managerA)).status, 403);   // managers have no customers.delete
    assert.equal((await call('DELETE', `/customers/${x}`, T.ownerA)).status, 200);
    assert.equal((await call('GET', '/customers?q=Temp', T.ownerA)).body.data.total, 0);
    assert.equal((await call('GET', '/customers?q=Temp&includeArchived=true', T.ownerA)).body.data.items[0].archived, true);
    assert.equal((await call('PATCH', `/customers/${x}`, T.ownerA, { notes: 'x' })).status, 409);
    assert.equal((await call('DELETE', `/customers/${x}`, T.ownerA)).status, 409);
    const reuse = await mk(T.ownerA, 'Reused Number', '9300000020'); assert.equal(reuse.status, 201);
    assert.equal((await call('POST', `/customers/${x}/restore`, T.ownerA)).status, 409);
    await call('DELETE', `/customers/${reuse.body.data.id}`, T.ownerA);
    assert.equal((await call('POST', `/customers/${x}/restore`, T.ownerA)).status, 200);
    assert.equal((await call('POST', `/customers/${x}/restore`, T.ownerA)).status, 409);
  });
});

describe('5: customer self-service (customer account inside one shop)', () => {
  it('endpoints are customer-only', async () => {
    for (const t of [T.ownerA, T.Rahul, T.platform]) assert.equal((await call('GET', '/me/shops/classic/profile', t)).status, 403);
    assert.equal((await call('GET', '/me/shops/classic/profile')).status, 401);
  });
  it('not joined -> join creates a linked record from the account; joining again changes nothing', async () => {
    assert.deepEqual((await call('GET', '/me/shops/classic/profile', T.jay)).body.data, { status: 'not_joined' });
    const j = await call('POST', '/me/shops/classic/join', T.jay);
    assert.equal(j.status, 200); assert.equal(j.body.data.status, 'linked'); assert.equal(j.body.data.profile.phone, '+919876543210'); assert.equal(j.body.data.profile.name, 'Jay Patel');
    assert.deepEqual((await call('POST', '/me/shops/classic/join', T.jay)).body.data.profile, j.body.data.profile);
    assert.equal((await h.ownerPool.query(`SELECT count(*)::int n FROM customers WHERE user_id=(SELECT id FROM users WHERE phone='+919876543210')`)).rows[0].n, 1);
    const staff = (await call('GET', '/customers?q=9876543210', T.ownerA)).body.data.items[0]; C.jay = staff.id;
    assert.equal(staff.hasAccount, true); assert.equal(staff.linkPending, false);
  });
  it('the customer can edit their own details and preferences; internal notes stay hidden', async () => {
    const r = await call('PATCH', '/me/shops/classic/profile', T.jay, { name: 'Jay P.', email: 'Jay@Mail.com', notes: 'Prefer short haircut', preferredWorkerId: W.Rahul, serviceIds: [S.haircut] });
    assert.equal(r.status, 200); assert.equal(r.body.data.profile.preferredWorker.displayName, 'Rahul'); assert.equal(r.body.data.profile.email, 'jay@mail.com');
    await call('PATCH', `/customers/${C.jay}`, T.ownerA, { internalNotes: 'VIP - always offer tea' });
    const staff = (await call('GET', `/customers/${C.jay}`, T.ownerA)).body.data;
    assert.equal(staff.notes, 'Prefer short haircut'); assert.equal(staff.internalNotes, 'VIP - always offer tea'); assert.equal(staff.preferredWorkerName, 'Rahul');
    const mine = JSON.stringify((await call('GET', '/me/shops/classic/profile', T.jay)).body.data);
    assert.equal(mine.includes('VIP'), false); assert.equal(mine.includes('internal'), false); assert.equal(mine.includes('hasAccount'), false);
    assert.equal(JSON.stringify(r.body.data).includes('VIP'), false);
  });
  it('validates the self-edit; the phone (their identity) cannot be changed; unknown shop is 404', async () => {
    const bad = async (b: object) => assert.equal((await call('PATCH', '/me/shops/classic/profile', T.jay, b)).status, 400, JSON.stringify(b));
    await bad({}); await bad({ phone: '9999999999' }); await bad({ internalNotes: 'hack' }); await bad({ name: 'X' }); await bad({ email: 'nope' });
    await bad({ preferredWorkerId: W.Bhavin }); await bad({ serviceIds: [S.haircutB] });
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'inactive' }); await bad({ preferredWorkerId: W.Amit });
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'active' });
    assert.equal((await call('PATCH', '/me/shops/classic/profile', T.jay, { preferredWorkerId: null })).body.data.profile.preferredWorker, null);
    assert.equal((await call('GET', '/me/shops/nope-shop/profile', T.jay)).status, 404);
    assert.equal((await call('POST', '/me/shops/nope-shop/join', T.jay)).status, 404);
    assert.equal((await call('PATCH', '/me/shops/sharp/profile', T.jay, { notes: 'x' })).status, 403); // never joined Shop B
  });
  it("the staff-side phone of a customer who has an account cannot be edited away from it", async () => {
    assert.equal((await call('PATCH', `/customers/${C.jay}`, T.ownerA, { phone: '9400000066' })).status, 409);
  });
});

describe('5: ACCOUNT LINKING is never automatic for an existing record (phones are unverified)', () => {
  it('a walk-in record + a new account with the same number => PENDING; nothing is revealed or editable until staff approve', async () => {
    const m = await mk(T.managerA, 'Maya Walkin', '9811111111', { notes: 'Allergic to latex', internalNotes: 'Owes 200' }); C.maya = m.body.data.id;
    T.maya = await register('Maya Registered', '9811111111');
    const j = await call('POST', '/me/shops/classic/join', T.maya);
    assert.deepEqual(j.body.data, { status: 'pending' });
    assert.deepEqual((await call('GET', '/me/shops/classic/profile', T.maya)).body.data, { status: 'pending' }); // no notes, no history, nothing
    assert.equal((await call('PATCH', '/me/shops/classic/profile', T.maya, { notes: 'hijack' })).status, 403);
    assert.deepEqual((await call('POST', '/me/shops/classic/join', T.maya)).body.data, { status: 'pending' }); // idempotent
    const staff = (await call('GET', `/customers/${C.maya}`, T.ownerA)).body.data;
    assert.equal(staff.linkPending, true); assert.equal(staff.hasAccount, false); assert.equal(staff.notes, 'Allergic to latex');
    assert.deepEqual((await call('GET', '/customers?linkPending=true', T.ownerA)).body.data.items.map((c: any) => c.name), ['Maya Walkin']);
  });
  it('staff can reject (request cleared) and the customer can ask again; then approve links the account', async () => {
    assert.equal((await call('POST', `/customers/${C.maya}/link/reject`, T.managerA)).status, 200);
    assert.deepEqual((await call('GET', '/me/shops/classic/profile', T.maya)).body.data, { status: 'not_joined' });
    assert.equal((await call('POST', `/customers/${C.maya}/link/reject`, T.managerA)).status, 409); // nothing pending
    assert.deepEqual((await call('POST', '/me/shops/classic/join', T.maya)).body.data, { status: 'pending' });
    const ok = await call('POST', `/customers/${C.maya}/link/approve`, T.managerA);
    assert.equal(ok.status, 200); assert.equal(ok.body.data.hasAccount, true); assert.equal(ok.body.data.linkPending, false);
    const p = (await call('GET', '/me/shops/classic/profile', T.maya)).body.data;
    assert.equal(p.status, 'linked'); assert.equal(p.profile.notes, 'Allergic to latex'); assert.equal(JSON.stringify(p).includes('Owes'), false);
    assert.equal((await call('PATCH', '/me/shops/classic/profile', T.maya, { notes: 'Allergic to latex & nuts' })).status, 200);
  });
  it("staff with only own-scope cannot approve links; approving needs 'all'", async () => {
    assert.equal((await call('POST', `/customers/${C.maya}/link/approve`, T.Rahul)).status, 403);
    assert.equal((await call('POST', `/customers/${C.maya}/link/approve`, T.cashierA)).status, 409); // cashier has update(all) but nothing is pending
  });
  it('the same account at ANOTHER shop whose staff already hold that number is also pending (Jay at Shop B)', async () => {
    const b = await mk(T.ownerB, 'Jay At Sharp', '9876543210'); assert.equal(b.status, 201); C.jayB = b.body.data.id;
    assert.deepEqual((await call('POST', '/me/shops/sharp/join', T.jay)).body.data, { status: 'pending' });
    assert.equal((await call('GET', '/me/shops/classic/profile', T.jay)).body.data.status, 'linked'); // Shop A unaffected
  });
  it('a brand-new number joins instantly; an archived link is refused', async () => {
    T.neha = await register('Neha Rao', '9822222222');
    assert.equal((await call('POST', '/me/shops/sharp/join', T.neha)).body.data.status, 'linked');
    const rec = (await call('GET', '/customers?q=9822222222', T.ownerB)).body.data.items[0];
    assert.equal((await call('DELETE', `/customers/${rec.id}`, T.ownerB)).status, 200);
    assert.equal((await call('POST', '/me/shops/sharp/join', T.neha)).status, 403);
    assert.equal((await call('GET', '/me/shops/sharp/profile', T.neha)).body.data.status, 'not_joined');
  });
  it('suspended shops cannot be joined', async () => {
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'suspended' });
    assert.equal((await call('POST', '/me/shops/sharp/join', T.jay)).status, 404);
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'active' });
  });
});

describe('5: TENANT ISOLATION', () => {
  it("Shop B staff cannot see or change Shop A's customers (404); lists are separate", async () => {
    for (const [m, p, b] of [['GET', `/customers/${C.aarav}`], ['PATCH', `/customers/${C.aarav}`, { name: 'Pwned Name' }], ['DELETE', `/customers/${C.aarav}`], ['POST', `/customers/${C.aarav}/restore`],
      ['POST', `/customers/${C.maya}/link/approve`], ['POST', `/customers/${C.maya}/link/reject`]] as any)
      assert.equal((await call(m, p, T.ownerB, b)).status, 404, `${m} ${p}`);
    const bNames = (await call('GET', '/customers?limit=100', T.ownerB)).body.data.items.map((c: any) => c.name);
    for (const n of ['Aarav S. Shah', 'Priya Patel', 'Maya Walkin', 'Amit Client']) assert.equal(bNames.includes(n), false, n);
    assert.ok(bNames.includes('Aarav Elsewhere')); // its own, same phone as A's Aarav, no clash
  });
  it('records never point at another shop\'s barber or service, and a customer only ever sees their own shop record', async () => {
    assert.equal((await call('PATCH', `/customers/${C.jayB}`, T.ownerB, { preferredWorkerId: W.Rahul })).status, 400);
    assert.equal((await call('PATCH', `/customers/${C.aarav}`, T.ownerA, { preferredWorkerId: W.Bhavin })).status, 400);
    assert.equal((await call('GET', '/me/shops/sharp/profile', T.maya)).body.data.status, 'not_joined');
  });
});

describe('5: DATABASE-LEVEL guarantees', () => {
  it('composite FKs, unique indexes and CHECKs hold with owner-level SQL', async () => {
    await assert.rejects(h.ownerPool.query('UPDATE customers SET preferred_worker_id=$1 WHERE id=$2', [W.Bhavin, C.aarav]), /foreign key/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO customer_preferred_services (customer_id, service_id, shop_id) VALUES ($1,$2,$3)`, [C.aarav, S.haircutB, ID.shopA]), /foreign key/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Dup Phone','+919400000001')`, [ID.shopA]), /customers_phone_uq/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Bad Phone','12345')`, [ID.shopA]), /phone/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO customers (shop_id, name, phone, email) VALUES ($1,'Bad Email','+919400000088','UPPER@X.COM')`, [ID.shopA]), /email/);
    const u = (await h.ownerPool.query(`SELECT id FROM users WHERE phone='+919876543210'`)).rows[0].id;
    await assert.rejects(h.ownerPool.query(`INSERT INTO customers (shop_id, name, phone, user_id) VALUES ($1,'Second Jay','+919400000089',$2)`, [ID.shopA, u]), /customers_user_uq/); // one record per account per shop
    await assert.rejects(h.ownerPool.query(`UPDATE customers SET pending_user_id=$1 WHERE id=$2`, [u, C.jay]), /customers_link_chk/);
  });
  it('RLS: no context sees nothing; a shop sees only its own; the public sees no customers at all; writes are shop-bound', async () => {
    const q = async (setup: [string, string][], sql: string) => {
      const c = await h.appPool.connect();
      try { await c.query('BEGIN'); for (const [k, v] of setup) await c.query('SELECT set_config($1,$2,true)', [k, v]); const r = (await c.query(sql)).rows[0].n; await c.query('ROLLBACK'); return r; } finally { c.release(); }
    };
    for (const t of ['customers', 'customer_preferred_services']) {
      assert.equal(await q([], `SELECT count(*)::int n FROM ${t}`), 0, `${t}: no context`);
      assert.equal(await q([['app.public_read', 'on']], `SELECT count(*)::int n FROM ${t}`), 0, `${t}: public`);
      assert.equal(await q([['app.shop_id', ID.shopB]], `SELECT count(*)::int n FROM ${t} WHERE shop_id <> '${ID.shopB}'`), 0, `${t}: cross-shop`);
    }
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN'); await c.query(`SELECT set_config('app.shop_id',$1,true)`, [ID.shopA]);
      await assert.rejects(c.query(`INSERT INTO customers (shop_id, name, phone) VALUES ($1,'Planted','+919400000090')`, [ID.shopB]), /row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
  it('audit trail covers customers', async () => {
    const a = new Set((await call('GET', '/audit-logs?limit=100', T.ownerA)).body.data.items.map((i: any) => i.action));
    for (const x of ['customer.create', 'customer.update', 'customer.archive', 'customer.restore', 'customer.join', 'customer.profile.update', 'customer.link.request', 'customer.link.approve', 'customer.link.reject']) assert.ok(a.has(x), x);
  });
});

describe('5: Customer Self-Service Rescheduling & Cancellation', () => {
  let aptId: string;
  const d = new Date();
  d.setDate(d.getDate() + 5);
  const futureDate = d.toISOString().slice(0, 10);

  it('customer can reschedule an active appointment to a new date/time slot', async () => {
    // Set up shop hours and worker capabilities
    for (let wd = 1; wd <= 7; wd++) {
      await h.ownerPool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         VALUES ($1, $2, false, '09:00'::time, '21:00'::time)
         ON CONFLICT (shop_id, weekday) DO UPDATE SET is_closed = false, open_time = '09:00', close_time = '21:00'`,
        [ID.shopA, wd]
      );
    }
    await call('PUT', `/workers/${W.Rahul}/services`, T.ownerA, { ids: [S.haircut] });
    await call('PUT', `/workers/${W.Rahul}/schedule`, T.ownerA, {
      schedule: [1, 2, 3, 4, 5, 6, 7].map((w) => ({ weekday: w, isWorking: true, startTime: '09:00', endTime: '21:00' })),
    });

    // 1. Create appointment for Jay
    const custApt = await call('POST', '/appointments/public/classic/book', undefined, {
      name: 'Jay Patel',
      phone: '9876543210',
      date: futureDate,
      startTime: '10:00',
      serviceIds: [S.haircut],
      workerId: W.Rahul,
      notes: 'Initial booking',
    });
    if (custApt.status !== 201) console.error('custApt failed:', custApt.status, custApt.body);
    assert.equal(custApt.status, 201);
    aptId = custApt.body.data.id;

    // 2. Customer reschedules to 14:00
    const res = await call('POST', `/me/shops/classic/appointments/${aptId}/reschedule`, T.jay, {
      date: futureDate,
      startTime: '14:00',
      workerId: W.Rahul,
      reason: 'Work schedule shifted',
    });
    if (res.status !== 200) console.error('res failed:', res.status, res.body);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'booked');
    assert.equal(res.body.data.oldAppointmentId, aptId);
    assert.ok(res.body.data.newAppointmentId);
    assert.equal(res.body.data.startTime, '14:00');

    // 3. Verify old appointment is now 'rescheduled' and freed
    const oldCheck = await call('GET', `/appointments/${aptId}`, T.ownerA);
    assert.equal(oldCheck.body.data.status, 'rescheduled');

    // 4. Old slot (10:00) is now free to be booked
    const rebookSlot = await call('POST', '/appointments/public/classic/book', undefined, {
      name: 'Another Client',
      phone: '9400000099',
      date: futureDate,
      startTime: '10:00',
      serviceIds: [S.haircut],
      workerId: W.Rahul,
    });
    if (rebookSlot.status !== 201) console.error('rebookSlot failed:', rebookSlot.status, rebookSlot.body);
    assert.equal(rebookSlot.status, 201);
  });

  it('rejects rescheduling an already rescheduled appointment', async () => {
    const res = await call('POST', `/me/shops/classic/appointments/${aptId}/reschedule`, T.jay, {
      date: futureDate,
      startTime: '16:00',
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.message.includes('Cannot reschedule an appointment that is already rescheduled'));
  });

  it('rejects cross-customer reschedule attempt', async () => {
    // Maya cannot reschedule Jay's new appointment
    const res = await call('POST', `/me/shops/classic/appointments/${aptId}/reschedule`, T.maya, {
      date: futureDate,
      startTime: '16:00',
    });
    assert.equal(res.status, 403);
  });
});
