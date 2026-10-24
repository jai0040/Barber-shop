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
const MON = '2030-01-07'; // a Monday
const at = (d: string, t: string) => `${d}T${t}:00+05:30`;

before(async () => {
  h = await boot(54347);
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await login('root@platform.test');
  for (const [k, name, slug, phone] of [['A', 'Classic Barber Shop', 'classic', '9000000001'], ['B', 'Sharp Cuts', 'sharp', '9000000002']]) {
    const r = await call('POST', '/platform/shops', T.platform, { name, slug, owner: { name: name + ' Owner', phone, password: pw } });
    ID['shop' + k] = r.body.data.id; T['owner' + k] = await login(phone);
  }
  const roles = Object.fromEntries((await call('GET', '/roles', T.ownerA)).body.data.map((r: any) => [r.system_key, r.id]));
  ID.roleWorker = roles.worker;
  for (const [k, phone, role] of [['managerA', '9000000012', 'manager'], ['cashierA', '9000000013', 'cashier']]) {
    await call('POST', '/users', T.ownerA, { name: k + ' person', phone, password: pw, roleIds: [roles[role]] }); T[k] = await login(phone);
  }
  assert.equal((await call('PUT', '/shops/current/hours', T.ownerA, { hours: week() })).status, 200); // Shop A has hours; Shop B deliberately has none yet
  for (const [n, price, dur] of [['Haircut', 30000, 30], ['Beard', 15000, 15], ['Hair Color', 80000, 60], ['Facial', 60000, 45]] as const)
    S[n] = (await call('POST', '/services', T.ownerA, { name: n, pricePaise: price, durationMin: dur })).body.data.id;
  S.haircutB = (await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25 })).body.data.id;
  for (const [name, phone] of [['Rahul', '9000000021'], ['Amit', '9000000022'], ['Raj', '9000000023']]) {
    const r = await call('POST', '/workers', T.ownerA, { displayName: name, login: { phone, password: pw } });
    W[name] = r.body.data.id; T[name] = await login(phone);
  }
  W.Bhavin = (await call('POST', '/workers', T.ownerB, { displayName: 'Bhavin' })).body.data.id;
});
after(() => h?.close());

describe('4C: worker <-> service mapping', () => {
  it('starts empty; owner and manager can set it; cashier and plain workers cannot', async () => {
    assert.deepEqual((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.serviceIds, []);
    assert.equal((await call('PUT', `/workers/${W.Rahul}/services`, T.ownerA, { ids: [S.Haircut, S.Beard] })).status, 200);
    assert.deepEqual((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.serviceIds.sort(), [S.Haircut, S.Beard].sort());
    assert.equal((await call('PUT', `/workers/${W.Amit}/services`, T.managerA, { ids: [S.Haircut, S.Beard, S['Hair Color'], S.Facial] })).status, 200);
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids: [S.Haircut] })).status, 200);
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.cashierA, { ids: [S.Haircut] })).status, 403);
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.Raj, { ids: [S.Haircut, S.Facial] })).status, 403); // a barber can't self-grant skills
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, undefined, { ids: [] })).status, 401);
  });
  it('replaces the set (empty clears it); duplicates are fine', async () => {
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids: [S.Haircut, S.Haircut] })).status, 200);
    assert.deepEqual((await call('GET', `/workers/${W.Raj}`, T.ownerA)).body.data.serviceIds, [S.Haircut]);
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids: [] })).body.data.serviceIds.length, 0);
    await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids: [S.Haircut] });
  });
  it('unknown, foreign or archived services are rejected and the failed request changes nothing', async () => {
    const bad = async (ids: string[]) => assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids })).status, 400, ids.join());
    await bad([S.haircutB]); await bad(['11111111-1111-4111-8111-111111111111']); await bad([S.Haircut, S.haircutB]);
    assert.equal((await call('PUT', `/workers/${W.Raj}/services`, T.ownerA, { ids: ['nope'] })).status, 400);
    assert.deepEqual((await call('GET', `/workers/${W.Raj}`, T.ownerA)).body.data.serviceIds, [S.Haircut]);
    const tmp = (await call('POST', '/services', T.ownerA, { name: 'Temp Svc', pricePaise: 100, durationMin: 10 })).body.data.id;
    await call('DELETE', `/services/${tmp}`, T.ownerA);
    await bad([tmp]);
  });
  it('can be edited from the service side too; services list shows who can do them', async () => {
    assert.equal((await call('PUT', `/services/${S.Facial}/workers`, T.ownerA, { ids: [W.Amit, W.Raj] })).status, 200);
    assert.deepEqual((await call('GET', `/workers/${W.Raj}`, T.ownerA)).body.data.serviceIds.sort(), [S.Haircut, S.Facial].sort());
    assert.deepEqual((await call('GET', `/services/${S.Facial}`, T.ownerA)).body.data.workerIds.sort(), [W.Amit, W.Raj].sort());
    assert.equal((await call('PUT', `/services/${S.Facial}/workers`, T.ownerA, { ids: [W.Amit] })).body.data.workerIds.length, 1);
    assert.equal((await call('PUT', `/services/${S.Facial}/workers`, T.ownerA, { ids: [W.Amit, W.Bhavin] })).status, 400); // other shop's worker
    assert.equal((await call('PUT', `/services/${S.Facial}/workers`, T.managerA, { ids: [W.Amit] })).status, 403);         // managers lack services.update
    assert.deepEqual((await call('GET', `/services/${S.Facial}`, T.ownerA)).body.data.workerIds, [W.Amit]);                 // failed call changed nothing
    assert.deepEqual((await call('GET', '/services', T.ownerA)).body.data.items.find((s: any) => s.name === 'Haircut').workerIds.sort(), [W.Rahul, W.Amit, W.Raj].sort());
  });
  it('archived workers cannot be mapped', async () => {
    const w = (await call('POST', '/workers', T.ownerA, { displayName: 'Gone Guy' })).body.data.id;
    await call('DELETE', `/workers/${w}`, T.ownerA);
    assert.equal((await call('PUT', `/workers/${w}/services`, T.ownerA, { ids: [S.Haircut] })).status, 409);
    assert.equal((await call('PUT', `/services/${S.Haircut}/workers`, T.ownerA, { ids: [w] })).status, 400);
  });
});

describe('4C: availability', () => {
  const put = (body: unknown, id = W.Rahul, t = T.ownerA) => call('PUT', `/workers/${id}/availability`, t, body);
  const d = (over: any) => days([1, 2, 3, 4, 5, 6]).map((x) => (x.weekday === 1 ? { ...x, ...over } : x));

  it('has no availability until set (a new worker is not bookable yet)', async () => {
    assert.deepEqual((await call('GET', `/workers/${W.Rahul}/availability`, T.ownerA)).body.data, { days: [], warnings: [] });
    assert.equal((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.hasAvailability, false);
  });
  it('rejects bad schedules', async () => {
    for (const body of [
      { days: days([1, 2]).slice(0, 6) },                                                                        // missing a day
      { days: d({ startTime: '21:00', endTime: '10:00' }) },                                                     // end before start
      { days: d({ startTime: '10:00', endTime: '10:00' }) },                                                     // zero length
      { days: d({ breakStart: '13:00' }) },                                                                      // one-sided break
      { days: d({ breakStart: '09:00', breakEnd: '11:00' }) },                                                   // break starts before work
      { days: d({ breakStart: '20:00', breakEnd: '22:00' }) },                                                   // break ends after work
      { days: d({ breakStart: '14:00', breakEnd: '13:00' }) },                                                   // break backwards
      { days: d({ startTime: '25:00', endTime: '26:00' }) },                                                     // invalid time
      { days: d({ isWorking: true, startTime: null, endTime: null }) },                                          // working without times
      { days: days([1]).map((x) => (x.weekday === 7 ? { weekday: 7, isWorking: false, startTime: '10:00' } : x)) }, // day off with times
      { days: days([1, 2, 3, 4, 5, 6]).map((x) => ({ ...x, weekday: 1 })) },                                     // duplicate weekday
      { useShopHours: false }, {}, { days: 'nope' },
    ]) assert.equal((await put(body)).status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.hasAvailability, false); // nothing was saved
  });
  it('saves an explicit schedule with a break; returns it exactly; is audited', async () => {
    const r = await put({ days: days([1, 2, 3, 4, 5, 6], '10:00', '21:00', ['13:00', '14:00']) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.days[0], { weekday: 1, isWorking: true, startTime: '10:00', endTime: '21:00', breakStart: '13:00', breakEnd: '14:00' });
    assert.deepEqual(r.body.data.days[6], { weekday: 7, isWorking: false, startTime: null, endTime: null, breakStart: null, breakEnd: null });
    assert.deepEqual(r.body.data.warnings, []);
    assert.equal((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.hasAvailability, true);
    const log = (await call('GET', `/audit-logs?action=worker.availability.update&entityId=${W.Rahul}`, T.ownerA)).body.data.items[0];
    assert.deepEqual(log.old_values, []); assert.equal(log.new_values[0].breakStart, '13:00');
  });
  it('re-saving REPLACES the schedule (no leftovers)', async () => {
    await put({ days: days([1, 2], '11:00', '18:00') });
    const g = (await call('GET', `/workers/${W.Rahul}/availability`, T.ownerA)).body.data.days;
    assert.equal(g.length, 7); assert.equal(g.filter((x: any) => x.isWorking).length, 2); assert.equal(g[0].breakStart, null);
    await put({ days: days([1, 2, 3, 4, 5, 6], '10:00', '21:00', ['13:00', '14:00']) });
  });
  it('"copy shop hours" copies once (not a live link); needs the shop hours to exist first', async () => {
    const r = await put({ useShopHours: true }, W.Raj);
    assert.equal(r.status, 200); assert.equal(r.body.data.days[0].startTime, '10:00'); assert.equal(r.body.data.days[6].isWorking, false);
    await call('PUT', '/shops/current/hours', T.ownerA, { hours: week('09:00', '22:00') });
    assert.equal((await call('GET', `/workers/${W.Raj}/availability`, T.ownerA)).body.data.days[0].startTime, '10:00'); // unchanged copy
    await call('PUT', '/shops/current/hours', T.ownerA, { hours: week() });
    const noHours = await call('POST', '/workers', T.ownerB, { displayName: 'Shop B Two' });
    const r2 = await put({ useShopHours: true }, noHours.body.data.id, T.ownerB);
    assert.equal(r2.status, 400); assert.match(r2.body.message, /business hours/);
  });
  it('warns (without blocking) when hours go beyond the shop hours or onto a closed day', async () => {
    const r = await put({ days: days([1, 7], '08:00', '22:00') }, W.Amit);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.warnings.sort((a: any, b: any) => a.weekday - b.weekday), [{ weekday: 1, issue: 'outside_shop_hours' }, { weekday: 7, issue: 'shop_closed' }]);
    assert.deepEqual((await put({ days: days([1, 2, 3, 4, 5], '12:00', '20:00') }, W.Amit)).body.data.warnings, []);
  });
  it('permissions: owner/manager can edit; cashier cannot; plain worker can only READ their own', async () => {
    assert.equal((await put({ useShopHours: true }, W.Raj, T.managerA)).status, 200);
    assert.equal((await put({ useShopHours: true }, W.Raj, T.cashierA)).status, 403);
    assert.equal((await put({ useShopHours: true }, W.Rahul, T.Rahul)).status, 403);       // worker role has no workers.update
    assert.equal((await call('GET', `/workers/${W.Rahul}/availability`, T.Rahul)).status, 200);
    assert.equal((await call('GET', `/workers/${W.Amit}/availability`, T.Rahul)).status, 404); // someone else's: hidden
    assert.equal((await call('GET', `/workers/${W.Rahul}/availability`, T.cashierA)).status, 403);
  });
  it('an archived worker cannot be rescheduled', async () => {
    const w = (await call('POST', '/workers', T.ownerA, { displayName: 'Left Shop' })).body.data.id;
    await call('DELETE', `/workers/${w}`, T.ownerA);
    assert.equal((await put({ useShopHours: true }, w)).status, 409);
  });
});

describe('4C: time off', () => {
  const add = (b: object, id = W.Raj, t = T.ownerA) => call('POST', `/workers/${id}/time-off`, t, b);
  it('adds, lists, and deletes', async () => {
    const ok = await add({ startAt: at(MON, '15:00'), endAt: at(MON, '18:00'), reason: 'Dentist' });
    assert.equal(ok.status, 201); ID.timeOff = ok.body.data.id;
    const l = await call('GET', `/workers/${W.Raj}/time-off?from=${encodeURIComponent('2030-01-01T00:00:00Z')}`, T.ownerA);
    assert.equal(l.body.data.length, 1); assert.equal(l.body.data[0].reason, 'Dentist'); assert.equal(new Date(l.body.data[0].startAt).toISOString(), new Date(at(MON, '15:00')).toISOString());
    assert.equal((await call('DELETE', `/workers/${W.Raj}/time-off/${ID.timeOff}`, T.ownerA)).status, 200);
    assert.equal((await call('DELETE', `/workers/${W.Raj}/time-off/${ID.timeOff}`, T.ownerA)).status, 404);
    assert.equal((await call('GET', `/workers/${W.Raj}/time-off?from=${encodeURIComponent('2030-01-01T00:00:00Z')}`, T.ownerA)).body.data.length, 0);
  });
  it('validates: end after start, mandatory UTC offset, max one year, valid dates', async () => {
    assert.equal((await add({ startAt: at(MON, '18:00'), endAt: at(MON, '15:00') })).status, 400);
    assert.equal((await add({ startAt: at(MON, '15:00'), endAt: at(MON, '15:00') })).status, 400);
    assert.equal((await add({ startAt: `${MON}T15:00:00`, endAt: `${MON}T18:00:00` })).status, 400);       // no offset => ambiguous => refused
    assert.equal((await add({ startAt: at(MON, '10:00'), endAt: '2032-01-01T00:00:00Z' })).status, 400);  // longer than a year
    assert.equal((await add({ startAt: '2030-02-31T10:00:00+05:30', endAt: '2030-03-01T10:00:00+05:30' })).status, 400);
    assert.equal((await add({ startAt: 'garbage', endAt: 'garbage' })).status, 400);
    assert.equal((await add({ startAt: at(MON, '10:00') })).status, 400);
    assert.equal((await add({ startAt: at(MON, '10:00'), endAt: at(MON, '11:00'), reason: 'x'.repeat(201) })).status, 400);
  });
  it('permissions and cross-worker safety', async () => {
    assert.equal((await add({ startAt: at(MON, '10:00'), endAt: at(MON, '11:00') }, W.Raj, T.cashierA)).status, 403);
    assert.equal((await add({ startAt: at(MON, '10:00'), endAt: at(MON, '11:00') }, W.Raj, T.Raj)).status, 403); // worker role: read-only
    const t = (await add({ startAt: at(MON, '10:00'), endAt: at(MON, '11:00') }, W.Raj, T.managerA)).body.data.id;
    assert.equal((await call('DELETE', `/workers/${W.Amit}/time-off/${t}`, T.ownerA)).status, 404);            // wrong worker
    assert.equal((await call('GET', `/workers/${W.Raj}/time-off`, T.Raj)).status, 200);                          // reading own is fine
    assert.equal((await call('GET', `/workers/${W.Amit}/time-off`, T.Raj)).status, 404);
    await call('DELETE', `/workers/${W.Raj}/time-off/${t}`, T.ownerA);
  });
});

describe('4C: OWN-SCOPE edit (a shop may let barbers manage their own schedule)', () => {
  it('a custom role with workers.update:own lets Amit edit ONLY his own availability/time off', async () => {
    const role = await call('POST', '/roles', T.ownerA, { name: 'Self Service', permissions: { 'workers.view': 'own', 'workers.update': 'own' } });
    assert.equal(role.status, 201);
    const amitUser = (await call('GET', `/workers/${W.Amit}`, T.ownerA)).body.data.userId;
    assert.equal((await call('PUT', `/users/${amitUser}/roles`, T.ownerA, { roleIds: [ID.roleWorker, role.body.data.id] })).status, 200);
    assert.equal((await call('PUT', `/workers/${W.Amit}/availability`, T.Amit, { days: days([1, 2, 3, 4, 5], '12:00', '20:00') })).status, 200);
    const off = await call('POST', `/workers/${W.Amit}/time-off`, T.Amit, { startAt: at('2030-02-01', '10:00'), endAt: at('2030-02-01', '12:00') });
    assert.equal(off.status, 201);
    assert.equal((await call('DELETE', `/workers/${W.Amit}/time-off/${off.body.data.id}`, T.Amit)).status, 200);
    // ...but nothing that belongs to someone else, and nothing that needs "all"
    assert.equal((await call('PUT', `/workers/${W.Raj}/availability`, T.Amit, { useShopHours: true })).status, 404);
    assert.equal((await call('POST', `/workers/${W.Raj}/time-off`, T.Amit, { startAt: at('2030-02-01', '10:00'), endAt: at('2030-02-01', '12:00') })).status, 404);
    assert.equal((await call('PUT', `/workers/${W.Amit}/services`, T.Amit, { ids: [S.Haircut] })).status, 403);
    assert.equal((await call('PATCH', `/workers/${W.Amit}`, T.Amit, { displayName: 'Boss Amit' })).status, 403);
    assert.equal((await call('DELETE', `/workers/${W.Amit}`, T.Amit)).status, 403);
    assert.equal((await call('PUT', `/users/${amitUser}/roles`, T.ownerA, { roleIds: [ID.roleWorker] })).status, 200); // back to normal
    assert.equal((await call('PUT', `/workers/${W.Amit}/availability`, T.Amit, { useShopHours: true })).status, 403);   // and edit rights are gone again
  });
});

describe('4C: TENANT ISOLATION', () => {
  it("Shop B cannot read or change Shop A's mapping, availability or time off (404)", async () => {
    for (const [m, p, b] of [['PUT', `/workers/${W.Rahul}/services`, { ids: [] }], ['GET', `/workers/${W.Rahul}/availability`], ['PUT', `/workers/${W.Rahul}/availability`, { useShopHours: true }],
      ['GET', `/workers/${W.Rahul}/time-off`], ['POST', `/workers/${W.Rahul}/time-off`, { startAt: at(MON, '10:00'), endAt: at(MON, '11:00') }],
      ['PUT', `/services/${S.Haircut}/workers`, { ids: [] }]] as any)
      assert.equal((await call(m, p, T.ownerB, b)).status, 404, `${m} ${p}`);
    assert.deepEqual((await call('GET', `/workers/${W.Rahul}`, T.ownerA)).body.data.serviceIds.sort(), [S.Haircut, S.Beard].sort());
  });
  it('mappings never cross shops, in either direction', async () => {
    assert.equal((await call('PUT', `/workers/${W.Bhavin}/services`, T.ownerB, { ids: [S.Haircut] })).status, 400);       // B worker, A service
    assert.equal((await call('PUT', `/workers/${W.Rahul}/services`, T.ownerA, { ids: [S.haircutB] })).status, 400);       // A worker, B service
    assert.equal((await call('PUT', `/workers/${W.Bhavin}/services`, T.ownerB, { ids: [S.haircutB] })).status, 200);
    assert.deepEqual((await call('GET', `/workers/${W.Bhavin}`, T.ownerB)).body.data.serviceIds, [S.haircutB]);
  });
});

describe('4C: DATABASE-LEVEL guarantees', () => {
  it('composite FKs make cross-shop mappings impossible even with owner-level SQL', async () => {
    await assert.rejects(h.ownerPool.query('INSERT INTO worker_services (worker_id, service_id, shop_id) VALUES ($1,$2,$3)', [W.Rahul, S.haircutB, ID.shopA]), /foreign key/);
    await assert.rejects(h.ownerPool.query('INSERT INTO worker_services (worker_id, service_id, shop_id) VALUES ($1,$2,$3)', [W.Bhavin, S.Haircut, ID.shopB]), /foreign key/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO worker_time_off (shop_id, worker_id, start_at, end_at) VALUES ($1,$2,now(),now()+interval '1 hour')`, [ID.shopB, W.Rahul]), /foreign key/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO worker_availability (worker_id, shop_id, weekday, is_working, start_time, end_time) VALUES ($1,$2,1,true,'10:00','18:00')`, [W.Bhavin, ID.shopA]), /foreign key/); // Shop B's worker claiming to be in Shop A
  });
  it('CHECK constraints hold without the API', async () => {
    await assert.rejects(h.ownerPool.query(`UPDATE worker_availability SET break_start='09:00', break_end='10:30' WHERE worker_id=$1 AND weekday=1`, [W.Rahul]), /worker_avail_chk/);
    await assert.rejects(h.ownerPool.query(`UPDATE worker_availability SET end_time='09:00' WHERE worker_id=$1 AND weekday=1`, [W.Rahul]), /worker_avail_chk/);
    await assert.rejects(h.ownerPool.query(`UPDATE worker_availability SET start_time='10:00' WHERE worker_id=$1 AND weekday=7`, [W.Rahul]), /worker_avail_chk/); // day off with times
    await assert.rejects(h.ownerPool.query(`INSERT INTO worker_availability (worker_id, shop_id, weekday, is_working) VALUES ($1,$2,9,false)`, [W.Rahul, ID.shopA]), /weekday/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO worker_time_off (shop_id, worker_id, start_at, end_at) VALUES ($1,$2,now(),now() - interval '1 hour')`, [ID.shopA, W.Rahul]), /worker_time_off_range_chk/);
  });
  it('RLS: no context sees nothing; a shop context sees only its own; the public sees none of it', async () => {
    const q = async (setup: [string, string][], sql: string) => {
      const c = await h.appPool.connect();
      try { await c.query('BEGIN'); for (const [k, v] of setup) await c.query('SELECT set_config($1,$2,true)', [k, v]); const r = (await c.query(sql)).rows[0].n; await c.query('ROLLBACK'); return r; } finally { c.release(); }
    };
    for (const t of ['worker_services', 'worker_availability', 'worker_time_off']) {
      assert.equal(await q([], `SELECT count(*)::int n FROM ${t}`), 0, `${t}: no context`);
      // schedules and time off are never public (worker_services is public-readable for active barbers/services since 4D; covered in eligibility.test.ts)
      if (t !== 'worker_services') assert.equal(await q([['app.public_read', 'on']], `SELECT count(*)::int n FROM ${t}`), 0, `${t}: public`);
      assert.equal(await q([['app.shop_id', ID.shopB]], `SELECT count(*)::int n FROM ${t} WHERE shop_id <> '${ID.shopB}'`), 0, `${t}: cross-shop`);
    }
    assert.ok((await q([['app.shop_id', ID.shopA]], 'SELECT count(*)::int n FROM worker_services')) >= 4);
  });
  it('audit trail covers mapping, availability and time off', async () => {
    const actions = new Set((await call('GET', '/audit-logs?limit=100', T.ownerA)).body.data.items.map((i: any) => i.action));
    for (const a of ['worker.services.update', 'service.workers.update', 'worker.availability.update', 'worker.timeoff.create', 'worker.timeoff.delete']) assert.ok(actions.has(a), a);
  });
});
