import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { firstValueFrom, take, toArray } from 'rxjs';
import { boot, Harness } from './harness';
import { RealtimeEventsService } from '../events/events.service';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let workerTokenRahul: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let rahulId: string;
let amitId: string;
let haircutId: string;

before(async () => {
  h = await boot();

  // Onboard Shop A
  shopA = (
    await h.ownerPool.query(
      `INSERT INTO shops (name, slug, timezone, status) VALUES ('Live Shop A', 'live-shop-a', 'Asia/Kolkata', 'active') RETURNING id, slug`
    )
  ).rows[0];

  // Onboard Shop B (for cross-tenant tests)
  shopB = (
    await h.ownerPool.query(
      `INSERT INTO shops (name, slug, timezone, status) VALUES ('Live Shop B', 'live-shop-b', 'Asia/Kolkata', 'active') RETURNING id, slug`
    )
  ).rows[0];

  // Seed roles for Shop A
  const rA = (
    await h.ownerPool.query(
      `INSERT INTO roles (shop_id, name, is_system, system_key)
       VALUES ($1, 'Owner', true, 'owner'), ($1, 'Worker', true, 'worker') RETURNING id, system_key`,
      [shopA.id]
    )
  ).rows;
  const ownerRoleIdA = rA.find((x) => x.system_key === 'owner').id;
  const workerRoleIdA = rA.find((x) => x.system_key === 'worker').id;

  // Seed Owner A user
  const uA = (
    await h.ownerPool.query(
      `INSERT INTO users (type, name, email, password_hash, shop_id)
       VALUES ('staff', 'Owner Shop A', 'owner-a@example.com', 'hash', $1) RETURNING id`,
      [shopA.id]
    )
  ).rows[0];

  await h.ownerPool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`, [
    uA.id,
    shopA.id,
    ownerRoleIdA,
  ]);
  await h.ownerPool.query(
    `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
    [ownerRoleIdA, shopA.id]
  );

  // Seed Owner B user
  const rB = (
    await h.ownerPool.query(
      `INSERT INTO roles (shop_id, name, is_system, system_key)
       VALUES ($1, 'Owner', true, 'owner') RETURNING id, system_key`,
      [shopB.id]
    )
  ).rows;
  const ownerRoleIdB = rB.find((x) => x.system_key === 'owner').id;

  const uB = (
    await h.ownerPool.query(
      `INSERT INTO users (type, name, email, password_hash, shop_id)
       VALUES ('staff', 'Owner Shop B', 'owner-b@example.com', 'hash', $1) RETURNING id`,
      [shopB.id]
    )
  ).rows[0];

  await h.ownerPool.query(`INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1, $2, $3)`, [
    uB.id,
    shopB.id,
    ownerRoleIdB,
  ]);
  await h.ownerPool.query(
    `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope) SELECT $1, $2, id, 'all' FROM permissions`,
    [ownerRoleIdB, shopB.id]
  );

  const { TokenService } = await import('../core/token.service');
  const tokens = new TokenService();
  ownerTokenA = tokens.signAccess({ id: uA.id, type: 'staff', name: 'Owner A', shop_id: shopA.id } as any);
  ownerTokenB = tokens.signAccess({ id: uB.id, type: 'staff', name: 'Owner B', shop_id: shopB.id } as any);

  // Create service in Shop A
  const sRes = await h.call('POST', '/services', {
    token: ownerTokenA,
    body: { name: 'Live Cut', pricePaise: 25000, durationMinutes: 30 },
  });
  haircutId = sRes.body.data.id;

  // Create Worker Rahul in Shop A
  const w1 = await h.call('POST', '/workers', {
    token: ownerTokenA,
    body: {
      displayName: 'Rahul Live',
      login: { email: 'rahul.live@example.com', password: 'Password!1' },
    },
  });
  rahulId = w1.body.data.id;
  await h.call('PUT', `/workers/${rahulId}/services`, {
    token: ownerTokenA,
    body: { serviceIds: [haircutId] },
  });

  // Create Worker Amit in Shop A
  const w2 = await h.call('POST', '/workers', {
    token: ownerTokenA,
    body: {
      displayName: 'Amit Live',
      login: { email: 'amit.live@example.com', password: 'Password!1' },
    },
  });
  amitId = w2.body.data.id;
  await h.call('PUT', `/workers/${amitId}/services`, {
    token: ownerTokenA,
    body: { serviceIds: [haircutId] },
  });
});

after(async () => {
  await h.close();
});

describe('Real-Time Server-Sent Events (SSE) Engine', () => {
  it('1. Event service dispatches events and delivers to subscribers of the same shop', async () => {
    const svc = new RealtimeEventsService();
    const received: any[] = [];

    const sub = svc.subscribe(shopA.id).subscribe((msg) => {
      received.push(msg);
    });

    svc.emit({
      shopId: shopA.id,
      type: 'appointment_created',
      workerId: rahulId,
      data: { customerName: 'Vikas' },
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'appointment_created');
    assert.equal(received[0].data.data.customerName, 'Vikas');

    sub.unsubscribe();
  });

  it('2. Enforces multi-tenant cross-shop isolation (Shop B never receives Shop A events)', async () => {
    const svc = new RealtimeEventsService();
    const receivedB: any[] = [];

    const subB = svc.subscribe(shopB.id).subscribe((msg) => {
      receivedB.push(msg);
    });

    // Emit event in Shop A
    svc.emit({
      shopId: shopA.id,
      type: 'appointment_created',
      workerId: rahulId,
      data: { customerName: 'Secret Customer' },
    });

    assert.equal(receivedB.length, 0, 'Shop B must not receive Shop A events');

    // Emit event in Shop B
    svc.emit({
      shopId: shopB.id,
      type: 'appointment_status_changed',
      data: { customerName: 'Shop B Customer' },
    });

    assert.equal(receivedB.length, 1);
    assert.equal(receivedB[0].data.data.customerName, 'Shop B Customer');

    subB.unsubscribe();
  });

  it('3. Filters worker-specific chair queue events while preserving shop-wide events', async () => {
    const svc = new RealtimeEventsService();
    const receivedRahul: any[] = [];

    // Rahul's mobile station subscriber
    const subRahul = svc.subscribe(shopA.id, rahulId).subscribe((msg) => {
      receivedRahul.push(msg);
    });

    // Event targeting Amit (not Rahul)
    svc.emit({
      shopId: shopA.id,
      type: 'appointment_created',
      workerId: amitId,
      data: { customerName: 'Amit Client' },
    });

    assert.equal(receivedRahul.length, 0, 'Rahul should not receive Amit specific chair events');

    // Event targeting Rahul
    svc.emit({
      shopId: shopA.id,
      type: 'appointment_created',
      workerId: rahulId,
      data: { customerName: 'Rahul Client' },
    });

    assert.equal(receivedRahul.length, 1);
    assert.equal(receivedRahul[0].data.data.customerName, 'Rahul Client');

    // Shop-wide announcement / walk-in unassigned
    svc.emit({
      shopId: shopA.id,
      type: 'notification_created',
      workerId: null,
      data: { title: 'Shop Closing Soon' },
    });

    assert.equal(receivedRahul.length, 2);
    assert.equal(receivedRahul[1].data.data.title, 'Shop Closing Soon');

    subRahul.unsubscribe();
  });

  it('4. Protected SSE endpoint rejects anonymous or customer callers (requires StaffOnly)', async () => {
    // Anonymous call
    const anonRes = await h.call('GET', '/events/stream');
    assert.equal(anonRes.status, 401);

    // Customer token should be forbidden (403) by @StaffOnly guard
    const custUser = (
      await h.ownerPool.query(
        `INSERT INTO users (type, name, phone, email, password_hash, shop_id)
         VALUES ('customer', 'Customer One', '+919999999999', 'customer1@example.com', 'hash', NULL) RETURNING id`
      )
    ).rows[0];

    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    const custToken = tokens.signAccess({ id: custUser.id, type: 'customer', name: 'Cust', shop_id: null } as any);
    const custRes = await h.call('GET', '/events/stream', { token: custToken });
    assert.equal(custRes.status, 403);
  });

  it('5. Automatically broadcasts real-time events when appointments are created and status updated', async () => {
    const eventsSvc = h.app.get(RealtimeEventsService);
    const captured: any[] = [];

    const sub = eventsSvc.subscribe(shopA.id).subscribe((msg: any) => {
      captured.push(msg);
    });

    // Create a walk-in appointment in Shop A
    const walkInRes = await h.call('POST', '/appointments/walk-in', {
      token: ownerTokenA,
      body: {
        customerName: 'Live Walk-in Customer',
        customerPhone: '+919876543210',
        serviceIds: [haircutId],
        workerId: rahulId,
      },
    });
    assert.equal(walkInRes.status, 201);
    const aptId = walkInRes.body.data.id;

    assert.ok(captured.length >= 1, 'Must capture at least 1 event');
    const createdEvt = captured.find((e) => e.type === 'appointment_created');
    assert.ok(createdEvt, 'Must emit appointment_created event');
    assert.equal(createdEvt.data.data.customerName, 'Live Walk-in Customer');

    // Update status to in_service
    const updateRes = await h.call('PATCH', `/appointments/${aptId}/status`, {
      token: ownerTokenA,
      body: { status: 'in_service' },
    });
    assert.equal(updateRes.status, 200);

    const statusEvt = captured.find((e) => e.type === 'appointment_status_changed');
    assert.ok(statusEvt, 'Must emit appointment_status_changed event');
    assert.equal(statusEvt.data.data.status, 'in_service');

    sub.unsubscribe();
  });
});
