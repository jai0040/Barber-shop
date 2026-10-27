import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
  let ownerTokenB: string;
  let shopA: { id: string; slug: string };
  let shopB: { id: string; slug: string };

  const ownerA = { email: 'owner.a@example.com', password: 'OwnerPassword!1', name: 'Owner A' };
  const ownerB = { email: 'owner.b@example.com', password: 'OwnerPassword!1', name: 'Owner B' };

  before(async () => {
    h = await boot();

    // Seed platform admin
    await h.ownerPool.query(
      `INSERT INTO users (type, name, email, password_hash)
       VALUES ('platform', 'Platform Admin', 'plat@example.com', 'x')`
    );

    // Helper to onboard a shop with an owner
    const onboard = async (slug: string, name: string, u: typeof ownerA) => {
      const shopRes = await h.ownerPool.query(
        `INSERT INTO shops (name, slug, timezone, status)
         VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
        [name, slug]
      );
      const sid = shopRes.rows[0].id;

      // Copy role templates into shop
      const rolesRes = await h.ownerPool.query(
        `INSERT INTO roles (shop_id, name, is_system, system_key)
         VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker')
         RETURNING id, system_key`,
        [sid]
      );
      const ownerRoleId = rolesRes.rows.find((r) => r.system_key === 'owner').id;

      const userRes = await h.ownerPool.query(
        `INSERT INTO users (type, name, email, password_hash, shop_id)
         VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
        [u.name, u.email, sid]
      );
      const uid = userRes.rows[0].id;
      await h.ownerPool.query(
        `INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`,
        [uid, sid, ownerRoleId]
      );

      await h.ownerPool.query(
        `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
        [ownerRoleId, sid]
      );

      // Set business hours for shop: Monday (weekday=1) 10:00 to 20:00
      await h.ownerPool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         VALUES ($1, 1, false, '10:00'::time, '20:00'::time)`,
        [sid]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({
        id: uid,
        type: 'staff',
        name: u.name,
        shop_id: sid,
      } as any);

      return { shop: shopRes.rows[0], token };
    };

    const resA = await onboard('classic-barber', 'Classic Barber Shop', ownerA);
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('royal-barber', 'Royal Barber Shop', ownerB);
    shopB = resB.shop;
    ownerTokenB = resB.token;
  });

  after(async () => {
    await h.close();
  });

  describe('Service Categories', () => {
    let catId: string;

    it('creates a service category and prevents duplicates in the same shop', async () => {
      const res = await h.call('POST', '/services/categories', {
        token: ownerTokenA,
        body: { name: 'Hair Services', displayOrder: 1 },
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Hair Services');
      catId = res.body.data.id;

      // Duplicate in same shop should return 409
      const dup = await h.call('POST', '/services/categories', {
        token: ownerTokenA,
        body: { name: 'Hair Services' },
      });
      assert.equal(dup.status, 409);

      // Same category name in Shop B is allowed
      const shopBCat = await h.call('POST', '/services/categories', {
        token: ownerTokenB,
        body: { name: 'Hair Services' },
      });
      assert.equal(shopBCat.status, 201);
    });

    it('lists and updates categories', async () => {
      const list = await h.call('GET', '/services/categories', { token: ownerTokenA });
      assert.equal(list.status, 200);
      assert.equal(list.body.data.length, 1);

      const upd = await h.call('PATCH', `/services/categories/${catId}`, {
        token: ownerTokenA,
        body: { displayOrder: 2 },
      });
      assert.equal(upd.status, 200);
      assert.equal(upd.body.data.displayOrder, 2);
    });
  });

  describe('Services CRUD & Price Snapshots', () => {
    let haircutId: string;
    let beardId: string;
    let hairSpaId: string;

    it('creates services with price in paise and duration', async () => {
      // Haircut ₹300 (30000 paise), 30 mins
      const res1 = await h.call('POST', '/services', {
        token: ownerTokenA,
        body: { name: 'Haircut', pricePaise: 30000, durationMinutes: 30 },
      });
      assert.equal(res1.status, 201);
      assert.equal(res1.body.data.pricePaise, 30000);
      haircutId = res1.body.data.id;

      // Beard ₹150 (15000 paise), 20 mins
      const res2 = await h.call('POST', '/services', {
        token: ownerTokenA,
        body: { name: 'Beard Trim', pricePaise: 15000, durationMinutes: 20 },
      });
      assert.equal(res2.status, 201);
      beardId = res2.body.data.id;

      // Hair Spa ₹600 (60000 paise), 60 mins
      const res3 = await h.call('POST', '/services', {
        token: ownerTokenA,
        body: { name: 'Hair Spa', pricePaise: 60000, durationMinutes: 60 },
      });
      assert.equal(res3.status, 201);
      hairSpaId = res3.body.data.id;
    });

    it('validates price and duration bounds', async () => {
      const neg = await h.call('POST', '/services', {
        token: ownerTokenA,
        body: { name: 'Invalid', pricePaise: -100, durationMinutes: 30 },
      });
      assert.equal(neg.status, 400);

      const shortDur = await h.call('POST', '/services', {
        token: ownerTokenA,
        body: { name: 'Too short', pricePaise: 1000, durationMinutes: 2 },
      });
      assert.equal(shortDur.status, 400);
    });

    it('lists services and isolates from other shops', async () => {
      const listA = await h.call('GET', '/services', { token: ownerTokenA });
      assert.equal(listA.status, 200);
      assert.equal(listA.body.data.length, 3);

      // Shop B currently has 0 services
      const listB = await h.call('GET', '/services', { token: ownerTokenB });
      assert.equal(listB.status, 200);
      assert.equal(listB.body.data.length, 0);

      // Shop B cannot access Shop A's service
      const cross = await h.call('GET', `/services/${haircutId}`, { token: ownerTokenB });
      assert.equal(cross.status, 404);
    });

    it('exposes active services publicly via slug', async () => {
      const pub = await h.call('GET', `/services/public/${shopA.slug}`);
      assert.equal(pub.status, 200);
      assert.equal(pub.body.data.services.length, 3);
    });
  });

  describe('Workers & Service Capabilities', () => {
    let rahulId: string;
    let amitId: string;
    let haircutId: string;
    let beardId: string;
    let hairSpaId: string;

    before(async () => {
      const svcs = (await h.call('GET', '/services', { token: ownerTokenA })).body.data;
      haircutId = svcs.find((s: any) => s.name === 'Haircut').id;
      beardId = svcs.find((s: any) => s.name === 'Beard Trim').id;
      hairSpaId = svcs.find((s: any) => s.name === 'Hair Spa').id;
    });

    it('creates workers and provisions staff user accounts', async () => {
      // Create Rahul
      const res1 = await h.call('POST', '/workers', {
        token: ownerTokenA,
        body: {
          displayName: 'Rahul',
          phone: '+919876543210',
          serviceIds: [haircutId, beardId], // Rahul: Haircut + Beard (NO Hair Spa)
        },
      });
      assert.equal(res1.status, 201);
      assert.equal(res1.body.data.displayName, 'Rahul');
      assert.deepEqual(res1.body.data.services.sort(), [haircutId, beardId].sort());
      rahulId = res1.body.data.id;

      // Create Amit
      const res2 = await h.call('POST', '/workers', {
        token: ownerTokenA,
        body: {
          displayName: 'Amit',
          phone: '+919876543211',
          serviceIds: [haircutId, beardId, hairSpaId], // Amit: Haircut + Beard + Hair Spa
        },
      });
      assert.equal(res2.status, 201);
      assert.equal(res2.body.data.displayName, 'Amit');
      amitId = res2.body.data.id;
    });

    it('configures worker schedules and break windows', async () => {
      // Rahul schedule: Monday (1) 10:00 to 18:00, lunch break 13:00 to 14:00
      const schedRahul = await h.call('PUT', `/workers/${rahulId}/schedule`, {
        token: ownerTokenA,
        body: {
          schedule: [{ weekday: 1, isWorking: true, startTime: '10:00', endTime: '18:00' }],
          breaks: [{ weekday: 1, startTime: '13:00', endTime: '14:00', label: 'Lunch' }],
        },
      });
      assert.equal(schedRahul.status, 200);
      assert.equal(schedRahul.body.data.schedule.length, 1);
      assert.equal(schedRahul.body.data.breaks.length, 1);

      // Amit schedule: Monday (1) 12:00 to 20:00, break 16:00 to 17:00
      const schedAmit = await h.call('PUT', `/workers/${amitId}/schedule`, {
        token: ownerTokenA,
        body: {
          schedule: [{ weekday: 1, isWorking: true, startTime: '12:00', endTime: '20:00' }],
          breaks: [{ weekday: 1, startTime: '16:00', endTime: '17:00', label: 'Tea' }],
        },
      });
      assert.equal(schedAmit.status, 200);
    });

    it('Shop B cannot view or modify Shop A workers', async () => {
      const cross = await h.call('GET', `/workers/${rahulId}`, { token: ownerTokenB });
      assert.equal(cross.status, 404);

      const crossPut = await h.call('PUT', `/workers/${rahulId}/services`, {
        token: ownerTokenB,
        body: { serviceIds: [] },
      });
      assert.equal(crossPut.status, 404);
    });
  });

  describe('Slot Calculation Engine (Rules 9, 13, 14, 47, 75)', () => {
    let rahulId: string;
    let amitId: string;
    let haircutId: string;
    let beardId: string;
    let hairSpaId: string;

    // Pick next Monday
    const getNextMondayStr = (): string => {
      const d = new Date();
      const day = d.getUTCDay();
      const diff = (8 - day) % 7 || 7;
      const nextMon = new Date(d.getTime() + diff * 86400000);
      return nextMon.toISOString().slice(0, 10);
    };

    before(async () => {
      const svcs = (await h.call('GET', '/services', { token: ownerTokenA })).body.data;
      haircutId = svcs.find((s: any) => s.name === 'Haircut').id;
      beardId = svcs.find((s: any) => s.name === 'Beard Trim').id;
      hairSpaId = svcs.find((s: any) => s.name === 'Hair Spa').id;

      const workers = (await h.call('GET', '/workers', { token: ownerTokenA })).body.data;
      rahulId = workers.find((w: any) => w.displayName === 'Rahul').id;
      amitId = workers.find((w: any) => w.displayName === 'Amit').id;
    });

    it('returns empty slots if selected worker cannot perform requested service', async () => {
      const mondayStr = getNextMondayStr();
      // Rahul cannot perform Hair Spa
      const res = await h.call('GET', `/appointments/public/${shopA.slug}/slots?date=${mondayStr}&serviceIds=${hairSpaId}&workerId=${rahulId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.slots.length, 0);
    });

    it('calculates slots specifically for eligible barber, respecting shift and breaks', async () => {
      const mondayStr = getNextMondayStr();
      // Amit CAN perform Hair Spa (60 mins), working 12:00 to 20:00 with break 16:00-17:00
      const res = await h.call('GET', `/appointments/public/${shopA.slug}/slots?date=${mondayStr}&serviceIds=${hairSpaId}&workerId=${amitId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalDurationMinutes, 60);

      const slots = res.body.data.slots;
      assert.ok(slots.length > 0);

      // Earliest slot should be 12:00
      assert.equal(slots[0].time, '12:00');

      // Break is 16:00 to 17:00. A 60-min service starting at 15:15 would end at 16:15 (overlap with break).
      // So slots starting at 15:15, 15:30, 15:45, 16:00, 16:15, 16:30, 16:45 must NOT exist!
      const times = slots.map((s: any) => s.time);
      assert.ok(!times.includes('15:15'));
      assert.ok(!times.includes('15:30'));
      assert.ok(!times.includes('15:45'));
      assert.ok(!times.includes('16:00'));
      assert.ok(!times.includes('16:30'));

      // 17:00 should be available (17:00 - 18:00)
      assert.ok(times.includes('17:00'));

      // Latest slot: shift ends 20:00, so latest 60-min slot is 19:00
      assert.equal(slots[slots.length - 1].time, '19:00');
    });

    it('calculates slots for "Any Available Barber" (aggregating all capable workers)', async () => {
      const mondayStr = getNextMondayStr();
      // Both Rahul and Amit can perform Haircut (30 mins)
      const res = await h.call('GET', `/appointments/public/${shopA.slug}/slots?date=${mondayStr}&serviceIds=${haircutId}&workerId=any`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.totalDurationMinutes, 30);

      const slots = res.body.data.slots;
      assert.ok(slots.length > 0);

      // At 10:00 only Rahul is working (Rahul shift 10:00-18:00, Amit starts at 12:00)
      const slot1000 = slots.find((s: any) => s.time === '10:00');
      assert.ok(slot1000);
      assert.equal(slot1000.availableWorkers.length, 1);
      assert.equal(slot1000.availableWorkers[0].displayName, 'Rahul');

      // At 12:30 BOTH Rahul and Amit are working and free
      const slot1230 = slots.find((s: any) => s.time === '12:30');
      assert.ok(slot1230);
      assert.equal(slot1230.availableWorkers.length, 2);

      // At 13:00 Rahul has lunch break, so only Amit should be listed!
      const slot1300 = slots.find((s: any) => s.time === '13:00');
      assert.ok(slot1300);
      assert.equal(slot1300.availableWorkers.length, 1);
      assert.equal(slot1300.availableWorkers[0].displayName, 'Amit');

      // At 18:30 Rahul has finished shift (ends 18:00), so only Amit should be listed
      const slot1830 = slots.find((s: any) => s.time === '18:30');
      assert.ok(slot1830);
      assert.equal(slot1830.availableWorkers.length, 1);
      assert.equal(slot1830.availableWorkers[0].displayName, 'Amit');
    });

    it('rejects booking in the past or beyond advance booking window', async () => {
      const past = await h.call('GET', `/appointments/public/${shopA.slug}/slots?date=2020-01-01&serviceIds=${haircutId}`);
      assert.equal(past.status, 400);

      const future = await h.call('GET', `/appointments/public/${shopA.slug}/slots?date=2030-01-01&serviceIds=${haircutId}`);
      assert.equal(future.status, 400);
    });
  });
