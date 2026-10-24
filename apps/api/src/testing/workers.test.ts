import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {}, W: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const call = (m: string, p: string, token?: string, body?: unknown) => h.call(m, p, { token, body });
const png = (w = 600, hh = 400) => sharp({ create: { width: w, height: hh, channels: 3, background: '#aa3355' } }).png().toBuffer();
const loginStatus = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).status;

before(async () => {
  h = await boot(54346);
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await login('root@platform.test');
  for (const [k, name, slug, phone] of [['A', 'Classic Barber Shop', 'classic', '9000000001'], ['B', 'Sharp Cuts', 'sharp', '9000000002']]) {
    const r = await call('POST', '/platform/shops', T.platform, { name, slug, owner: { name: name + ' Owner', phone, password: pw } });
    ID['shop' + k] = r.body.data.id; T['owner' + k] = await login(phone);
  }
  ID.ownerAUser = (await call('GET', '/auth/me', T.ownerA)).body.data.user.id;
  const roles = Object.fromEntries((await call('GET', '/roles', T.ownerA)).body.data.map((r: any) => [r.system_key, r.id]));
  ID.roleOwner = roles.owner; ID.roleWorker = roles.worker;
  for (const [k, phone, role] of [['managerA', '9000000012', 'manager'], ['cashierA', '9000000013', 'cashier']]) {
    await call('POST', '/users', T.ownerA, { name: k + ' person', phone, password: pw, roleIds: [roles[role]] }); T[k] = await login(phone);
  }
  await h.call('POST', '/auth/register', { body: { name: 'Jay Patel', phone: '9876543210', password: pw } });
  T.cust = await login('9876543210');
});
after(() => h?.close());

describe('4B: creating workers', () => {
  it('only roles with workers.create can create; customers and anonymous cannot', async () => {
    assert.equal((await call('POST', '/workers', T.cashierA, { displayName: 'Nope Person' })).status, 403);
    assert.equal((await call('POST', '/workers', T.cust, { displayName: 'Nope Person' })).status, 403);
    assert.equal((await call('POST', '/workers', undefined, { displayName: 'Nope Person' })).status, 401);
  });
  it('creates workers WITH a login: default Worker role, phone normalised, login works', async () => {
    for (const [name, phone] of [['Rahul', '9000000021'], ['Amit', '9000000022'], ['Raj', '9000000023']]) {
      const r = await call('POST', '/workers', T.ownerA, { displayName: name, login: { phone, password: pw } });
      assert.equal(r.status, 201, name); W[name] = r.body.data.id; T[name] = await login(phone);
      assert.equal(r.body.data.login.phone, '+91' + phone); assert.equal(r.body.data.status, 'active'); assert.equal(r.body.data.archived, false);
    }
    const me = (await call('GET', '/auth/me', T.Rahul)).body.data;
    assert.deepEqual(me.user.roles.map((r: any) => r.name), ['Worker']);
    assert.equal(me.permissions['workers.view'], 'own'); // new Worker template lets a barber see their own profile
  });
  it('validates input', async () => {
    const bad = async (b: object) => assert.equal((await call('POST', '/workers', T.ownerA, b)).status, 400, JSON.stringify(b));
    await bad({ displayName: 'X' }); await bad({}); await bad({ displayName: 'No Contact', login: { password: pw } });
    await bad({ displayName: 'Weak Pw', login: { phone: '9000000090', password: 'short' } });
    await bad({ displayName: 'Bad Phone', login: { phone: '123', password: pw } });
    await bad({ displayName: 'Bad Link', linkUserId: 'nope' });
  });
  it('a worker can exist WITHOUT a login and be given one later (once)', async () => {
    const r = await call('POST', '/workers', T.ownerA, { displayName: 'No Login Nick' });
    assert.equal(r.status, 201); assert.equal(r.body.data.login, null); const id = r.body.data.id;
    const l = await call('POST', `/workers/${id}/login`, T.ownerA, { phone: '9000000030', password: pw });
    assert.equal(l.status, 201); assert.equal(l.body.data.login.phone, '+919000000030'); assert.equal(await loginStatus('9000000030'), 200);
    assert.equal((await call('POST', `/workers/${id}/login`, T.ownerA, { phone: '9000000031', password: pw })).status, 409);
    assert.equal((await call('POST', `/workers/${id}/login`, T.cashierA, { phone: '9000000032', password: pw })).status, 403);
    await call('DELETE', `/workers/${id}`, T.ownerA);
  });
  it('ATOMIC: a duplicate phone fails the whole request; no orphan worker or user remains', async () => {
    const before = (await call('GET', '/workers', T.ownerA)).body.data.total;
    assert.equal((await call('POST', '/workers', T.ownerA, { displayName: 'Dup Phone', login: { phone: '9000000021', password: pw } })).status, 409);
    assert.equal((await call('GET', '/workers', T.ownerA)).body.data.total, before);
    assert.equal((await h.ownerPool.query(`SELECT count(*)::int n FROM workers WHERE display_name='Dup Phone'`)).rows[0].n, 0);
  });
  it('ESCALATION: a manager cannot mint an Owner login via the worker form, and nothing is left behind', async () => {
    const before = (await call('GET', '/workers', T.ownerA)).body.data.total;
    assert.equal((await call('POST', '/workers', T.managerA, { displayName: 'Sneaky Owner', login: { phone: '9000000040', password: pw, roleIds: [ID.roleOwner] } })).status, 403);
    assert.equal((await call('GET', '/workers', T.ownerA)).body.data.total, before);
    assert.equal(await loginStatus('9000000040'), 401);
    const ok = await call('POST', '/workers', T.managerA, { displayName: 'Made By Manager', login: { phone: '9000000041', password: pw } });
    assert.equal(ok.status, 201); await call('DELETE', `/workers/${ok.body.data.id}`, T.ownerA);
  });
  it('an existing staff account (e.g. the owner who also cuts hair) can be linked once; foreign accounts cannot', async () => {
    const r = await call('POST', '/workers', T.ownerA, { displayName: 'Owner Barber', linkUserId: ID.ownerAUser });
    assert.equal(r.status, 201); assert.equal(r.body.data.userId, ID.ownerAUser); W.ownerBarber = r.body.data.id;
    assert.equal((await call('POST', '/workers', T.ownerA, { displayName: 'Owner Again', linkUserId: ID.ownerAUser })).status, 409);
    const bUser = (await call('GET', '/auth/me', T.ownerB)).body.data.user.id;
    assert.equal((await call('POST', '/workers', T.ownerA, { displayName: 'Steal B', linkUserId: bUser })).status, 400);
    assert.equal((await call('POST', '/workers', T.ownerA, { displayName: 'Both', linkUserId: ID.ownerAUser, login: { phone: '9000000099', password: pw } })).status, 400);
    assert.equal((await call('DELETE', `/workers/${W.ownerBarber}`, T.ownerA)).status, 409); // can't archive your own profile
  });
});

describe('4B: reading workers & OWN scope', () => {
  it('a plain worker sees only themselves; others are hidden (404), not forbidden', async () => {
    assert.deepEqual((await call('GET', '/workers', T.Rahul)).body.data.items.map((w: any) => w.displayName), ['Rahul']);
    assert.equal((await call('GET', `/workers/${W.Rahul}`, T.Rahul)).status, 200);
    assert.equal((await call('GET', `/workers/${W.Amit}`, T.Rahul)).status, 404);
    assert.equal((await call('GET', '/workers/me', T.Rahul)).body.data.id, W.Rahul);
  });
  it('a plain worker cannot create, edit, archive, add logins or change photos', async () => {
    assert.equal((await call('POST', '/workers', T.Rahul, { displayName: 'Hire Friend' })).status, 403);
    assert.equal((await call('PATCH', `/workers/${W.Rahul}`, T.Rahul, { displayName: 'Boss Rahul' })).status, 403);
    assert.equal((await call('DELETE', `/workers/${W.Rahul}`, T.Rahul)).status, 403);
    assert.equal((await h.upload(`/workers/${W.Rahul}/photo`, T.Rahul, await png())).status, 403);
  });
  it('managers and owners see everyone; staff without a worker profile get 404 on /me; customers are refused', async () => {
    const names = (await call('GET', '/workers', T.managerA)).body.data.items.map((w: any) => w.displayName);
    for (const n of ['Rahul', 'Amit', 'Raj', 'Owner Barber']) assert.ok(names.includes(n), n);
    assert.equal((await call('GET', '/workers/me', T.managerA)).status, 404);
    assert.equal((await call('GET', '/workers/me', T.cust)).status, 403);
    assert.equal((await call('GET', '/workers', T.cust)).status, 403);
  });
  it('search, status filter and pagination', async () => {
    assert.deepEqual((await call('GET', '/workers?q=rah', T.ownerA)).body.data.items.map((w: any) => w.displayName), ['Rahul']);
    assert.equal((await call('GET', '/workers?limit=2&page=2', T.ownerA)).body.data.items.length, 2);
    assert.equal((await call('GET', '/workers?limit=500', T.ownerA)).status, 400);
    assert.equal((await call('GET', '/workers?q=%25', T.ownerA)).body.data.total, 0);
    assert.equal((await call('GET', '/workers?status=inactive', T.ownerA)).body.data.total, 0);
  });
});

describe('4B: updating, archiving, restoring', () => {
  it('rename / deactivate is audited; archived workers cannot be edited', async () => {
    const r = await call('PATCH', `/workers/${W.Raj}`, T.managerA, { displayName: 'Raj Kumar' });
    assert.equal(r.status, 200); assert.equal(r.body.data.displayName, 'Raj Kumar');
    assert.equal((await call('PATCH', `/workers/${W.Raj}`, T.managerA, { displayName: 'Raj Kumar' })).status, 200); // no-op
    const logs = (await call('GET', `/audit-logs?action=worker.update&entityId=${W.Raj}`, T.ownerA)).body.data;
    assert.equal(logs.total, 1); assert.deepEqual(logs.items[0].old_values, { displayName: 'Raj' }); assert.deepEqual(logs.items[0].new_values, { displayName: 'Raj Kumar' });
    assert.equal((await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'inactive' })).body.data.status, 'inactive');
    assert.equal((await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'active' })).body.data.status, 'active');
    assert.equal((await call('PATCH', `/workers/${W.Raj}`, T.ownerA, {})).status, 400);
    assert.equal((await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'weird' })).status, 400);
  });
  it('archive disables the login everywhere; restore brings it back; permissions enforced', async () => {
    const w = (await call('POST', '/workers', T.ownerA, { displayName: 'Temp Barber', login: { phone: '9000000060', password: pw } })).body.data;
    const tok = await login('9000000060');
    assert.equal((await call('GET', '/auth/me', tok)).status, 200);
    assert.equal((await call('DELETE', `/workers/${w.id}`, T.managerA)).status, 403); // managers have no workers.delete
    const a = await call('DELETE', `/workers/${w.id}`, T.ownerA);
    assert.equal(a.status, 200); assert.equal(a.body.data.loginDisabled, true);
    assert.equal((await call('GET', '/auth/me', tok)).status, 401);       // existing session dies
    assert.equal(await loginStatus('9000000060'), 403);                    // cannot log in
    assert.equal((await call('GET', '/workers', T.ownerA)).body.data.items.some((x: any) => x.id === w.id), false);
    assert.equal((await call('GET', '/workers?includeArchived=true', T.ownerA)).body.data.items.find((x: any) => x.id === w.id).archived, true);
    assert.equal((await call('PATCH', `/workers/${w.id}`, T.ownerA, { displayName: 'Edited' })).status, 409);
    assert.equal((await call('DELETE', `/workers/${w.id}`, T.ownerA)).status, 409);
    assert.equal((await call('POST', `/workers/${w.id}/restore`, T.managerA)).status, 403);
    assert.equal((await call('POST', `/workers/${w.id}/restore`, T.ownerA)).status, 200);
    assert.equal(await loginStatus('9000000060'), 200);
    assert.equal((await call('POST', `/workers/${w.id}/restore`, T.ownerA)).status, 409);
    await call('DELETE', `/workers/${w.id}`, T.ownerA);
  });
  it('archiving a worker who is an Owner keeps that login working (a shop cannot lock itself out)', async () => {
    const o2 = await call('POST', '/users', T.ownerA, { name: 'Second Owner', phone: '9000000070', password: pw, roleIds: [ID.roleOwner] });
    const w = (await call('POST', '/workers', T.ownerA, { displayName: 'Second Owner Cuts', linkUserId: o2.body.data.id })).body.data;
    const a = await call('DELETE', `/workers/${w.id}`, T.ownerA);
    assert.equal(a.status, 200); assert.equal(a.body.data.loginDisabled, false);
    assert.equal(await loginStatus('9000000070'), 200);
  });
});

describe('4B: worker photo', () => {
  it('only workers.update (all) may change it; other shops get 404; hostile files are refused', async () => {
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.cashierA, await png())).status, 403);
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerB, await png())).status, 404);
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, Buffer.from('<?php echo 1; ?>'), { filename: 'p.png', mime: 'image/png' })).status, 400);
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="99" height="99"><script>1</script></svg>'), { filename: 'p.png' })).status, 400);
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, Buffer.alloc(2 * 1024 * 1024, 1))).status, 413);
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, null)).status, 400);
  });
  it('a valid photo becomes a public 256x256 WebP; hidden while the worker is inactive; removable', async () => {
    assert.equal((await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, await png(900, 300))).status, 200);
    const url = (await call('GET', `/workers/${W.Amit}`, T.ownerA)).body.data.photoUrl;
    assert.equal(url, `/api/v1/shops/public/classic/barbers/${W.Amit}/photo`);
    const res = await fetch(h.base + url.replace('/api/v1', ''));
    assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/webp'); assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata(); assert.deepEqual([m.width, m.height], [256, 256]);
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'inactive' });
    assert.equal((await fetch(h.base + `/shops/public/classic/barbers/${W.Amit}/photo`)).status, 404);
    await call('PATCH', `/workers/${W.Amit}`, T.ownerA, { status: 'active' });
    assert.equal((await fetch(h.base + `/shops/public/classic/barbers/${W.Amit}/photo`)).status, 200);
    assert.equal((await fetch(h.base + `/shops/public/sharp/barbers/${W.Amit}/photo`)).status, 404); // wrong shop slug
    assert.equal((await fetch(h.base + `/shops/public/classic/barbers/not-a-uuid/photo`)).status, 400);
    assert.equal((await call('DELETE', `/workers/${W.Amit}/photo`, T.ownerA)).status, 200);
    assert.equal((await fetch(h.base + `/shops/public/classic/barbers/${W.Amit}/photo`)).status, 404);
    assert.equal((await call('DELETE', `/workers/${W.Amit}/photo`, T.ownerA)).status, 404);
  });
  it('replacing a photo keeps exactly one stored file for that worker', async () => {
    await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, await png(300, 300)); await h.upload(`/workers/${W.Amit}/photo`, T.ownerA, await png(400, 400));
    const n = (await h.ownerPool.query(`SELECT count(*)::int n FROM files f JOIN workers w ON w.photo_file_id = f.id WHERE w.id=$1`, [W.Amit])).rows[0].n;
    assert.equal(n, 1);
    assert.equal((await h.ownerPool.query(`SELECT count(*)::int n FROM files WHERE shop_id=$1 AND kind='worker_photo'`, [ID.shopA])).rows[0].n, 1);
  });
});

describe('4B: TENANT ISOLATION', () => {
  it("Shop B cannot see or modify Shop A's workers (404)", async () => {
    assert.equal((await call('GET', '/workers', T.ownerB)).body.data.total, 0);
    for (const [m, p, b] of [['GET', `/workers/${W.Rahul}`], ['PATCH', `/workers/${W.Rahul}`, { displayName: 'Pwned' }], ['DELETE', `/workers/${W.Rahul}`],
      ['POST', `/workers/${W.Rahul}/restore`], ['POST', `/workers/${W.Rahul}/login`, { phone: '9000000077', password: pw }], ['DELETE', `/workers/${W.Rahul}/photo`]] as any)
      assert.equal((await call(m, p, T.ownerB, b)).status, 404, `${m} ${p}`);
  });
  it('Shop B has its own workers; cannot link a Shop A account; A never sees B', async () => {
    const bw = await call('POST', '/workers', T.ownerB, { displayName: 'Bhavin', login: { phone: '9000000051', password: pw } });
    assert.equal(bw.status, 201); W.Bhavin = bw.body.data.id;
    assert.equal((await call('POST', '/workers', T.ownerB, { displayName: 'Cross', linkUserId: ID.ownerAUser })).status, 400);
    assert.equal((await call('GET', '/workers', T.ownerA)).body.data.items.some((w: any) => w.displayName === 'Bhavin'), false);
    assert.equal((await call('GET', `/workers/${W.Bhavin}`, T.ownerA)).status, 404);
    assert.equal((await call('GET', '/workers', T.ownerB)).body.data.total, 1);
  });
});

describe('4B: DATABASE-LEVEL guarantees', () => {
  it('composite FK: a worker cannot be linked to a login from another shop, even with owner-level SQL', async () => {
    const bUser = (await call('GET', '/auth/me', T.ownerB)).body.data.user.id;
    await assert.rejects(h.ownerPool.query('UPDATE workers SET user_id=$1 WHERE id=$2', [bUser, W.Rahul]), /foreign key/);
    await assert.rejects(h.ownerPool.query('UPDATE workers SET user_id=$1 WHERE id=$2', [(await call('GET', '/auth/me', T.Amit)).body.data.user.id, W.Rahul]), /unique|duplicate/); // one login, one worker
  });
  it('a worker photo from another shop cannot be attached', async () => {
    await h.upload(`/workers/${W.Bhavin}/photo`, T.ownerB, await png());
    const fileB = (await h.ownerPool.query('SELECT photo_file_id id FROM workers WHERE id=$1', [W.Bhavin])).rows[0].id;
    await assert.rejects(h.ownerPool.query('UPDATE workers SET photo_file_id=$1 WHERE id=$2', [fileB, W.Rahul]), /foreign key/);
  });
  it('CHECK constraints hold without the API', async () => {
    await assert.rejects(h.ownerPool.query(`INSERT INTO workers (shop_id, display_name) VALUES ($1,'X')`, [ID.shopA]), /workers_display_name_check/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO workers (shop_id, display_name, commission_rate) VALUES ($1,'Valid Name',150)`, [ID.shopA]), /commission_rate/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO workers (shop_id, display_name, status) VALUES ($1,'Valid Name','weird')`, [ID.shopA]), /status/);
  });
  it('RLS: no context sees nothing; shop context sees only its shop; public sees only active workers and cannot write', async () => {
    const q = async (setup: [string, string][], sql: string) => {
      const c = await h.appPool.connect();
      try { await c.query('BEGIN'); for (const [k, v] of setup) await c.query('SELECT set_config($1,$2,true)', [k, v]); const r = (await c.query(sql)).rows[0].n; await c.query('ROLLBACK'); return r; } finally { c.release(); }
    };
    assert.equal(await q([], 'SELECT count(*)::int n FROM workers'), 0);
    assert.equal(await q([['app.shop_id', ID.shopB]], `SELECT count(*)::int n FROM workers WHERE shop_id <> '${ID.shopB}'`), 0);
    const pub: [string, string][] = [['app.public_read', 'on']];
    assert.equal(await q(pub, `SELECT count(*)::int n FROM workers WHERE status <> 'active' OR archived_at IS NOT NULL`), 0);
    assert.ok((await q(pub, 'SELECT count(*)::int n FROM workers')) >= 3);
    assert.equal(await q(pub, `SELECT count(*)::int n FROM files WHERE kind = 'upi_qr'`), 0);
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN'); await c.query(`SELECT set_config('app.public_read','on',true)`);
      assert.equal((await c.query(`UPDATE workers SET display_name = 'Hacked Name'`)).rowCount, 0);
      assert.equal((await c.query('DELETE FROM workers')).rowCount, 0);
      await assert.rejects(c.query(`INSERT INTO workers (shop_id, display_name) VALUES ($1,'Evil Worker')`, [ID.shopA]), /row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
  it('audit trail covers workers', async () => {
    const actions = new Set((await call('GET', '/audit-logs?limit=100', T.ownerA)).body.data.items.map((i: any) => i.action));
    for (const a of ['worker.create', 'worker.update', 'worker.archive', 'worker.restore', 'worker.login.create', 'worker.photo.update', 'worker.photo.remove', 'user.create']) assert.ok(actions.has(a), a);
  });
});
