import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let workerTokenRahul: string;
let shopA: { id: string; slug: string };
let rahulId: string;
let haircutId: string;

before(async () => {
  h = await boot();

    // Onboard Shop A
    const s = (await h.ownerPool.query(
      `INSERT INTO shops (name, slug, timezone, status) VALUES ('Classic Barber', 'classic-barber', 'Asia/Kolkata', 'active') RETURNING id, slug`
    )).rows[0];
    shopA = s;

    const r = (await h.ownerPool.query(
      `INSERT INTO roles (shop_id, name, is_system, system_key)
       VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
      [s.id]
    )).rows;
    const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

    const u = (await h.ownerPool.query(
      `INSERT INTO users (type, name, email, password_hash, shop_id)
       VALUES ('staff', 'Owner Rahul', 'owner@classic.com', 'x', $1) RETURNING id`,
      [s.id]
    )).rows[0];

    await h.ownerPool.query(
      `INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`,
      [u.id, s.id, ownerRoleId]
    );

    await h.ownerPool.query(
      `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
      [ownerRoleId, s.id]
    );

    const workerRoleId = r.find((x: any) => x.system_key === 'worker').id;
    await h.ownerPool.query(
      `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions WHERE key IN ('dashboard.view', 'appointments.view', 'customers.view')`,
      [workerRoleId, s.id]
    );

    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    ownerTokenA = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);

    // Create service
    const s1 = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Haircut', pricePaise: 30000, durationMinutes: 30 },
    });
    haircutId = s1.body.data.id;

    // Create worker Rahul
    const w1 = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: {
        displayName: 'Rahul',
        login: { email: 'rahul.barber@classic.com', password: 'Password!1' },
      },
    });
    rahulId = w1.body.data.id;
    await h.call('PUT', `/workers/${rahulId}/services`, {
      token: ownerTokenA,
      body: { ids: [haircutId] },
    });

    const rahulUser = (await h.ownerPool.query(`SELECT id, name FROM users WHERE email = 'rahul.barber@classic.com'`)).rows[0];
    workerTokenRahul = tokens.signAccess({ id: rahulUser.id, type: 'staff', name: rahulUser.name, shop_id: s.id } as any);

    // Create a product with low stock
    await h.call('POST', '/products', {
      token: ownerTokenA,
      body: { name: 'Pomade', sku: 'POM-01', sellingPricePaise: 50000, costPricePaise: 30000, stockQuantity: 2, lowStockThreshold: 5 },
    });

    // Create a walk-in appointment today with Rahul and complete it with billing
    const today = new Date().toISOString().slice(0, 10);
    const walkIn = await h.call('POST', '/appointments/walk-in', {
      token: ownerTokenA,
      body: { customerName: 'Kunal', customerPhone: '+919876540001', workerId: rahulId, serviceIds: [haircutId] },
    });
    const aptId = walkIn.body.data.id;

    // Bill the appointment
    const inv = await h.call('POST', '/billing/invoices', {
      token: ownerTokenA,
      body: {
        appointmentId: aptId,
        workerId: rahulId,
        items: [{ type: 'service', itemId: haircutId, itemName: 'Haircut', quantity: 1, unitPricePaise: 30000 }],
      },
    });

    // Pay invoice
    await h.call('POST', `/billing/invoices/${inv.body.data.id}/pay`, {
      token: ownerTokenA,
      body: { method: 'cash', amountPaise: 30000 },
    });
  });

  after(async () => {
    await h.close();
  });

  describe('Admin Dashboard (Rule 37)', () => {
    it('returns complete dashboard cards, appointments list, and worker performance', async () => {
      const res = await h.call('GET', '/reports/dashboard/admin', { token: ownerTokenA });
      assert.equal(res.status, 200);
      const data = res.body.data;

      // Metrics cards
      assert.equal(data.metrics.todayRevenuePaise, 30000); // ₹300
      assert.equal(data.metrics.todayAppointments, 1);
      assert.equal(data.metrics.completedAppointments, 1);
      assert.equal(data.metrics.lowStockCount, 1);

      // Appointments list
      assert.equal(data.appointments.length, 1);
      assert.equal(data.appointments[0].customerName, 'Kunal');
      assert.equal(data.appointments[0].workerName, 'Rahul');

      // Worker performance
      assert.equal(data.workerPerformance.length, 1);
      assert.equal(data.workerPerformance[0].displayName, 'Rahul');
      assert.equal(data.workerPerformance[0].completedCount, 1);
      assert.equal(data.workerPerformance[0].revenuePaise, 30000);
    });
  });

  describe('Worker Dashboard (Rule 33)', () => {
    it('returns worker personalized metrics and today work queue', async () => {
      const res = await h.call('GET', '/reports/dashboard/worker', { token: workerTokenRahul });
      assert.equal(res.status, 200);
      const data = res.body.data;

      assert.equal(data.workerName, 'Rahul');
      assert.equal(data.metrics.todayAppointments, 1);
      assert.equal(data.metrics.completedAppointments, 1);
      assert.equal(data.metrics.todayRevenuePaise, 30000);
      assert.equal(data.queue.length, 1);
    });
  });

  describe('Reporting & Analytics (Rule 36)', () => {
    it('generates sales, worker, inventory, and finance reports', async () => {
      const sales = await h.call('GET', '/reports/analytics?type=sales', { token: ownerTokenA });
      assert.equal(sales.status, 200);
      assert.equal(sales.body.data.type, 'sales');

      const workers = await h.call('GET', '/reports/analytics?type=workers', { token: ownerTokenA });
      assert.equal(workers.status, 200);
      assert.equal(workers.body.data.type, 'workers');

      const inv = await h.call('GET', '/reports/analytics?type=inventory', { token: ownerTokenA });
      assert.equal(inv.status, 200);
      assert.equal(inv.body.data.type, 'inventory');
      assert.ok(inv.body.data.products.length >= 1);

      const fin = await h.call('GET', '/reports/analytics?type=finance', { token: ownerTokenA });
      assert.equal(fin.status, 200);
      assert.equal(fin.body.data.revenuePaise, 30000);
    });
  });

