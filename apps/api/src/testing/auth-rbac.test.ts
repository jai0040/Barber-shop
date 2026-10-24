import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}; // tokens
const ID: Record<string, string> = {};
let roleA: Record<string, string> = {}, roleB: Record<string, string> = {};

const login = async (identifier: string, password = pw) => h.call('POST', '/auth/login', { body: { identifier, password } });
const tokenOf = async (identifier: string) => (await login(identifier)).body.data.accessToken as string;

before(async () => {
  h = await boot(54341);
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await tokenOf('root@platform.test');
  const mk = (name: string, slug: string, phone: string) =>
    h.call('POST', '/platform/shops', { token: T.platform, body: { name, slug, owner: { name: name + ' Owner', phone, password: pw } } });
  const a = await mk('Classic Barber Shop', 'classic', '9000000001');
  const b = await mk('Sharp Cuts', 'sharp', '9000000002');
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  ID.shopA = a.body.data.id; ID.shopB = b.body.data.id;
  T.ownerA = await tokenOf('9000000001'); T.ownerB = await tokenOf('9000000002');
  const rolesOf = async (t: string) => Object.fromEntries((await h.call('GET', '/roles', { token: t })).body.data.map((r: any) => [r.system_key ?? r.name, r.id]));
  roleA = await rolesOf(T.ownerA); roleB = await rolesOf(T.ownerB);
  const staff = async (t: string, name: string, phone: string, roleId: string) =>
    (await h.call('POST', '/users', { token: t, body: { name, phone, password: pw, roleIds: [roleId] } })).body.data.id;
  ID.workerA = await staff(T.ownerA, 'Rahul', '9000000011', roleA.worker);
  ID.managerA = await staff(T.ownerA, 'Manager A', '9000000012', roleA.manager);
  ID.workerB = await staff(T.ownerB, 'Bhavin', '9000000021', roleB.worker);
  T.workerA = await tokenOf('9000000011'); T.managerA = await tokenOf('9000000012');
});
after(() => h?.close());

describe('basics & envelope', () => {
  it('health is public and uses the success envelope', async () => {
    const r = await h.call('GET', '/health');
    assert.equal(r.status, 200); assert.equal(r.body.success, true);
  });
  it('unauthenticated and garbage tokens get 401', async () => {
    assert.equal((await h.call('GET', '/auth/me')).status, 401);
    const r = await h.call('GET', '/roles', { token: 'not.a.jwt' });
    assert.equal(r.status, 401); assert.equal(r.body.success, false); assert.equal(r.body.code, 'UNAUTHENTICATED');
  });
});

describe('customer registration & login', () => {
  it('rejects invalid input with field details', async () => {
    const r = await h.call('POST', '/auth/register', { body: { name: 'J', phone: '123', password: 'short' } });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'VALIDATION_FAILED');
    const fields = r.body.details.map((d: any) => d.field);
    assert.ok(fields.includes('phone') && fields.includes('password') && fields.includes('name'));
  });
  it('registers, normalises phone, rejects duplicates (phone and email)', async () => {
    const r = await h.call('POST', '/auth/register', { body: { name: 'Jay Patel', phone: '98765 43210', email: 'Jay@Example.com', password: pw } });
    assert.equal(r.status, 201); assert.equal(r.body.data.user.phone, '+919876543210'); assert.equal(r.body.data.user.email, 'jay@example.com');
    assert.equal(r.body.data.user.type, 'customer');
    assert.equal((await h.call('POST', '/auth/register', { body: { name: 'Other', phone: '+91 9876543210', password: pw } })).status, 409);
    assert.equal((await h.call('POST', '/auth/register', { body: { name: 'Other', phone: '9123456780', email: 'jay@example.com', password: pw } })).status, 409);
  });
  it('logs in by mobile (any format) or email; wrong password is a generic 401', async () => {
    assert.equal((await login('9876543210')).status, 200);
    assert.equal((await login('+91-98765-43210')).status, 200);
    assert.equal((await login('JAY@example.com')).status, 200);
    const wrong = await login('9876543210', 'Wrong123!'), ghost = await login('9999999999', 'Wrong123!');
    assert.equal(wrong.status, 401); assert.equal(ghost.status, 401);
    assert.equal(wrong.body.message, ghost.body.message); // no account enumeration
  });
  it('locks the account after repeated failures', async () => {
    await h.call('POST', '/auth/register', { body: { name: 'Lock Me', phone: '9111111111', password: pw } });
    for (let i = 0; i < 5; i++) await login('9111111111', 'Bad12345!');
    const r = await login('9111111111');
    assert.equal(r.status, 429); assert.equal(r.body.code, 'RATE_LIMITED');
  });
  it('/auth/me returns the profile for a customer with no permissions', async () => {
    T.cust = await tokenOf('9876543210');
    const r = await h.call('GET', '/auth/me', { token: T.cust });
    assert.equal(r.status, 200); assert.deepEqual(r.body.data.permissions, {}); assert.equal(r.body.data.shop, null);
  });
});

describe('permission enforcement (backend)', () => {
  it('customer, platform admin and worker are denied staff-admin endpoints', async () => {
    for (const t of [T.cust, T.platform, T.workerA]) {
      assert.equal((await h.call('GET', '/roles', { token: t })).status, 403);
      assert.equal((await h.call('GET', '/audit-logs', { token: t })).status, 403);
      assert.equal((await h.call('GET', '/users', { token: t })).status, 403);
    }
  });
  it('customer and staff are denied platform endpoints', async () => {
    for (const t of [T.cust, T.ownerA]) assert.equal((await h.call('GET', '/platform/shops', { token: t })).status, 403);
  });
  it('manager (no roles/audit permission) is denied; owner is allowed', async () => {
    assert.equal((await h.call('GET', '/audit-logs', { token: T.managerA })).status, 403);
    assert.equal((await h.call('POST', '/roles', { token: T.managerA, body: { name: 'Sneaky' } })).status, 403);
    assert.equal((await h.call('GET', '/roles', { token: T.ownerA })).status, 200);
  });
  it('worker profile carries "own" scopes; owner holds everything', async () => {
    const w = (await h.call('GET', '/auth/me', { token: T.workerA })).body.data;
    assert.equal(w.permissions['appointments.view'], 'own'); assert.equal(w.permissions['services.view'], 'all');
    assert.equal(w.permissions['expenses.view'], undefined);
    const o = (await h.call('GET', '/auth/me', { token: T.ownerA })).body.data;
    assert.equal(o.isOwner, true); assert.equal(o.permissions['expenses.create'], 'all');
  });
  it('platform shop creation validates input and rejects duplicate slugs', async () => {
    const dup = await h.call('POST', '/platform/shops', { token: T.platform, body: { name: 'Dup', slug: 'classic', owner: { name: 'Dup Owner', phone: '9333333333', password: pw } } });
    assert.equal(dup.status, 409);
    const bad = await h.call('POST', '/platform/shops', { token: T.platform, body: { name: 'X', slug: 'Bad Slug!', owner: {} } });
    assert.equal(bad.status, 400);
  });
});

describe('TENANT ISOLATION: Shop A vs Shop B', () => {
  it('each owner sees only their own roles and staff', async () => {
    const ra = (await h.call('GET', '/roles', { token: T.ownerA })).body.data, rb = (await h.call('GET', '/roles', { token: T.ownerB })).body.data;
    assert.equal(ra.length, 5); assert.equal(rb.length, 5);
    const idsA = new Set(ra.map((r: any) => r.id)); assert.ok(rb.every((r: any) => !idsA.has(r.id)));
    const ua = (await h.call('GET', '/users', { token: T.ownerA })).body.data.map((u: any) => u.id);
    assert.ok(ua.includes(ID.workerA) && !ua.includes(ID.workerB));
  });
  it("Shop A cannot read, edit or delete Shop B's roles (404)", async () => {
    const rid = roleB.manager;
    assert.equal((await h.call('GET', `/roles/${rid}`, { token: T.ownerA })).status, 404);
    assert.equal((await h.call('PUT', `/roles/${rid}/permissions`, { token: T.ownerA, body: { permissions: { 'reports.view': 'all' } } })).status, 404);
    assert.equal((await h.call('PATCH', `/roles/${rid}`, { token: T.ownerA, body: { name: 'Hacked' } })).status, 404);
    assert.equal((await h.call('DELETE', `/roles/${rid}`, { token: T.ownerA })).status, 404);
  });
  it("Shop A cannot manage Shop B's staff, or assign Shop B's roles", async () => {
    assert.equal((await h.call('PUT', `/users/${ID.workerB}/roles`, { token: T.ownerA, body: { roleIds: [roleA.manager] } })).status, 404);
    assert.equal((await h.call('PATCH', `/users/${ID.workerB}/status`, { token: T.ownerA, body: { status: 'disabled' } })).status, 404);
    const cross = await h.call('PUT', `/users/${ID.workerA}/roles`, { token: T.ownerA, body: { roleIds: [roleB.manager] } });
    assert.equal(cross.status, 400); // role of another shop is invisible => "does not exist"
    assert.equal((await login('9000000021')).status, 200); // Shop B worker untouched
  });
  it('audit logs are shop-scoped', async () => {
    const a = (await h.call('GET', '/audit-logs?limit=100', { token: T.ownerA })).body.data;
    assert.ok(a.items.length > 0);
    assert.ok(a.items.every((i: any) => i.entity_id !== ID.shopB && i.entity_id !== ID.workerB));
  });
  it('DATABASE LEVEL: RLS hides other shops even for raw SQL from the app role', async () => {
    const count = async (shop: string | null, platform = false) => {
      const c = await h.appPool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.shop_id',$1,true), set_config('app.is_platform',$2,true)`, [shop ?? '', platform ? 'on' : 'off']);
        const r = (await c.query('SELECT count(*)::int n, count(DISTINCT shop_id)::int shops FROM roles')).rows[0];
        await c.query('ROLLBACK'); return r;
      } finally { c.release(); }
    };
    assert.deepEqual(await count(null), { n: 0, shops: 0 });              // no context => nothing
    assert.deepEqual(await count(ID.shopA), { n: 5, shops: 1 });          // only own shop
    assert.deepEqual(await count(null, true), { n: 10, shops: 2 });       // platform scope
  });
  it('DATABASE LEVEL: cannot write rows into another shop, even with shop A context', async () => {
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.shop_id',$1,true)`, [ID.shopA]);
      await assert.rejects(c.query(`INSERT INTO roles (shop_id, name) VALUES ($1,'Planted')`, [ID.shopB]), /row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
  it('DATABASE LEVEL: composite FK stops a user in shop A holding shop B role', async () => {
    await assert.rejects(h.ownerPool.query('INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1,$2,$3)', [ID.workerA, ID.shopA, roleB.manager]), /foreign key/);
  });
  it('DATABASE LEVEL: audit log is append-only for the app role', async () => {
    await assert.rejects(h.appPool.query('UPDATE audit_logs SET action = $1', ['x']), /permission denied/);
    await assert.rejects(h.appPool.query('DELETE FROM audit_logs'), /permission denied/);
  });
  it('DATABASE LEVEL: app role cannot alter the permission catalog', async () => {
    await assert.rejects(h.appPool.query(`INSERT INTO permissions(key,module,description) VALUES ('x.y','x','x')`), /permission denied/);
  });
});

describe('role & permission management', () => {
  it('owner edits a role; change is audited with old/new values', async () => {
    const r = await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: T.ownerA, body: { permissions: { 'appointments.view': 'all', 'reports.view': 'all' } } });
    assert.equal(r.status, 200);
    const log = (await h.call('GET', '/audit-logs?entity=role&action=role.permissions.update', { token: T.ownerA })).body.data.items[0];
    assert.equal(log.entity_id, roleA.manager); assert.equal(log.user_name, 'Classic Barber Shop Owner');
    assert.ok(log.old_values['billing.create'] === 'all'); assert.deepEqual(log.new_values, { 'appointments.view': 'all', 'reports.view': 'all' });
    // restore sensible manager perms so later tests keep their meaning
    await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: T.ownerA, body: { permissions: { 'appointments.view': 'all', 'reports.view': 'all', 'workers.view': 'all' } } });
  });
  it('manager role changes take effect immediately on the next request', async () => {
    assert.equal((await h.call('GET', '/audit-logs', { token: T.managerA })).status, 403);
    await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: T.ownerA, body: { permissions: { 'audit.view': 'all' } } });
    assert.equal((await h.call('GET', '/audit-logs', { token: T.managerA })).status, 200);
    await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: T.ownerA, body: { permissions: { 'appointments.view': 'all' } } });
    assert.equal((await h.call('GET', '/audit-logs', { token: T.managerA })).status, 403);
  });
  it('validates permission keys and scopes', async () => {
    const put = (permissions: object) => h.call('PUT', `/roles/${roleA.cashier}/permissions`, { token: T.ownerA, body: { permissions } });
    assert.equal((await put({ 'nope.nope': 'all' })).status, 400);
    assert.equal((await put({ 'appointments.view': 'some' })).status, 400);
    assert.equal((await put({ 'expenses.create': 'own' })).status, 400); // "own" unsupported here
  });
  it('the Owner role cannot be edited, renamed or deleted; system roles cannot be deleted', async () => {
    assert.equal((await h.call('PUT', `/roles/${roleA.owner}/permissions`, { token: T.ownerA, body: { permissions: {} } })).status, 409);
    assert.equal((await h.call('PATCH', `/roles/${roleA.owner}`, { token: T.ownerA, body: { name: 'Boss' } })).status, 409);
    assert.equal((await h.call('DELETE', `/roles/${roleA.worker}`, { token: T.ownerA })).status, 409);
  });
  it('custom roles: create, duplicate name 409, cannot delete while assigned', async () => {
    const c = await h.call('POST', '/roles', { token: T.ownerA, body: { name: 'Receptionist', permissions: { 'appointments.view': 'all' } } });
    assert.equal(c.status, 201);
    assert.equal((await h.call('POST', '/roles', { token: T.ownerA, body: { name: 'Receptionist' } })).status, 409);
    const u = await h.call('POST', '/users', { token: T.ownerA, body: { name: 'Recep', email: 'recep@a.test', password: pw, roleIds: [c.body.data.id] } });
    assert.equal(u.status, 201);
    assert.equal((await h.call('DELETE', `/roles/${c.body.data.id}`, { token: T.ownerA })).status, 409);
  });
});

describe('privilege escalation is blocked', () => {
  let leadToken: string, leadId: string;
  before(async () => {
    const r = await h.call('POST', '/roles', { token: T.ownerA, body: { name: 'Lead', permissions: { 'roles.manage': 'all', 'permissions.manage': 'all', 'users.manage': 'all', 'appointments.view': 'all' } } });
    const u = await h.call('POST', '/users', { token: T.ownerA, body: { name: 'Lead Person', phone: '9000000013', password: pw, roleIds: [r.body.data.id] } });
    leadId = u.body.data.id; leadToken = await tokenOf('9000000013');
  });
  it("cannot grant a permission they don't hold", async () => {
    const r = await h.call('POST', '/roles', { token: leadToken, body: { name: 'Mini Admin', permissions: { 'expenses.create': 'all' } } });
    assert.equal(r.status, 403);
  });
  it('can grant a permission they do hold', async () => {
    assert.equal((await h.call('POST', '/roles', { token: leadToken, body: { name: 'Viewer', permissions: { 'appointments.view': 'all' } } })).status, 201);
  });
  it('cannot assign the Owner role or touch an Owner', async () => {
    assert.equal((await h.call('PUT', `/users/${ID.workerA}/roles`, { token: leadToken, body: { roleIds: [roleA.owner] } })).status, 403);
    const owners = (await h.call('GET', '/users', { token: leadToken })).body.data.filter((u: any) => u.roles.some((r: any) => r.name === 'Owner'));
    assert.equal((await h.call('PUT', `/users/${owners[0].id}/roles`, { token: leadToken, body: { roleIds: [roleA.worker] } })).status, 403);
    assert.equal((await h.call('PATCH', `/users/${owners[0].id}/status`, { token: leadToken, body: { status: 'disabled' } })).status, 403);
  });
  it("cannot assign a role more powerful than themselves (manager role includes things they lack)", async () => {
    await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: T.ownerA, body: { permissions: { 'billing.create': 'all' } } });
    assert.equal((await h.call('PUT', `/users/${ID.workerA}/roles`, { token: leadToken, body: { roleIds: [roleA.manager] } })).status, 403);
  });
  it("cannot strip grants from a role they couldn't have granted", async () => {
    assert.equal((await h.call('PUT', `/roles/${roleA.manager}/permissions`, { token: leadToken, body: { permissions: { 'appointments.view': 'all' } } })).status, 403);
  });
  it("cannot change their own roles or status", async () => {
    assert.equal((await h.call('PUT', `/users/${leadId}/roles`, { token: leadToken, body: { roleIds: [roleA.owner] } })).status, 403);
    assert.equal((await h.call('PATCH', `/users/${leadId}/status`, { token: leadToken, body: { status: 'disabled' } })).status, 403);
  });
});

describe('sessions', () => {
  it('refresh rotates tokens; replaying a used refresh token revokes the whole family', async () => {
    const l = (await login('9876543210')).body.data;
    const r1 = await h.call('POST', '/auth/refresh', { body: { refreshToken: l.refreshToken } });
    assert.equal(r1.status, 200); assert.notEqual(r1.body.data.refreshToken, l.refreshToken);
    const replay = await h.call('POST', '/auth/refresh', { body: { refreshToken: l.refreshToken } });
    assert.equal(replay.status, 401);
    const afterReplay = await h.call('POST', '/auth/refresh', { body: { refreshToken: r1.body.data.refreshToken } });
    assert.equal(afterReplay.status, 401); // family killed
  });
  it('logout revokes the refresh token', async () => {
    const l = (await login('9876543210')).body.data;
    assert.equal((await h.call('POST', '/auth/logout', { body: { refreshToken: l.refreshToken } })).status, 200);
    assert.equal((await h.call('POST', '/auth/refresh', { body: { refreshToken: l.refreshToken } })).status, 401);
  });
  it('disabling a user kills their access immediately and blocks login', async () => {
    const victim = await h.call('POST', '/users', { token: T.ownerA, body: { name: 'Temp Staff', phone: '9000000014', password: pw, roleIds: [roleA.worker] } });
    const tok = await tokenOf('9000000014');
    assert.equal((await h.call('GET', '/auth/me', { token: tok })).status, 200);
    assert.equal((await h.call('PATCH', `/users/${victim.body.data.id}/status`, { token: T.ownerA, body: { status: 'disabled' } })).status, 200);
    assert.equal((await h.call('GET', '/auth/me', { token: tok })).status, 401);
    assert.equal((await login('9000000014')).status, 403);
  });
  it('suspending a shop blocks its staff; reactivating restores access', async () => {
    assert.equal((await h.call('PATCH', `/platform/shops/${ID.shopB}/status`, { token: T.platform, body: { status: 'suspended' } })).status, 200);
    assert.equal((await h.call('GET', '/auth/me', { token: T.ownerB })).status, 403);
    assert.equal((await login('9000000002')).status, 403);
    assert.equal((await h.call('GET', '/auth/me', { token: T.ownerA })).status, 200); // other shops unaffected
    await h.call('PATCH', `/platform/shops/${ID.shopB}/status`, { token: T.platform, body: { status: 'active' } });
    assert.equal((await login('9000000002')).status, 200);
  });
  it('change-password revokes sessions and the old password stops working', async () => {
    await h.call('POST', '/auth/register', { body: { name: 'Pw Changer', phone: '9222222222', password: pw } });
    const l = (await login('9222222222')).body.data;
    const bad = await h.call('POST', '/auth/change-password', { token: l.accessToken, body: { currentPassword: 'Nope1234!', newPassword: 'NewPassw0rd!' } });
    assert.equal(bad.status, 400);
    assert.equal((await h.call('POST', '/auth/change-password', { token: l.accessToken, body: { currentPassword: pw, newPassword: 'NewPassw0rd!' } })).status, 200);
    assert.equal((await h.call('POST', '/auth/refresh', { body: { refreshToken: l.refreshToken } })).status, 401);
    assert.equal((await login('9222222222')).status, 401);
    assert.equal((await login('9222222222', 'NewPassw0rd!')).status, 200);
  });
});

describe('CSRF (cookie-authenticated browsers)', () => {
  it('cookie-based mutations need the CSRF header; Bearer calls do not', async () => {
    const res = await fetch(h.base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: '9000000001', password: pw }) });
    const set: string[] = (res.headers as any).getSetCookie();
    const jar = set.map((c) => c.split(';')[0]).join('; ');
    assert.ok(set.some((c) => /access_token=.*HttpOnly/i.test(c)) && set.some((c) => /refresh_token=.*HttpOnly/i.test(c)));
    assert.ok(!set.some((c) => /^csrf_token=.*HttpOnly/i.test(c))); // readable by JS by design
    const csrf = /csrf_token=([^;]+)/.exec(jar)![1];
    const body = JSON.stringify({ name: 'CSRF Role' });
    const noHeader = await fetch(h.base + '/roles', { method: 'POST', headers: { 'content-type': 'application/json', cookie: jar }, body });
    assert.equal(noHeader.status, 403); assert.equal((await noHeader.json()).code, 'CSRF_FAILED');
    const wrong = await fetch(h.base + '/roles', { method: 'POST', headers: { 'content-type': 'application/json', cookie: jar, 'x-csrf-token': 'x'.repeat(48) }, body });
    assert.equal(wrong.status, 403);
    const ok = await fetch(h.base + '/roles', { method: 'POST', headers: { 'content-type': 'application/json', cookie: jar, 'x-csrf-token': csrf }, body });
    assert.equal(ok.status, 201);
    const get = await fetch(h.base + '/roles', { headers: { cookie: jar } }); // reads need no CSRF token
    assert.equal(get.status, 200);
  });
});

describe('audit log API', () => {
  it('paginates and filters', async () => {
    const all = (await h.call('GET', '/audit-logs?limit=2&page=1', { token: T.ownerA })).body.data;
    assert.equal(all.items.length, 2); assert.ok(all.total > 2);
    const roles = (await h.call('GET', '/audit-logs?entity=role', { token: T.ownerA })).body.data;
    assert.ok(roles.items.length > 0 && roles.items.every((i: any) => i.entity === 'role'));
    assert.equal((await h.call('GET', '/audit-logs?limit=1000', { token: T.ownerA })).status, 400);
  });
  it('unknown routes use the error envelope', async () => {
    const r = await h.call('GET', '/does-not-exist', { token: T.ownerA });
    assert.equal(r.status, 404); assert.equal(r.body.success, false);
  });
});
