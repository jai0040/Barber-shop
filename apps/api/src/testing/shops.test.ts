import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const png = (w = 800, h2 = 600) => sharp({ create: { width: w, height: h2, channels: 3, background: '#2255cc' } }).png().toBuffer();
const filesOnDisk = (shopId: string) => { try { return readdirSync(path.join(h.uploadDir, shopId)); } catch { return []; } };

const week = (open = '10:00', close = '21:00') => Array.from({ length: 7 }, (_, i) =>
  i === 6 ? { weekday: 7, isClosed: true } : { weekday: i + 1, isClosed: false, openTime: open, closeTime: close });

before(async () => {
  h = await boot(54343);
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await login('root@platform.test');
  for (const [k, name, slug, phone] of [['A', 'Classic Barber Shop', 'classic', '9000000001'], ['B', 'Sharp Cuts', 'sharp', '9000000002']]) {
    const r = await h.call('POST', '/platform/shops', { token: T.platform, body: { name, slug, owner: { name: name + ' Owner', phone, password: pw } } });
    ID['shop' + k] = r.body.data.id; T['owner' + k] = await login(phone);
  }
  const roles = Object.fromEntries((await h.call('GET', '/roles', { token: T.ownerA })).body.data.map((r: any) => [r.system_key, r.id]));
  for (const [k, phone, role] of [['workerA', '9000000011', 'worker'], ['managerA', '9000000012', 'manager'], ['cashierA', '9000000013', 'cashier']]) {
    await h.call('POST', '/users', { token: T.ownerA, body: { name: k + ' person', phone, password: pw, roleIds: [roles[role]] } });
    T[k] = await login(phone);
  }
  await h.call('POST', '/auth/register', { body: { name: 'Jay Patel', phone: '9876543210', password: pw } });
  T.cust = await login('9876543210');
});
after(() => h?.close());

describe('shop profile', () => {
  it('any staff can read their shop; customers and anonymous cannot', async () => {
    const r = await h.call('GET', '/shops/current', { token: T.workerA });
    assert.equal(r.status, 200); assert.equal(r.body.data.slug, 'classic'); assert.equal(r.body.data.settings.cancellation_cooldown_hours, 24);
    assert.equal((await h.call('GET', '/shops/current', { token: T.cust })).status, 403);
    assert.equal((await h.call('GET', '/shops/current', { token: T.platform })).status, 403);
    assert.equal((await h.call('GET', '/shops/current')).status, 401);
  });
  it('only settings.manage can edit; edit is audited with old/new values', async () => {
    const body = { phone: '98250 12345', email: 'Hello@Classic.test', address: '12 MG Road', city: 'Ahmedabad', state: 'Gujarat', gstNo: '24abcde1234f1z5' };
    for (const t of [T.workerA, T.managerA, T.cashierA, T.cust]) assert.equal((await h.call('PATCH', '/shops/current', { token: t, body })).status, 403);
    const r = await h.call('PATCH', '/shops/current', { token: T.ownerA, body });
    assert.equal(r.status, 200); assert.equal(r.body.data.phone, '+919825012345'); assert.equal(r.body.data.email, 'hello@classic.test'); assert.equal(r.body.data.gstNo, '24ABCDE1234F1Z5');
    const log = (await h.call('GET', '/audit-logs?action=shop.update', { token: T.ownerA })).body.data.items[0];
    assert.equal(log.new_values.city, 'Ahmedabad'); assert.equal(log.old_values.city, null);
  });
  it('validates input', async () => {
    const bad = async (b: object) => assert.equal((await h.call('PATCH', '/shops/current', { token: T.ownerA, body: b })).status, 400, JSON.stringify(b));
    await bad({ phone: '123' }); await bad({ email: 'nope' }); await bad({ gstNo: '123' }); await bad({ timezone: 'Mars/Base' }); await bad({ name: 'X' }); await bad({});
  });
  it('optional fields can be cleared with null', async () => {
    const r = await h.call('PATCH', '/shops/current', { token: T.ownerA, body: { gstNo: null, email: null } });
    assert.equal(r.status, 200); assert.equal(r.body.data.gstNo, null);
  });
  it("editing Shop A never touches Shop B", async () => {
    const b = (await h.call('GET', '/shops/current', { token: T.ownerB })).body.data;
    assert.equal(b.city, null); assert.equal(b.name, 'Sharp Cuts');
  });
});

describe('business hours', () => {
  it('starts empty, then accepts a full week and round-trips', async () => {
    assert.deepEqual((await h.call('GET', '/shops/current', { token: T.ownerA })).body.data.hours, []);
    const r = await h.call('PUT', '/shops/current/hours', { token: T.ownerA, body: { hours: week() } });
    assert.equal(r.status, 200);
    const hrs = (await h.call('GET', '/shops/current', { token: T.ownerA })).body.data.hours;
    assert.equal(hrs.length, 7); assert.deepEqual(hrs[0], { weekday: 1, isClosed: false, openTime: '10:00', closeTime: '21:00' });
    assert.deepEqual(hrs[6], { weekday: 7, isClosed: true, openTime: null, closeTime: null });
  });
  it('rejects bad schedules', async () => {
    const put = (hours: unknown) => h.call('PUT', '/shops/current/hours', { token: T.ownerA, body: { hours } });
    assert.equal((await put(week('21:00', '10:00'))).status, 400);                         // close before open
    assert.equal((await put(week('10:00', '10:00'))).status, 400);                         // zero length
    assert.equal((await put(week().slice(0, 6))).status, 400);                              // missing a day
    assert.equal((await put(week().map((d) => ({ ...d, weekday: 1 })))).status, 400);      // duplicate weekday
    assert.equal((await put(week('25:00', '26:00'))).status, 400);                          // invalid time
    assert.equal((await put(week().map((d) => (d.weekday === 7 ? { weekday: 7, isClosed: true, openTime: '10:00', closeTime: '11:00' } : d)))).status, 400); // closed day with times
    assert.equal((await put(week().map((d) => (d.weekday === 2 ? { weekday: 2, isClosed: false } : d)))).status, 400); // open day without times
  });
  it('is permission-protected and replaces (not appends) on re-save; audited', async () => {
    assert.equal((await h.call('PUT', '/shops/current/hours', { token: T.workerA, body: { hours: week() } })).status, 403);
    await h.call('PUT', '/shops/current/hours', { token: T.ownerA, body: { hours: week('09:30', '20:00') } });
    const hrs = (await h.call('GET', '/shops/current', { token: T.ownerA })).body.data.hours;
    assert.equal(hrs.length, 7); assert.equal(hrs[0].openTime, '09:30');
    const log = (await h.call('GET', '/audit-logs?action=shop.hours.update', { token: T.ownerA })).body.data.items[0];
    assert.equal(log.old_values[0].openTime, '10:00'); assert.equal(log.new_values[0].openTime, '09:30');
    await h.call('PUT', '/shops/current/hours', { token: T.ownerA, body: { hours: week() } });
  });
  it('database rejects a bad window even if the API were bypassed', async () => {
    await assert.rejects(h.ownerPool.query(`INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time) VALUES ($1, 1, false, '20:00', '10:00') ON CONFLICT (shop_id, weekday) DO UPDATE SET open_time='20:00', close_time='10:00'`, [ID.shopA]), /shop_hours_window_chk/);
  });
});

describe('booking rules (cancellation cooldown & booking window)', () => {
  it('defaults to 24h cooldown / 30 days and can be changed with bounds', async () => {
    const r = await h.call('PATCH', '/shops/current/settings', { token: T.ownerA, body: { cancellationCooldownHours: 48, advanceBookingDays: 14 } });
    assert.equal(r.status, 200); assert.equal(r.body.data.cancellation_cooldown_hours, 48); assert.equal(r.body.data.advance_booking_days, 14);
    for (const b of [{ cancellationCooldownHours: -1 }, { cancellationCooldownHours: 99999 }, { advanceBookingDays: 0 }, { advanceBookingDays: 1.5 }, {}])
      assert.equal((await h.call('PATCH', '/shops/current/settings', { token: T.ownerA, body: b })).status, 400);
    assert.equal((await h.call('PATCH', '/shops/current/settings', { token: T.managerA, body: { advanceBookingDays: 5 } })).status, 403);
    assert.equal((await h.call('GET', '/shops/current', { token: T.ownerB })).body.data.settings.advance_booking_days, 30); // other shop unaffected
    await h.call('PATCH', '/shops/current/settings', { token: T.ownerA, body: { cancellationCooldownHours: 24, advanceBookingDays: 30 } });
  });
});

describe('setup checklist', () => {
  it('reports progress per shop', async () => {
    const b = (await h.call('GET', '/shops/current/setup', { token: T.ownerB })).body.data;
    assert.equal(b.complete, false); assert.deepEqual(b.steps.filter((s: any) => !s.optional && !s.done).map((s: any) => s.key), ['profile', 'hours']);
    const a = (await h.call('GET', '/shops/current/setup', { token: T.ownerA })).body.data;
    assert.equal(a.complete, true);
  });
});

describe('public shop pages (customer website)', () => {
  it('lists active shops without login and exposes only safe fields', async () => {
    const l = await h.call('GET', '/shops/public');
    assert.equal(l.status, 200); assert.deepEqual(l.body.data.items.map((s: any) => s.slug), ['classic', 'sharp']);
    const d = (await h.call('GET', '/shops/public/classic')).body.data;
    assert.equal(d.name, 'Classic Barber Shop'); assert.equal(d.hours.length, 7); assert.equal(d.advanceBookingDays, 30);
    for (const forbidden of ['gstNo', 'gst_no', 'settings', 'id', 'hasUpiQr', 'upi_qr_file_id']) assert.equal(forbidden in d, false, forbidden);
    assert.equal(JSON.stringify(d).includes('cooldown'), false);
  });
  it('search works and is injection-safe', async () => {
    assert.deepEqual((await h.call('GET', '/shops/public?q=sharp')).body.data.items.map((s: any) => s.slug), ['sharp']);
    assert.equal((await h.call('GET', "/shops/public?q=%27%3B%20DROP%20TABLE%20shops%3B--")).body.data.total, 0);
    assert.equal((await h.call('GET', '/shops/public?q=%25')).body.data.total, 0); // "%" is literal, not a wildcard
    assert.equal((await h.call('GET', '/shops/public?limit=9999')).status, 400);
  });
  it('unknown / malformed slugs are 404 / 400; suspended shops vanish', async () => {
    assert.equal((await h.call('GET', '/shops/public/nope-shop')).status, 404);
    assert.equal((await h.call('GET', '/shops/public/BAD_SLUG!')).status, 400);
    await h.call('PATCH', `/platform/shops/${ID.shopB}/status`, { token: T.platform, body: { status: 'suspended' } });
    assert.equal((await h.call('GET', '/shops/public/sharp')).status, 404);
    assert.deepEqual((await h.call('GET', '/shops/public')).body.data.items.map((s: any) => s.slug), ['classic']);
    await h.call('PATCH', `/platform/shops/${ID.shopB}/status`, { token: T.platform, body: { status: 'active' } });
  });
  it('DATABASE LEVEL: public scope is read-only and sees nothing private', async () => {
    const run = async (sql: string, params: unknown[] = []) => {
      const c = await h.appPool.connect();
      try {
        await c.query('BEGIN'); await c.query(`SELECT set_config('app.public_read','on',true)`);
        try { return (await c.query(sql, params)).rows; } finally { await c.query('ROLLBACK'); }
      } finally { c.release(); }
    };
    assert.equal((await run('SELECT count(*)::int n FROM shops'))[0].n, 2);
    assert.equal((await run('SELECT count(*)::int n FROM roles'))[0].n, 0);
    assert.equal((await run('SELECT count(*)::int n FROM audit_logs'))[0].n, 0);
    assert.equal((await run('SELECT count(*)::int n FROM files'))[0].n, 0); // no QR/other files
    assert.equal((await run(`UPDATE shops SET name = 'pwned' RETURNING id`)).length, 0); // RLS: no row is even visible for writing
    assert.equal((await run(`DELETE FROM shops RETURNING id`)).length, 0);
    await assert.rejects(run(`INSERT INTO shops (name, slug) VALUES ('Evil','evil-shop')`), /row-level security/);
  });
});

describe('logo upload', () => {
  it('only settings.manage can upload; valid image is re-encoded and served publicly', async () => {
    const img = await png(1600, 1200);
    for (const t of [T.workerA, T.cashierA, T.cust, undefined]) assert.ok([401, 403].includes((await h.upload('/shops/current/logo', t, img)).status));
    const r = await h.upload('/shops/current/logo', T.ownerA, img, { filename: '../../evil.php.png' });
    assert.equal(r.status, 200); assert.ok(r.body.data.width <= 512 && r.body.data.height <= 512);
    const res = await fetch(h.base + '/shops/public/classic/logo');
    assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/webp');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
    const out = Buffer.from(await res.arrayBuffer());
    assert.equal((await sharp(out).metadata()).format, 'webp');
    assert.equal((await h.call('GET', '/shops/public/classic')).body.data.logoUrl, '/api/v1/shops/public/classic/logo');
  });
  it('strips EXIF/metadata from uploads', async () => {
    const withExif = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#0a0' } }).jpeg().withExif({ IFD0: { Copyright: 'SECRET-GPS-ISH' } }).toBuffer();
    assert.ok(withExif.includes(Buffer.from('SECRET-GPS-ISH')));
    assert.equal((await h.upload('/shops/current/logo', T.ownerA, withExif, { mime: 'image/jpeg', filename: 'a.jpg' })).status, 200);
    const out = Buffer.from(await (await fetch(h.base + '/shops/public/classic/logo')).arrayBuffer());
    assert.equal(out.includes(Buffer.from('SECRET-GPS-ISH')), false); assert.equal((await sharp(out).metadata()).exif, undefined);
  });
  it('rejects disguised, malformed, oversized and missing files', async () => {
    const up = (buf: Buffer | null, o?: object) => h.upload('/shops/current/logo', T.ownerA, buf, o);
    const text = await up(Buffer.from('<?php system($_GET["c"]); ?>'), { mime: 'image/png', filename: 'logo.png' });
    assert.equal(text.status, 400); assert.equal(text.body.code, 'UNSUPPORTED_FILE');
    const svg = await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>'), { mime: 'image/png', filename: 'logo.png' });
    assert.equal(svg.status, 400);
    const trunc = await up((await png()).subarray(0, 60), { filename: 'x.png' });
    assert.equal(trunc.status, 400);
    const big = await up(Buffer.alloc(2 * 1024 * 1024, 1), { filename: 'big.png' });
    assert.equal(big.status, 413); assert.equal(big.body.code, 'PAYLOAD_TOO_LARGE');
    assert.equal((await up(await png(16, 16))).status, 400); // too small
    assert.equal((await up(null)).status, 400);
    assert.equal((await up(await png(), { field: 'wrongfield' })).status, 400);
  });
  it('replacing the logo keeps exactly one stored file; removing it clears the public logo', async () => {
    await h.upload('/shops/current/logo', T.ownerA, await png(300, 300));
    assert.equal(filesOnDisk(ID.shopA).length, 1);
    assert.equal((await h.ownerPool.query(`SELECT count(*)::int n FROM files WHERE shop_id=$1 AND kind='shop_logo'`, [ID.shopA])).rows[0].n, 1);
    assert.equal((await h.call('DELETE', '/shops/current/logo', { token: T.workerA })).status, 403);
    assert.equal((await h.call('DELETE', '/shops/current/logo', { token: T.ownerA })).status, 200);
    assert.equal(filesOnDisk(ID.shopA).length, 0);
    assert.equal((await fetch(h.base + '/shops/public/classic/logo')).status, 404);
    assert.equal((await h.call('DELETE', '/shops/current/logo', { token: T.ownerA })).status, 404);
  });
});

describe('UPI QR (private)', () => {
  it('owner uploads; cashier/owner can view it; worker, customer, anonymous cannot', async () => {
    assert.equal((await h.call('GET', '/shops/current/upi-qr', { token: T.ownerA })).status, 404); // none yet
    assert.equal((await h.upload('/shops/current/upi-qr', T.ownerA, await png(500, 500))).status, 200);
    const ok = await fetch(h.base + '/shops/current/upi-qr', { headers: { authorization: `Bearer ${T.cashierA}` } });
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'image/png'); assert.equal(ok.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(h.base + '/shops/current/upi-qr', { headers: { authorization: `Bearer ${T.ownerA}` } })).status, 200);
    for (const t of [T.workerA, T.cust]) assert.equal((await h.call('GET', '/shops/current/upi-qr', { token: t })).status, 403);
    assert.equal((await h.call('GET', '/shops/current/upi-qr')).status, 401);
  });
  it('DATABASE LEVEL: with both a logo and a QR stored, public scope sees only the logo', async () => {
    await h.upload('/shops/current/logo', T.ownerA, await png(200, 200));
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN'); await c.query(`SELECT set_config('app.public_read','on',true)`);
      const r = (await c.query(`SELECT kind, count(*)::int n FROM files GROUP BY kind ORDER BY kind`)).rows;
      await c.query('ROLLBACK');
      assert.deepEqual(r, [{ kind: 'shop_logo', n: 1 }]); // Shop A logo only; no QR rows from A or B
    } finally { c.release(); }
  });
  it('QR is not exposed publicly in any form', async () => {
    assert.equal((await h.call('GET', '/shops/public/classic')).body.data.hasUpiQr, undefined);
    assert.equal((await fetch(h.base + '/shops/public/classic/upi-qr')).status, 404);
    assert.equal(JSON.stringify((await h.call('GET', '/shops/public/classic')).body).includes('qr'), false);
  });
  it("Shop B cannot fetch Shop A's QR; each shop only ever gets its own", async () => {
    assert.equal((await h.call('GET', '/shops/current/upi-qr', { token: T.ownerB })).status, 404);
    await h.upload('/shops/current/upi-qr', T.ownerB, await png(640, 640));
    const a = Buffer.from(await (await fetch(h.base + '/shops/current/upi-qr', { headers: { authorization: `Bearer ${T.ownerA}` } })).arrayBuffer());
    const b = Buffer.from(await (await fetch(h.base + '/shops/current/upi-qr', { headers: { authorization: `Bearer ${T.ownerB}` } })).arrayBuffer());
    assert.equal((await sharp(a).metadata()).width, 500); assert.equal((await sharp(b).metadata()).width, 640);
  });
  it('DATABASE LEVEL: a shop cannot point at another shop\'s file', async () => {
    const fileB = (await h.ownerPool.query(`SELECT id FROM files WHERE shop_id=$1 AND kind='upi_qr'`, [ID.shopB])).rows[0].id;
    await assert.rejects(h.ownerPool.query('UPDATE shops SET upi_qr_file_id=$1 WHERE id=$2', [fileB, ID.shopA]), /foreign key/);
  });
  it('removal works and is audited; setup checklist reflects it', async () => {
    assert.equal((await h.call('DELETE', '/shops/current/upi-qr', { token: T.ownerA })).status, 200);
    assert.equal((await h.call('GET', '/shops/current/upi-qr', { token: T.ownerA })).status, 404);
    const actions = (await h.call('GET', '/audit-logs?limit=100', { token: T.ownerA })).body.data.items.map((i: any) => i.action);
    assert.ok(actions.includes('shop.upi_qr.update') && actions.includes('shop.upi_qr.remove') && actions.includes('shop.logo.update'));
  });
});
