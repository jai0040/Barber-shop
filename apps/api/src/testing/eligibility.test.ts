import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {}, S: Record<string, string> = {}, W: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const call = (m: string, p: string, token?: string, body?: unknown) => h.call(m, p, { token, body });
const week = (open = '10:00', close = '21:00') => Array.from({ length: 7 }, (_, i) => (i === 6 ? { weekday: 7, isClosed: true } : { weekday: i + 1, isClosed: false, openTime: open, closeTime: close }));
const days = (working: number[], s = '10:00', e = '21:00', br?: [string, string]) => Array.from({ length: 7 }, (_, i) => working.includes(i + 1)
  ? { weekday: i + 1, isWorking: true, startTime: s, endTime: e, ...(br ? { breakStart: br[0], breakEnd: br[1] } : {}) } : { weekday: i + 1, isWorking: false });
const MON = '2030-01-07', SAT = '2030-01-12', SUN = '2030-01-13'; // 2030-01-07 is a Monday
const at = (d: string, t: string) => `${d}T${t}:00+05:30`;

// Demo shop: Mon-Sat 10:00-21:00.
//  Rahul: Haircut+Beard, Mon-Sat 10-21, break 13-14      Amit: everything, Mon-Fri 12-20      Raj: Haircut, Mon-Sat 10-21, off Mon 15-18
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
  await call('PUT', '/shops/current/hours', T.ownerA, { hours: week() }); await call('PUT', '/shops/current/hours', T.ownerB, { hours: week() });
  await h.call('POST', '/auth/register', { body: { name: 'Jay Patel', phone: '9876543210', password: pw } }); T.cust = await login('9876543210');
  for (const [n, price, dur] of [['haircut', 30000, 30], ['beard', 15000, 15], ['color', 80000, 60], ['facial', 60000, 45]] as const)
    S[n] = (await call('POST', '/services', T.ownerA, { name: n[0].toUpperCase() + n.slice(1), pricePaise: price, durationMin: dur })).body.data.id;
  S.haircutB = (await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25 })).body.data.id;
  const mk = async (name: string, phone: string, svcs: string[]) => {
    const r = await call('POST', '/workers', T.ownerA, { displayName: name, login: { phone, password: pw } }); W[name] = r.body.data.id; T[name] = await login(phone);
    assert.equal((await call('PUT', `/workers/${r.body.data.id}/services`, T.ownerA, { ids: svcs.map((x) => S[x]) })).status, 200);
  };
  await mk('Rahul', '9000000021', ['haircut', 'beard']); await mk('Amit', '9000000022', ['haircut', 'beard', 'color', 'facial']); await mk('Raj', '9000000023', ['haircut']);
  await call('PUT', `/workers/${W.Rahul}/availability`, T.ownerA, { days: days([1, 2, 3, 4, 5, 6], '10:00', '21:00', ['13:00', '14:00']) });
  await call('PUT', `/workers/${W.Amit}/availability`, T.ownerA, { days: days([1, 2, 3, 4, 5], '12:00', '20:00') });
  await call('PUT', `/workers/${W.Raj}/availability`, T.ownerA, { useShopHours: true });
  await call('POST', `/workers/${W.Raj}/time-off`, T.ownerA, { startAt: at(MON, '15:00'), endAt: at(MON, '18:00'), reason: 'Dentist' });
  W.Bhavin = (await call('POST', '/workers', T.ownerB, { displayName: 'Bhavin' })).body.data.id;
  await call('PUT', `/workers/${W.Bhavin}/services`, T.ownerB, { ids: [S.haircutB] });
  await call('PUT', `/workers/${W.Bhavin}/availability`, T.ownerB, { useShopHours: true });
});
after(async () => { await h?.close(); });

const elig = async (names: string[], start?: string, t = T.ownerA) => {
  const r = await call('GET', `/workers/eligible?serviceIds=${names.map((n) => S[n]).join(',')}${start ? `&start=${encodeURIComponent(start)}` : ''}`, t);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ok: r.body.data.eligible.map((w: any) => w.displayName).sort(), no: Object.fromEntries(r.body.data.unavailable.map((w: any) => [w.displayName, w.reason])), data: r.body.data };
};

describe('4D ELIGIBILITY (exit gate): who can do this job at this moment?', () => {
  it('capability only (no time): must be able to do EVERY selected service', async () => {
    assert.deepEqual((await elig(['haircut'])).ok, ['Amit', 'Rahul', 'Raj']);
    assert.deepEqual((await elig(['color'])).ok, ['Amit']);
    assert.deepEqual((await elig(['haircut', 'color'])).ok, ['Amit']);
    assert.deepEqual((await elig(['beard', 'facial'])).ok, ['Amit']);
    assert.deepEqual((await elig(['haircut', 'beard'])).ok, ['Amit', 'Rahul']);
    assert.equal((await elig(['haircut', 'beard'])).data.totalDurationMin, 45);
  });
  it('Mon 11:00 haircut: Amit starts at 12:00 so is out', async () => {
    const r = await elig(['haircut'], at(MON, '11:00'));
    assert.deepEqual(r.ok, ['Rahul', 'Raj']); assert.deepEqual(r.no, { Amit: 'outside_worker_hours' });
  });
  it("Mon 12:45 haircut: overlaps Rahul's 13:00-14:00 break", async () => {
    const r = await elig(['haircut'], at(MON, '12:45'));
    assert.deepEqual(r.ok, ['Amit', 'Raj']); assert.deepEqual(r.no, { Rahul: 'on_break' });
  });
  it('ending exactly when the break starts (12:30) and starting exactly when it ends (14:00) are both fine', async () => {
    assert.deepEqual((await elig(['haircut'], at(MON, '12:30'))).ok, ['Amit', 'Rahul', 'Raj']);
    assert.deepEqual((await elig(['haircut'], at(MON, '14:00'))).ok, ['Amit', 'Rahul', 'Raj']);
  });
  it("Mon 15:30 haircut: Raj is on time off (15:00-18:00); 14:45 clashes; 18:00 is fine", async () => {
    assert.deepEqual((await elig(['haircut'], at(MON, '15:30'))).no, { Raj: 'time_off' });
    assert.deepEqual((await elig(['haircut'], at(MON, '14:45'))).no, { Raj: 'time_off' });
    assert.deepEqual((await elig(['haircut'], at(MON, '18:00'))).ok, ['Amit', 'Rahul', 'Raj']);
  });
  it('multi-service duration is respected (haircut+beard = 45 min): 19:30 ends 20:15, past Amit\'s 20:00; Raj cannot do beard so is not even listed', async () => {
    const r = await elig(['haircut', 'beard'], at(MON, '19:30'));
    assert.deepEqual(r.ok, ['Rahul']); assert.deepEqual(r.no, { Amit: 'outside_worker_hours' });
    assert.equal(r.data.end, new Date(at(MON, '20:15')).toISOString());
  });
  it('shop hours bound everyone: before opening, after closing, and Sunday', async () => {
    assert.deepEqual((await elig(['haircut'], at(MON, '09:45'))).ok, []);
    const late = await elig(['haircut'], at(MON, '20:45')); assert.deepEqual(late.ok, []); assert.equal(late.no.Rahul, 'outside_shop_hours');
    const sun = await elig(['haircut'], at(SUN, '11:00')); assert.deepEqual(sun.ok, []); assert.deepEqual(Object.values(sun.no), ['shop_closed', 'shop_closed', 'shop_closed']);
  });
  it('a worker who does not work that weekday is out (Amit works Mon-Fri only)', async () => {
    const r = await elig(['haircut'], at(SAT, '15:00'));
    assert.deepEqual(r.ok, ['Rahul', 'Raj']); assert.deepEqual(r.no, { Amit: 'not_working' });
  });
  it('a worker with no availability saved is never offered a time', async () => {
    const w = (await call('POST', '/workers', T.ownerA, { displayName: 'Unscheduled' })).body.data;
    await call('PUT', `/workers/${w.id}/services`, T.ownerA, { ids: [S.haircut] });
    const r = await elig(['haircut'], at(MON, '11:00'));
    assert.equal(r.no.Unscheduled, 'not_working'); assert.equal(r.ok.includes('Unscheduled'), false);
    await call('DELETE', `/workers/${w.id}`, T.ownerA);
  });
  it('inactive and archived workers, and inactive services, are excluded', async () => {
    await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'inactive' });
    assert.deepEqual((await elig(['haircut'], at(MON, '11:00'))).ok, ['Rahul']);
    await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'active' });
    const t = (await call('POST', '/workers', T.ownerA, { displayName: 'Temp Archived' })).body.data.id;
    await call('PUT', `/workers/${t}/services`, T.ownerA, { ids: [S.haircut] }); await call('PUT', `/workers/${t}/availability`, T.ownerA, { useShopHours: true });
    assert.equal((await elig(['haircut'], at(MON, '11:00'))).ok.includes('Temp Archived'), true);
    await call('DELETE', `/workers/${t}`, T.ownerA);
    assert.equal((await elig(['haircut'], at(MON, '11:00'))).ok.includes('Temp Archived'), false);
    await call('PATCH', `/services/${S.facial}`, T.ownerA, { status: 'inactive' });
    assert.equal((await call('GET', `/workers/eligible?serviceIds=${S.facial}`, T.ownerA)).status, 400);
    await call('PATCH', `/services/${S.facial}`, T.ownerA, { status: 'active' });
  });
  it("the SHOP's timezone decides local time: the same instant gives a different answer in another zone", async () => {
    assert.deepEqual((await elig(['haircut'], at(MON, '11:00'))).ok, ['Rahul', 'Raj']);
    await call('PATCH', '/shops/current', T.ownerA, { timezone: 'Asia/Dubai' }); // 11:00 IST == 09:30 Dubai, before opening
    const r = await elig(['haircut'], at(MON, '11:00'));
    assert.deepEqual(r.ok, []); assert.equal(r.no.Rahul, 'outside_shop_hours'); assert.equal(r.data.timezone, 'Asia/Dubai');
    await call('PATCH', '/shops/current', T.ownerA, { timezone: 'Asia/Kolkata' });
  });
  it('input validation: ids required/valid, start needs an offset, unknown service, foreign service', async () => {
    const g = (q: string) => call('GET', `/workers/eligible${q}`, T.ownerA);
    for (const q of ['', '?serviceIds=', '?serviceIds=abc', `?serviceIds=${S.haircut}&start=2030-01-07T11:00:00`, `?serviceIds=${S.haircut}&start=garbage`,
      '?serviceIds=11111111-1111-4111-8111-111111111111', `?serviceIds=${S.haircutB}`])
      assert.equal((await g(q)).status, 400, q);
  });
  it('permissions: anyone who can assign or create appointments (incl. workers doing walk-ins) may ask; customers, anonymous and others may not', async () => {
    for (const t of [T.managerA, T.cashierA, T.ownerA, T.Rahul]) assert.equal((await call('GET', `/workers/eligible?serviceIds=${S.haircut}`, t)).status, 200);
    assert.equal((await call('GET', `/workers/eligible?serviceIds=${S.haircut}`, T.cust)).status, 403);
    assert.equal((await call('GET', `/workers/eligible?serviceIds=${S.haircut}`)).status, 401);
    // a role with neither permission is refused
    const role = (await call('POST', '/roles', T.ownerA, { name: 'Viewer Only', permissions: { 'services.view': 'all' } })).body.data.id;
    await call('POST', '/users', T.ownerA, { name: 'Viewer Person', phone: '9000000088', password: pw, roleIds: [role] });
    assert.equal((await call('GET', `/workers/eligible?serviceIds=${S.haircut}`, await login('9000000088'))).status, 403);
  });
  it("TENANT: Shop B's eligibility never contains Shop A's workers, and vice versa", async () => {
    const b = await call('GET', `/workers/eligible?serviceIds=${S.haircutB}&start=${encodeURIComponent(at(MON, '11:00'))}`, T.ownerB);
    assert.deepEqual(b.body.data.eligible.map((w: any) => w.displayName), ['Bhavin']);
    assert.equal((await elig(['haircut'])).ok.includes('Bhavin'), false);
  });
});

describe('4D: public barbers (customer website)', () => {
  const names = async (q = '') => (await call('GET', `/shops/public/classic/barbers${q}`)).body.data.map((b: any) => b.displayName);
  it('lists active barbers; filtered to those who can do ALL chosen services', async () => {
    assert.deepEqual(await names(), ['Amit', 'Rahul', 'Raj']);
    assert.deepEqual(await names(`?serviceIds=${S.haircut}`), ['Amit', 'Rahul', 'Raj']);
    assert.deepEqual(await names(`?serviceIds=${S.color}`), ['Amit']);
    assert.deepEqual(await names(`?serviceIds=${S.haircut},${S.color}`), ['Amit']);
    assert.deepEqual(await names(`?serviceIds=${S.haircut},${S.beard}`), ['Amit', 'Rahul']);
  });
  it('hides inactive and archived barbers, other shops, and every private field', async () => {
    await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'inactive' });
    assert.deepEqual(await names(), ['Amit', 'Rahul']);
    await call('PATCH', `/workers/${W.Raj}`, T.ownerA, { status: 'active' });
    const all = (await call('GET', '/shops/public/classic/barbers')).body.data;
    assert.ok(!JSON.stringify(all).includes('Bhavin'));
    for (const k of ['phone', 'email', 'userId', 'login', 'status', 'availability', 'timeOff', 'shop_id']) assert.equal(JSON.stringify(all).includes(`"${k}"`), false, k);
    assert.deepEqual(all.find((b: any) => b.displayName === 'Rahul').serviceIds.sort(), [S.haircut, S.beard].sort());
    assert.deepEqual(await (async () => (await call('GET', '/shops/public/sharp/barbers')).body.data.map((b: any) => b.displayName))(), ['Bhavin']);
  });
  it('inactive services are not exposed through barbers; bad input and unknown shops are refused', async () => {
    await call('PATCH', `/services/${S.facial}`, T.ownerA, { status: 'inactive' });
    assert.equal(JSON.stringify((await call('GET', '/shops/public/classic/barbers')).body.data).includes(S.facial), false);
    await call('PATCH', `/services/${S.facial}`, T.ownerA, { status: 'active' });
    assert.equal((await call('GET', '/shops/public/classic/barbers?serviceIds=not-a-uuid')).status, 400);
    assert.equal((await call('GET', '/shops/public/nope-shop/barbers')).status, 404);
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'suspended' });
    assert.equal((await call('GET', '/shops/public/sharp/barbers')).status, 404); // suspended shops are invisible
    await call('PATCH', `/platform/shops/${ID.shopB}/status`, T.platform, { status: 'active' });
  });
  it('DATABASE LEVEL: public scope sees only active worker-service links, never schedules, and cannot write', async () => {
    const q = async (setup: [string, string][], sql: string) => {
      const c = await h.appPool.connect();
      try { await c.query('BEGIN'); for (const [k, v] of setup) await c.query('SELECT set_config($1,$2,true)', [k, v]); const r = (await c.query(sql)).rows[0].n; await c.query('ROLLBACK'); return r; } finally { c.release(); }
    };
    const pub: [string, string][] = [['app.public_read', 'on']];
    assert.ok((await q(pub, 'SELECT count(*)::int n FROM worker_services')) >= 6);
    assert.equal(await q(pub, `SELECT count(*)::int n FROM worker_services ws JOIN services s ON s.id = ws.service_id WHERE s.status <> 'active'`), 0);
    assert.equal(await q(pub, 'SELECT count(*)::int n FROM worker_availability'), 0);
    assert.equal(await q(pub, 'SELECT count(*)::int n FROM worker_time_off'), 0);
    assert.equal(await q([], 'SELECT count(*)::int n FROM worker_services'), 0);
    const c = await h.appPool.connect();
    try {
      await c.query('BEGIN'); await c.query(`SELECT set_config('app.public_read','on',true)`);
      assert.equal((await c.query('DELETE FROM worker_services')).rowCount, 0);
      await assert.rejects(c.query('INSERT INTO worker_services (worker_id, service_id, shop_id) VALUES ($1,$2,$3)', [W.Rahul, S.color, ID.shopA]), /row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
