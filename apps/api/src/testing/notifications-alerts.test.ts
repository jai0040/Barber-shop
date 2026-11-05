import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let customerTokenA: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let workerIdA: string;
let customerIdA: string;
let customerUserIdA: string;
let serviceIdA: string;
let productIdA: string;

describe('Phase 7: Notification & Alerting Engine', () => {
  before(async () => {
  try {
    h = await boot();

    const onboard = async (slug: string, name: string, email: string) => {
      const s = (
        await h.ownerPool.query(
          `INSERT INTO shops (name, slug, timezone, status) VALUES ($1, $2, 'Asia/Kolkata', 'active') RETURNING id, slug`,
          [name, slug]
        )
      ).rows[0];

      const r = (
        await h.ownerPool.query(
          `INSERT INTO roles (shop_id, name, is_system, system_key)
           VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
          [s.id]
        )
      ).rows;
      const ownerRoleId = r.find((x) => x.system_key === 'owner').id;

      const u = (
        await h.ownerPool.query(
          `INSERT INTO users (type, name, email, password_hash, shop_id)
           VALUES ('staff', $1, $2, 'x', $3) RETURNING id`,
          [name + ' Owner', email, s.id]
        )
      ).rows[0];

      await h.ownerPool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`, [
        u.id,
        s.id,
        ownerRoleId,
      ]);

      await h.ownerPool.query(
        `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
        [ownerRoleId, s.id]
      );

      const { TokenService } = await import('../core/token.service');
      const tokens = new TokenService();
      const token = tokens.signAccess({ id: u.id, type: 'staff', name: u.name, shop_id: s.id } as any);
      return { shop: s, token };
    };

    const resA = await onboard('notif-shop-a', 'Notif Shop A', 'owner.a@notif.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('notif-shop-b', 'Notif Shop B', 'owner.b@notif.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Worker in Shop A
    const workerRow = (
      await h.ownerPool.query(
        `INSERT INTO workers (shop_id, display_name, status) VALUES ($1, 'Master Barber', 'active') RETURNING id`,
        [shopA.id]
      )
    ).rows[0];
    workerIdA = workerRow.id;

    // Service in Shop A
    const srvRow = (
      await h.ownerPool.query(
        `INSERT INTO services (shop_id, name, duration_min, price_paise, status) VALUES ($1, 'Signature Haircut', 30, 35000, 'active') RETURNING id`,
        [shopA.id]
      )
    ).rows[0];
    serviceIdA = srvRow.id;
    await h.ownerPool.query(
      `INSERT INTO worker_services (shop_id, worker_id, service_id) VALUES ($1, $2, $3)`,
      [shopA.id, workerIdA, serviceIdA]
    );

    // Business hours & availability (all days of the week: ISO 1=Monday to 7=Sunday)
    for (let day = 1; day <= 7; day++) {
      await h.ownerPool.query(
        `INSERT INTO shop_hours (shop_id, weekday, is_closed, open_time, close_time) VALUES ($1, $2, false, '09:00', '20:00')`,
        [shopA.id, day]
      );
      await h.ownerPool.query(
        `INSERT INTO worker_availability (shop_id, worker_id, weekday, is_working, start_time, end_time) VALUES ($1, $2, $3, true, '09:00', '19:00')`,
        [shopA.id, workerIdA, day]
      );
    }

    // Product in Shop A
    const prodRow = (
      await h.ownerPool.query(
        `INSERT INTO products (shop_id, name, sku, selling_price_paise, cost_price_paise, stock_quantity, low_stock_threshold, status)
         VALUES ($1, 'Matte Clay Wax', 'WAX-101', 45000, 25000, 4, 5, 'active') RETURNING id`,
        [shopA.id]
      )
    ).rows[0];
    productIdA = prodRow.id;

    // Customer in Shop A
    const custUser = (
      await h.ownerPool.query(
        `INSERT INTO users (type, name, phone, email, password_hash)
         VALUES ('customer', 'Karan Verma', '+919988776655', 'karan@notif.com', 'x') RETURNING id`,
        []
      )
    ).rows[0];
    customerUserIdA = custUser.id;

    const custRow = (
      await h.ownerPool.query(
        `INSERT INTO customers (shop_id, user_id, name, phone, email)
         VALUES ($1, $2, 'Karan Verma', '+919988776655', 'karan@notif.com') RETURNING id`,
        [shopA.id, customerUserIdA]
      )
    ).rows[0];
    customerIdA = custRow.id;

    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    customerTokenA = tokens.signAccess({
      id: customerUserIdA,
      type: 'customer',
      name: 'Karan Verma',
    } as any);
  } catch (err) {
    console.error('Test bootstrap error:', err);
    throw err;
  }
});

let createdNotifId: string;

  it('1. Staff lists empty or initial notifications and checks unread count', async () => {
    const resCount = await h.call('GET', '/notifications/unread-count', {
      token: ownerTokenA,
    });
    assert.strictEqual(resCount.status, 200);
    assert.strictEqual(typeof resCount.body.data.unreadCount, 'number');

    const resList = await h.call('GET', '/notifications', {
      token: ownerTokenA,
    });
    assert.strictEqual(resList.status, 200);
    assert.ok(Array.isArray(resList.body.data.items));
  });

  it('2. Dispatches an in-system alert and retrieves unread notification', async () => {
    const resDispatch = await h.call('POST', '/notifications/dispatch', {
      token: ownerTokenA,
      body: {
        title: 'VIP Client Arrival',
        message: 'Karan Verma has arrived at the salon.',
        type: 'appointment_confirmed',
        channel: 'in_app',
        customerId: customerIdA,
      },
    });
    assert.strictEqual(resDispatch.status, 201);
    assert.strictEqual(resDispatch.body.data.title, 'VIP Client Arrival');
    assert.strictEqual(resDispatch.body.data.status, 'unread');
    createdNotifId = resDispatch.body.data.id;

    // Check count increased
    const resCount = await h.call('GET', '/notifications/unread-count', {
      token: ownerTokenA,
    });
    assert.ok(resCount.body.data.unreadCount >= 1);
  });

  it('3. Marks a single notification as read', async () => {
    const resRead = await h.call('PATCH', `/notifications/${createdNotifId}/read`, {
      token: ownerTokenA,
    });
    assert.strictEqual(resRead.status, 200);
    assert.strictEqual(resRead.body.data.status, 'read');
    assert.ok(resRead.body.data.readAt);
  });

  it('4. Marks all unread alerts as read in bulk', async () => {
    // Dispatch 2 more alerts
    await h.call('POST', '/notifications/dispatch', {
      token: ownerTokenA,
      body: {
        title: 'Alert 1',
        message: 'Alert 1 content',
        type: 'low_stock',
        channel: 'in_app',
      },
    });
    await h.call('POST', '/notifications/dispatch', {
      token: ownerTokenA,
      body: {
        title: 'Alert 2',
        message: 'Alert 2 content',
        type: 'low_stock',
        channel: 'in_app',
      },
    });

    const resReadAll = await h.call('POST', '/notifications/read-all', {
      token: ownerTokenA,
    });
    assert.strictEqual(resReadAll.status, 200);
    assert.ok(resReadAll.body.data.updatedCount >= 2);

    const resCount = await h.call('GET', '/notifications/unread-count', {
      token: ownerTokenA,
    });
    assert.strictEqual(resCount.body.data.unreadCount, 0);
  });

  it('5. Generates WhatsApp click-to-chat link with normalized phone number and encoded text', async () => {
    const resDispatch = await h.call('POST', '/notifications/dispatch', {
      token: ownerTokenA,
      body: {
        title: 'Appointment Reminder',
        message: 'Hello Karan! Reminder for your haircut appointment at 11:00 AM.',
        type: 'appointment_confirmed',
        channel: 'whatsapp',
        customerPhone: '9988776655',
      },
    });
    assert.strictEqual(resDispatch.status, 201);
    assert.ok(resDispatch.body.data.whatsappUrl);
    assert.ok(resDispatch.body.data.whatsappUrl.startsWith('https://wa.me/919988776655?text='));
    assert.ok(resDispatch.body.data.whatsappUrl.includes('Reminder'));
  });

  it('6. Booking an appointment automatically triggers notifications for staff and customer', async () => {
    const futureBookingDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const bookRes = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
      body: {
        name: 'Karan Verma',
        phone: '+919988776655',
        date: futureBookingDate,
        startTime: '10:00',
        serviceIds: [serviceIdA],
        workerId: workerIdA,
      },
    });
    assert.strictEqual(bookRes.status, 201);

    const listRes = await h.call('GET', '/notifications?type=appointment_booked', {
      token: ownerTokenA,
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.data.items.length >= 1);
    const hasBooking = listRes.body.data.items.some(
      (i: any) => i.title.includes('Appointment') || i.title.includes('Booking')
    );
    assert.ok(hasBooking);
    const hasCustomer = listRes.body.data.items.some((i: any) =>
      i.message.includes('Karan Verma')
    );
    assert.ok(hasCustomer);
  });

  it('7. Updating appointment status to confirmed triggers appointment_confirmed notification', async () => {
    const futureBookingDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const bookRes = await h.call('POST', `/appointments/public/${shopA.slug}/book`, {
      body: {
        name: 'Karan Verma',
        phone: '+919988776655',
        date: futureBookingDate,
        startTime: '11:00',
        serviceIds: [serviceIdA],
        workerId: workerIdA,
      },
    });
    assert.strictEqual(bookRes.status, 201);
    const apptId = bookRes.body.data.id;

    const updateRes = await h.call('PATCH', `/appointments/${apptId}/status`, {
      token: ownerTokenA,
      body: { status: 'confirmed' },
    });
    assert.strictEqual(updateRes.status, 200);

    const listRes = await h.call('GET', '/notifications?type=appointment_confirmed', {
      token: ownerTokenA,
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.data.items.length >= 1);
  });

  it('8. Low stock adjustment triggers low_stock alert notification', async () => {
    const adjRes = await h.call('POST', '/inventory/adjust', {
      token: ownerTokenA,
      body: {
        productId: productIdA,
        type: 'damage',
        quantityDelta: -1,
        notes: 'Damaged jar during unpacking',
      },
    });
    assert.strictEqual(adjRes.status, 201);

    const listRes = await h.call('GET', '/notifications?type=low_stock', {
      token: ownerTokenA,
    });
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.data.items.length >= 1);
    assert.ok(listRes.body.data.items[0].title.includes('Low Stock'));
  });

  it('9. Customer accesses their notification feed and receipts in customer portal', async () => {
    const res = await h.call('GET', `/me/shops/${shopA.slug}/notifications`, {
      token: customerTokenA,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('10. Enforces multi-tenant isolation (Shop B cannot view Shop A notifications)', async () => {
    const resA = await h.call('GET', '/notifications', {
      token: ownerTokenA,
    });
    assert.strictEqual(resA.status, 200);
    assert.ok(resA.body.data.items.length > 0);

    const resB = await h.call('GET', '/notifications', {
      token: ownerTokenB,
    });
    assert.strictEqual(resB.status, 200);
    assert.strictEqual(resB.body.data.items.length, 0); // Completely isolated
  });

  after(async () => {
    if (h) await h.close();
  });
});
