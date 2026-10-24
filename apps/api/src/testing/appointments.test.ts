import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let workerTokenRahul: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let rahulId: string;
let amitId: string;
let haircutId: string;
let beardId: string;


  const getNextMondayStr = (): string => {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = (8 - day) % 7 || 7;
    const nextMon = new Date(d.getTime() + diff * 86400000);
    return nextMon.toISOString().slice(0, 10);
  };

  before(async () => {
    h = await boot(25436);

    const onboard = async (slug: string, name: string, email: string) => {
      const s = (await h.ownerPool.query(
        `INSERT INTO shops (name, slug, timezone, status) VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
        [name, slug]
      )).rows[0];

      const r = (await h.ownerPool.query(
        `INSERT INTO roles (shop_id, name, is_system, system_key)
         VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
        [s.id]
      )).rows;
      const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

      const u = (await h.ownerPool.query(
        `INSERT INTO users (type, name, email, password_hash, shop_id)
         VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
        [name + ' Owner', email, s.id]
      )).rows[0];

      await h.ownerPool.query(
        `INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`,
        [u.id, s.id, ownerRoleId]
      );

      // Business hours: Monday 10:00 to 20:00
      await h.ownerPool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time)
         VALUES ($1, 1, false, '10:00'::time, '20:00'::time)`,
        [s.id]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('classic-barber', 'Classic Barber', 'owner.a@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('royal-barber', 'Royal Barber', 'owner.b@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create services in Shop A: Haircut ₹300 (30000 paise, 30m), Beard ₹150 (15000 paise, 20m)
    const s1 = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Haircut', pricePaise: 30000, durationMinutes: 30 },
    });
    haircutId = s1.body.data.id;

    const s2 = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Beard Trim', pricePaise: 15000, durationMinutes: 20 },
    });
    beardId = s2.body.data.id;

    // Create workers Rahul and Amit
    const w1 = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: { displayName: 'Rahul', phone: '+919876543101', email: 'rahul@classic.com', serviceIds: [haircutId, beardId] },
    });
    rahulId = w1.body.data.id;

    const w2 = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: { displayName: 'Amit', phone: '+919876543102', email: 'amit@classic.com', serviceIds: [haircutId, beardId] },
    });
    amitId = w2.body.data.id;

    // Rahul schedule: Mon 10:00-18:00
    await h.call('PUT', `/workers/${rahulId}/schedule`, {
      token: ownerTokenA,
      body: { schedule: [{ weekday: 1, isWorking: true, startTime: '10:00', endTime: '18:00' }] },
    });

    // Amit schedule: Mon 12:00-20:00
    await h.call('PUT', `/workers/${amitId}/schedule`, {
      token: ownerTokenA,
      body: { schedule: [{ weekday: 1, isWorking: true, startTime: '12:00', endTime: '20:00' }] },
    });

    const rahulUser = (await h.ownerPool.query(`SELECT id, name FROM users WHERE email = 'rahul@classic.com'`)).rows[0];
    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    workerTokenRahul = tokens.signAccess({ id: rahulUser.id, type: 'staff', name: rahulUser.name, shop_id: shopA.id } as any);
  });

  after(async () => {
    await h.close();
  });

  describe('Master Test Scenario 74 (Add-On Service & Lifecycle)', () => {
    let appointmentId: string;
    const mondayStr = getNextMondayStr();

    it('customer books Haircut with Rahul at 10:00 AM for ₹300', async () => {
      const bookRes = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
        body: {
          name: 'Jay',
          phone: '+919876511111',
          date: mondayStr,
          startTime: '10:00',
          serviceIds: [haircutId],
          workerId: rahulId,
        },
      });

      assert.equal(bookRes.status, 201);
      assert.equal(bookRes.body.success, true);
      const data = bookRes.body.data;
      assert.equal(data.customerName, 'Jay');
      assert.equal(data.workerName, 'Rahul');
      assert.equal(data.startTime, '10:00');
      assert.equal(data.endTime, '10:30');
      assert.equal(data.totalAmountPaise, 30000);
      assert.equal(data.services.length, 1);
      assert.equal(data.services[0].serviceName, 'Haircut');
      assert.equal(data.services[0].unitPricePaise, 30000);
      appointmentId = data.id;
    });

    it('customer arrives: status changed to checked_in, then in_service', async () => {
      const checkIn = await h.call('PATCH', `/appointments/${appointmentId}/status`, {
        token: ownerTokenA,
        body: { status: 'checked_in', notes: 'Customer arrived on time' },
      });
      assert.equal(checkIn.status, 200);
      assert.equal(checkIn.body.data.status, 'checked_in');

      const inService = await h.call('PATCH', `/appointments/${appointmentId}/status`, {
        token: ownerTokenA,
        body: { status: 'in_service', notes: 'Service started' },
      });
      assert.equal(inService.status, 200);
      assert.equal(inService.body.data.status, 'in_service');
    });

    it('worker adds Beard (₹150): total becomes ₹450 on the same appointment without duplication', async () => {
      const addRes = await h.call('POST', `/appointments/${appointmentId}/services`, {
        token: ownerTokenA,
        body: { serviceId: beardId },
      });

      assert.equal(addRes.status, 201);
      const data = addRes.body.data;
      assert.equal(data.id, appointmentId, 'Must be the exact same appointment ID');
      assert.equal(data.totalAmountPaise, 45000, 'Total must equal ₹300 + ₹150 = ₹450 (45000 paise)');
      assert.equal(data.endTime, '10:50', 'End time extended from 10:30 to 10:50 (+20 mins)');
      assert.equal(data.services.length, 2);
      assert.equal(data.services[0].serviceName, 'Haircut');
      assert.equal(data.services[1].serviceName, 'Beard Trim');

      // Verify no duplicate appointment was created in database
      const countRes = await h.ownerPool.query(
        `SELECT count(*)::int AS cnt FROM appointments WHERE shop_id = $1`,
        [shopA.id]
      );
      assert.equal(countRes.rows[0].cnt, 1, 'Only exactly 1 appointment record should exist');
    });
  });

  describe('Master Test Scenario 75 (Any Available Barber)', () => {
    const mondayStr = getNextMondayStr();

    it('books with "Any Available Barber" and assigns an eligible free barber', async () => {
      const bookRes = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
        body: {
          name: 'Priya',
          phone: '+919876522222',
          date: mondayStr,
          startTime: '10:00', // Rahul is already booked from 10:00 to 10:50! But Amit doesn't start until 12:00!
          serviceIds: [haircutId],
          workerId: 'any',
        },
      });

      // At 10:00 Rahul is busy (booked 10:00-10:50) and Amit starts at 12:00 -> 10:00 is NOT available!
      assert.equal(bookRes.status, 400, 'Should reject double-booking overlapping slot');

      // But at 12:00 Amit IS free! Let's book at 12:00 with "Any":
      const book1200 = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
        body: {
          name: 'Priya',
          phone: '+919876522222',
          date: mondayStr,
          startTime: '12:00',
          serviceIds: [haircutId],
          workerId: 'any',
        },
      });
      assert.equal(book1200.status, 201);
      assert.ok(book1200.body.data.workerId !== null);
      assert.equal(book1200.body.data.startTime, '12:00');
    });
  });

  describe('Master Test Scenario 76 (Unassigned Booking & Admin Assignment)', () => {
    let unassignedId: string;
    const mondayStr = getNextMondayStr();

    it('creates an appointment with walk-in or booking without assigned barber', async () => {
      const walkIn = await h.call('POST', '/appointments/walk-in', {
        token: ownerTokenA,
        body: {
          customerName: 'Samir',
          customerPhone: '+919876533333',
          date: mondayStr,
          startTime: '15:00',
          serviceIds: [haircutId],
          workerId: null, // Unassigned
        },
      });
      assert.equal(walkIn.status, 201);
      assert.equal(walkIn.body.data.workerId, null);
      assert.equal(walkIn.body.data.workerName, null);
      unassignedId = walkIn.body.data.id;
    });

    it('admin assigns eligible worker Rahul to the appointment', async () => {
      const assignRes = await h.call('PATCH', `/appointments/${unassignedId}/assign`, {
        token: ownerTokenA,
        body: { workerId: rahulId },
      });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.body.data.workerId, rahulId);
      assert.equal(assignRes.body.data.workerName, 'Rahul');

      // Assigned worker Rahul can now view it
      const view = await h.call('GET', `/appointments/${unassignedId}`, { token: workerTokenRahul });
      assert.equal(view.status, 200);
      assert.equal(view.body.data.id, unassignedId);
    });
  });

  describe('Tenant Data Isolation (Shop A vs Shop B)', () => {
    it('Shop B cannot view, assign, or add services to Shop A appointments', async () => {
      const listA = (await h.call('GET', '/appointments', { token: ownerTokenA })).body.data.items;
      assert.ok(listA.length > 0);
      const targetId = listA[0].id;

      // Shop B views Shop A appointment
      const crossGet = await h.call('GET', `/appointments/${targetId}`, { token: ownerTokenB });
      assert.equal(crossGet.status, 404);

      // Shop B attempts to add service to Shop A appointment
      const crossAdd = await h.call('POST', `/appointments/${targetId}/services`, {
        token: ownerTokenB,
        body: { serviceId: beardId },
      });
      assert.equal(crossAdd.status, 404);
    });
  });
});
