import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { boot, Harness } from './harness';

let h: Harness;
const pw = 'Passw0rd!x';
const T: Record<string, string> = {}, ID: Record<string, string> = {}, W: Record<string, string> = {}, S: Record<string, string> = {}, C: Record<string, string> = {};
const login = async (i: string) => (await h.call('POST', '/auth/login', { body: { identifier: i, password: pw } })).body.data.accessToken as string;
const call = (m: string, p: string, token?: string, body?: unknown) => h.call(m, p, { token, body });
const at = (t: string, d = '2030-01-07') => `${d}T${t}:00+05:30`;
const EXCL = (e: any) => e?.code === '23P01' && /appointments_no_overlap/.test(e.message);

/** Inserts an appointment with owner-level SQL (bypasses RLS on purpose: these tests probe the CONSTRAINTS). */
const ins = (o: { shop?: string; customer?: string; worker?: string | null; start: string; end: string; status?: string; source?: string; from?: string | null; pool?: Pool }) =>
  (o.pool ?? h.ownerPool).query(
    `INSERT INTO appointments (shop_id, customer_id, worker_id, start_at, end_at, status, source, rescheduled_from_id, cancelled_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6 = 'cancelled' THEN now() END) RETURNING id`,
    [o.shop ?? ID.shopA, o.customer ?? C.jay, o.worker === undefined ? W.Rahul : o.worker, o.start, o.end, o.status ?? 'booked', o.source ?? 'admin', o.from ?? null]).then((r) => r.rows[0].id as string);

before(async () => {
  h = await boot();
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Platform Admin', email: 'root@platform.test', password: pw });
  T.platform = await login('root@platform.test');
  for (const [k, name, slug, phone] of [['A', 'Classic Barber Shop', 'classic', '9000000001'], ['B', 'Sharp Cuts', 'sharp', '9000000002']]) {
    const r = await call('POST', '/platform/shops', T.platform, { name, slug, owner: { name: name + ' Owner', phone, password: pw } });
    ID['shop' + k] = r.body.data.id; T['owner' + k] = await login(phone);
  }
  for (const n of ['Rahul', 'Amit']) W[n] = (await call('POST', '/workers', T.ownerA, { displayName: n })).body.data.id;
  W.Bhavin = (await call('POST', '/workers', T.ownerB, { displayName: 'Bhavin' })).body.data.id;
  S.haircut = (await call('POST', '/services', T.ownerA, { name: 'Haircut', pricePaise: 30000, durationMin: 30 })).body.data.id;
  S.beard = (await call('POST', '/services', T.ownerA, { name: 'Beard', pricePaise: 15000, durationMin: 15 })).body.data.id;
  S.haircutB = (await call('POST', '/services', T.ownerB, { name: 'Haircut', pricePaise: 25000, durationMin: 25 })).body.data.id;
  C.jay = (await call('POST', '/customers', T.ownerA, { name: 'Jay Patel', phone: '9876543210' })).body.data.id;
  C.maya = (await call('POST', '/customers', T.ownerA, { name: 'Maya Shah', phone: '9811111111' })).body.data.id;
  C.bob = (await call('POST', '/customers', T.ownerB, { name: 'Bob Sharp', phone: '9822222222' })).body.data.id;
});
after(() => h?.close());

describe('6A: the double-booking guarantee (PostgreSQL exclusion constraint)', () => {
  it('rejects an overlapping ACTIVE appointment for the same worker (any overlap shape)', async () => {
    await ins({ start: at('10:00'), end: at('10:30') });
    for (const [s, e, why] of [['10:00', '10:30', 'identical'], ['10:15', '10:45', 'starts inside'], ['09:45', '10:15', 'ends inside'], ['09:00', '11:00', 'swallows it'], ['10:10', '10:20', 'inside it']])
      await assert.rejects(ins({ start: at(s), end: at(e), customer: C.maya }), EXCL, why);
  });
  it('allows back-to-back (end == next start) and a different worker at the same time', async () => {
    await ins({ start: at('10:30'), end: at('11:00'), customer: C.maya });          // starts exactly when the first ends
    await ins({ start: at('09:30'), end: at('10:00'), customer: C.maya });          // ends exactly when the first starts
    await ins({ start: at('10:00'), end: at('10:30'), worker: W.Amit });            // another barber, same time
  });
  it('applies to every active status, and only to active ones', async () => {
    for (const st of ['confirmed', 'checked_in', 'in_service']) {
      const id = await ins({ start: at('13:00'), end: at('13:30'), customer: C.maya });
      await h.ownerPool.query('UPDATE appointments SET status=$2 WHERE id=$1', [id, st]);
      await assert.rejects(ins({ start: at('13:10'), end: at('13:20') }), EXCL, st);
      await h.ownerPool.query(`UPDATE appointments SET status='completed' WHERE id=$1`, [id]); // frees the slot for the next loop turn
    }
    for (const st of ['completed', 'no_show', 'rescheduled'])
      await ins({ start: at('15:00'), end: at('15:30'), status: st, customer: C.maya });          // inactive rows never block (and never block each other)
    await ins({ start: at('15:00'), end: at('15:30'), status: 'cancelled' });
    await ins({ start: at('15:00'), end: at('15:30') });                                          // a fresh booking in a slot full of inactive history is fine
  });
  it('re-activating a cancelled appointment into a slot that has since been re-booked is rejected', async () => {
    const old = await ins({ start: at('16:00'), end: at('16:30'), status: 'cancelled' });
    await ins({ start: at('16:00'), end: at('16:30'), customer: C.maya });
    await assert.rejects(h.ownerPool.query(`UPDATE appointments SET status='booked' WHERE id=$1`, [old]), EXCL);
  });
  it('moving or EXTENDING an appointment into someone else\'s time is rejected; into free time is fine', async () => {
    const a = await ins({ start: at('17:00'), end: at('17:30') }); await ins({ start: at('17:30'), end: at('18:00'), customer: C.maya });
    await assert.rejects(h.ownerPool.query('UPDATE appointments SET end_at=$2 WHERE id=$1', [a, at('17:45')]), EXCL); // an add-on that runs into the next customer
    await assert.rejects(h.ownerPool.query('UPDATE appointments SET start_at=$2, end_at=$3 WHERE id=$1', [a, at('17:45'), at('18:15')]), EXCL);
    await h.ownerPool.query('UPDATE appointments SET start_at=$2, end_at=$3 WHERE id=$1', [a, at('16:45'), at('17:30')]);   // wait: 16:00-16:30 booked above, 16:45 is free
    await h.ownerPool.query('UPDATE appointments SET end_at=$2 WHERE id=$1', [a, at('17:30')]);
  });
  it('UNASSIGNED appointments never conflict with anything or each other (admin assigns later)', async () => {
    for (let i = 0; i < 3; i++) await ins({ start: at('10:00'), end: at('10:30'), worker: null, customer: C.maya });
    const u = await ins({ start: at('10:00'), end: at('10:30'), worker: null });
    await assert.rejects(h.ownerPool.query('UPDATE appointments SET worker_id=$2 WHERE id=$1', [u, W.Rahul]), EXCL); // ASSIGNING into a taken slot is refused
    await h.ownerPool.query('UPDATE appointments SET worker_id=$2, start_at=$3, end_at=$4 WHERE id=$1', [u, W.Rahul, at('19:00'), at('19:30')]); // free slot: ok
  });
  it('a rescheduled appointment is a NEW row linked to the old one; the old row frees the slot', async () => {
    const old = await ins({ start: at('20:00'), end: at('20:30') });
    await assert.rejects(ins({ start: at('20:00'), end: at('20:30'), customer: C.maya, from: old }), EXCL);   // slot still held by the old one
    await h.ownerPool.query(`UPDATE appointments SET status='rescheduled' WHERE id=$1`, [old]);
    const next = await ins({ start: at('20:00'), end: at('20:30'), from: old });
    assert.equal((await h.ownerPool.query('SELECT rescheduled_from_id FROM appointments WHERE id=$1', [next])).rows[0].rescheduled_from_id, old);
  });
});

describe('6A: concurrency (the reason this lives in the database)', () => {
  it('10 simultaneous bookings for the same slot: exactly ONE succeeds', async () => {
    const pool = new Pool({ connectionString: h.ownerUrl, max: 10 });
    try {
      const res = await Promise.allSettled(Array.from({ length: 10 }, () => ins({ start: at('11:00', '2030-01-08'), end: at('11:30', '2030-01-08'), customer: C.maya, pool })));
      assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(res.filter((r) => r.status === 'rejected' && EXCL(r.reason)).length, 9);
    } finally { await pool.end(); }
  });
  it('a second booking WAITS for the first transaction: commit => second fails; rollback => second succeeds', async () => {
    const pool = new Pool({ connectionString: h.ownerUrl, max: 4 });
    try {
      for (const outcome of ['COMMIT', 'ROLLBACK']) {
        const day = outcome === 'COMMIT' ? '2030-01-09' : '2030-01-10';
        const a = await pool.connect();
        await a.query('BEGIN');
        await a.query(`INSERT INTO appointments (shop_id, customer_id, worker_id, start_at, end_at, source) VALUES ($1,$2,$3,$4,$5,'admin')`, [ID.shopA, C.jay, W.Rahul, at('12:00', day), at('12:30', day)]);
        const second = ins({ start: at('12:00', day), end: at('12:30', day), customer: C.maya, pool }); // blocks on the uncommitted row
        let settled = false; second.then(() => (settled = true), () => (settled = true));
        await new Promise((r) => setTimeout(r, 300));
        assert.equal(settled, false, 'second insert must wait while the first is uncommitted');
        await a.query(outcome); a.release();
        if (outcome === 'COMMIT') await assert.rejects(second, EXCL); else assert.ok(await second);
      }
    } finally { await pool.end(); }
  });
});

describe('6A: tenant integrity (composite foreign keys)', () => {
  it("an appointment cannot use another shop's worker, customer or service, even with owner-level SQL", async () => {
    await assert.rejects(ins({ start: at('08:00'), end: at('08:30'), worker: W.Bhavin }), /foreign key/);               // Shop B barber in a Shop A appointment
    await assert.rejects(ins({ start: at('08:00'), end: at('08:30'), customer: C.bob }), /foreign key/);                // Shop B customer
    const id = await ins({ start: at('08:00'), end: at('08:30') });
    await assert.rejects(h.ownerPool.query(`INSERT INTO appointment_services (appointment_id, shop_id, service_id, name_snapshot, price_paise, duration_min) VALUES ($1,$2,$3,'Haircut',100,30)`, [id, ID.shopA, S.haircutB]), /foreign key/);
    await assert.rejects(h.ownerPool.query(`INSERT INTO appointment_status_history (appointment_id, shop_id, to_status) VALUES ($1,$2,'booked')`, [id, ID.shopB]), /foreign key/);
    await assert.rejects(ins({ start: at('08:00'), end: at('08:30'), shop: ID.shopB, customer: C.bob, worker: W.Bhavin, from: id }), /foreign key/); // reschedule link across shops
  });
});

describe('6A: price/duration SNAPSHOTS are immutable (price-history rule)', () => {
  let appt: string, snap: string;
  it('a later catalog price change does not touch an existing appointment; new appointments get the new price', async () => {
    appt = await ins({ start: at('09:00', '2030-01-11'), end: at('09:30', '2030-01-11') });
    const copy = (a: string) => h.ownerPool.query(
      `INSERT INTO appointment_services (appointment_id, shop_id, service_id, name_snapshot, price_paise, duration_min, sort_order)
       SELECT $1, shop_id, id, name, price_paise, duration_min, 0 FROM services WHERE id=$2 RETURNING id`, [a, S.haircut]).then((r) => r.rows[0].id as string);
    snap = await copy(appt);
    assert.equal((await call('PATCH', `/services/${S.haircut}`, T.ownerA, { pricePaise: 35000, durationMin: 40 })).status, 200); // ₹300 -> ₹350
    const old = (await h.ownerPool.query('SELECT price_paise, duration_min FROM appointment_services WHERE id=$1', [snap])).rows[0];
    assert.deepEqual(old, { price_paise: 30000, duration_min: 30 });
    const appt2 = await ins({ start: at('09:00', '2030-01-12'), end: at('09:40', '2030-01-12') });
    const snap2 = await copy(appt2);
    assert.deepEqual((await h.ownerPool.query('SELECT price_paise, duration_min FROM appointment_services WHERE id=$1', [snap2])).rows[0], { price_paise: 35000, duration_min: 40 });
    await call('PATCH', `/services/${S.haircut}`, T.ownerA, { pricePaise: 30000, durationMin: 30 });
  });
  it('the snapshot columns cannot be edited, even by the database owner; only removed_at can', async () => {
    for (const [col, val] of [['price_paise', 1], ['duration_min', 99], ['name_snapshot', "'Hacked'"], ['is_addon', true]] as [string, string | number | boolean][])
      await assert.rejects(h.ownerPool.query(`UPDATE appointment_services SET ${col} = ${val} WHERE id=$1`, [snap]), /immutable/, col);
    await assert.rejects(h.ownerPool.query('UPDATE appointment_services SET service_id=$2 WHERE id=$1', [snap, S.beard]), /immutable/);
    await h.ownerPool.query('UPDATE appointment_services SET removed_at = now() WHERE id=$1', [snap]); // soft-remove is allowed
    assert.equal((await h.ownerPool.query('SELECT price_paise FROM appointment_services WHERE id=$1', [snap])).rows[0].price_paise, 30000);
  });
  it('an add-on is just another snapshot row on the SAME appointment (no duplicate appointment)', async () => {
    const id = await ins({ start: at('09:00', '2030-01-13'), end: at('09:30', '2030-01-13') });
    await h.ownerPool.query(`INSERT INTO appointment_services (appointment_id, shop_id, service_id, name_snapshot, price_paise, duration_min) VALUES ($1,$2,$3,'Haircut',30000,30)`, [id, ID.shopA, S.haircut]);
    await h.ownerPool.query(`INSERT INTO appointment_services (appointment_id, shop_id, service_id, name_snapshot, price_paise, duration_min, is_addon) VALUES ($1,$2,$3,'Beard',15000,15,true)`, [id, ID.shopA, S.beard]);
    const t = (await h.ownerPool.query('SELECT sum(price_paise)::int p, sum(duration_min)::int d, count(*)::int n FROM appointment_services WHERE appointment_id=$1 AND removed_at IS NULL', [id])).rows[0];
    assert.deepEqual(t, { p: 45000, d: 45, n: 2 }); // Haircut ₹300 + Beard ₹150 = ₹450, one appointment
  });
});

describe('6A: CHECK constraints hold without the API', () => {
  it('time range, status, source, cancelled needs a timestamp, snapshot bounds', async () => {
    const bad = (sql: string, params: unknown[], re: RegExp) => assert.rejects(h.ownerPool.query(sql, params), re);
    const base = `INSERT INTO appointments (shop_id, customer_id, worker_id, start_at, end_at, status, source) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    await bad(base, [ID.shopA, C.jay, W.Amit, at('09:00'), at('09:00'), 'booked', 'admin'], /appointments_time_chk/);
    await bad(base, [ID.shopA, C.jay, W.Amit, at('10:00'), at('09:00'), 'booked', 'admin'], /appointments_time_chk/);
    await bad(base, [ID.shopA, C.jay, W.Amit, at('09:00'), at('09:30'), 'weird', 'admin'], /status/);
    await bad(base, [ID.shopA, C.jay, W.Amit, at('09:00'), at('09:30'), 'booked', 'telepathy'], /source/);
    await bad(base, [ID.shopA, C.jay, W.Amit, at('09:00'), at('09:30'), 'cancelled', 'admin'], /appointments_cancelled_chk/);
    const id = await ins({ start: at('06:00', '2030-01-14'), end: at('06:30', '2030-01-14') });
    const svc = `INSERT INTO appointment_services (appointment_id, shop_id, service_id, name_snapshot, price_paise, duration_min) VALUES ($1,$2,$3,'Haircut',$4,$5)`;
    await bad(svc, [id, ID.shopA, S.haircut, -1, 30], /price_paise/); await bad(svc, [id, ID.shopA, S.haircut, 100, 0], /duration_min/);
    await bad(`INSERT INTO appointment_status_history (appointment_id, shop_id, to_status) VALUES ($1,$2,'flying')`, [id, ID.shopA], /to_status/);
  });
  it('instants are stored as absolute UTC time (shop-local 11:00 IST == 05:30Z)', async () => {
    const id = await ins({ start: at('11:00', '2030-02-01'), end: at('11:30', '2030-02-01') });
    const r = (await h.ownerPool.query(`SELECT to_char(start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI"Z"') s FROM appointments WHERE id=$1`, [id])).rows[0].s;
    assert.equal(r, '2030-02-01T05:30Z');
  });
});

describe('6A: application role, RLS and append-only history', () => {
  const asApp = async (shop: string | null, fn: (c: any) => Promise<void>, extra: [string, string][] = []) => {
    const c = await h.appPool.connect();
    try { await c.query('BEGIN'); if (shop) await c.query(`SELECT set_config('app.shop_id',$1,true)`, [shop]); for (const [k, v] of extra) await c.query('SELECT set_config($1,$2,true)', [k, v]); await fn(c); } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
  };
  it('the app can create and update appointments inside its shop context, but can NEVER delete appointments or their services', async () => {
    await asApp(ID.shopA, async (c) => {
      const id = (await c.query(`INSERT INTO appointments (shop_id, customer_id, worker_id, start_at, end_at, source) VALUES ($1,$2,$3,$4,$5,'online') RETURNING id`, [ID.shopA, C.jay, W.Amit, at('05:00', '2030-03-01'), at('05:30', '2030-03-01')])).rows[0].id;
      assert.equal((await c.query(`UPDATE appointments SET notes='ok' WHERE id=$1`, [id])).rowCount, 1);
      await c.query(`INSERT INTO appointment_status_history (appointment_id, shop_id, to_status) VALUES ($1,$2,'booked')`, [id, ID.shopA]);
    });
    for (const sql of ['DELETE FROM appointments', 'DELETE FROM appointment_services'])
      await asApp(ID.shopA, async (c) => { await assert.rejects(c.query(sql), /permission denied/, sql); });
  });
  it('status history is append-only for the app role (no UPDATE, no DELETE)', async () => {
    await asApp(ID.shopA, async (c) => { await assert.rejects(c.query(`UPDATE appointment_status_history SET note='x'`), /permission denied/); });
    await asApp(ID.shopA, async (c) => { await assert.rejects(c.query('DELETE FROM appointment_status_history'), /permission denied/); });
  });
  it('RLS: no context sees nothing; Shop B sees none of Shop A; the public sees none; writes cannot target another shop', async () => {
    for (const t of ['appointments', 'appointment_services', 'appointment_status_history']) {
      await asApp(null, async (c) => assert.equal((await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n, 0, `${t}: no context`));
      await asApp(null, async (c) => assert.equal((await c.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n, 0, `${t}: public`), [['app.public_read', 'on']]);
      await asApp(ID.shopB, async (c) => assert.equal((await c.query(`SELECT count(*)::int n FROM ${t} WHERE shop_id <> $1`, [ID.shopB])).rows[0].n, 0, `${t}: cross-shop`));
    }
    await asApp(ID.shopA, async (c) => assert.ok((await c.query('SELECT count(*)::int n FROM appointments')).rows[0].n > 10));
    await asApp(ID.shopA, async (c) => {
      await assert.rejects(c.query(`INSERT INTO appointments (shop_id, customer_id, worker_id, start_at, end_at, source) VALUES ($1,$2,$3,$4,$5,'admin')`, [ID.shopB, C.bob, W.Bhavin, at('05:00', '2030-03-02'), at('05:30', '2030-03-02')]), /row-level security/);
    });
  });
});
