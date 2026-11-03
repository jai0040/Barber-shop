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
let completedAptId: string;
let bookedAptId: string;

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

    const resA = await onboard('reviews-shop-a', 'Reviews Shop A', 'owner.reva@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('reviews-shop-b', 'Reviews Shop B', 'owner.revb@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create Service in Shop A
    const sRes = await h.call('POST', '/services', {
      token: ownerTokenA,
      body: { name: 'Executive Haircut', pricePaise: 40000, durationMinutes: 30 },
    });
    const serviceIdA = sRes.body.data.id;

    // Create Worker in Shop A
    const wRes = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: {
        displayName: 'Karan Stylist',
        phone: '+919876543233',
        serviceIds: [serviceIdA],
      },
    });
    workerIdA = wRes.body.data.id;

    // Create Customer user and profile in Shop A
    const cu = (
      await h.ownerPool.query(
        `INSERT INTO users (type, name, email, phone, password_hash)
         VALUES ('customer', 'Arjun Kapoor', 'arjun@example.com', '+919988771122', 'x') RETURNING id`
      )
    ).rows[0];
    customerUserIdA = cu.id;

    const cust = (
      await h.ownerPool.query(
        `INSERT INTO customers (shop_id, user_id, name, phone, email)
         VALUES ($1, $2, 'Arjun Kapoor', '+919988771122', 'arjun@example.com') RETURNING id`,
        [shopA.id, customerUserIdA]
      )
    ).rows[0];
    customerIdA = cust.id;

    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    customerTokenA = tokens.signAccess({
      id: customerUserIdA,
      type: 'customer',
      name: 'Arjun Kapoor',
    } as any);

    // Create a completed appointment in Shop A
    const apt1 = (
      await h.ownerPool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, appointment_number, date, start_time, end_time, status)
         VALUES ($1, $2, $3, 101, CURRENT_DATE, '10:00'::time, '10:30'::time, 'completed') RETURNING id`,
        [shopA.id, customerIdA, workerIdA]
      )
    ).rows[0];
    completedAptId = apt1.id;

    // Create a booked (non-completed) appointment in Shop A
    const apt2 = (
      await h.ownerPool.query(
        `INSERT INTO appointments (shop_id, customer_id, worker_id, appointment_number, date, start_time, end_time, status)
         VALUES ($1, $2, $3, 102, CURRENT_DATE, '11:00'::time, '11:30'::time, 'booked') RETURNING id`,
        [shopA.id, customerIdA, workerIdA]
      )
    ).rows[0];
    bookedAptId = apt2.id;
  } catch (err) {
    console.error('Reviews test setup failed:', err);
    throw err;
  }
});

after(async () => {
  if (h) await h.close();
});

describe('Customer Reviews & Ratings Engine (Phase 6)', () => {
  let reviewId1: string;

  it('1. Customer submits a 5-star review for a completed appointment', async () => {
    const res = await h.call('POST', '/reviews', {
      token: customerTokenA,
      body: {
        shopId: shopA.id,
        appointmentId: completedAptId,
        rating: 5,
        barberRating: 5,
        comment: 'Outstanding haircut and fade! Karan was super attentive.',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.rating, 5);
    assert.equal(res.body.data.barberRating, 5);
    assert.equal(res.body.data.status, 'published');
    assert.equal(res.body.data.appointmentId, completedAptId);
    assert.equal(res.body.data.workerId, workerIdA);
    reviewId1 = res.body.data.id;
  });

  it('2. Prevents duplicate review for the same appointment', async () => {
    const res = await h.call('POST', '/reviews', {
      token: customerTokenA,
      body: {
        shopId: shopA.id,
        appointmentId: completedAptId,
        rating: 4,
        comment: 'Trying to review again',
      },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already been reviewed/i);
  });

  it('3. Rejects review submission for non-completed appointment', async () => {
    const res = await h.call('POST', '/reviews', {
      token: customerTokenA,
      body: {
        shopId: shopA.id,
        appointmentId: bookedAptId,
        rating: 5,
        comment: 'Service has not happened yet',
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /only review completed appointments/i);
  });

  it('4. Customer submits a general visit review without appointment ID', async () => {
    const res = await h.call('POST', '/reviews', {
      token: customerTokenA,
      body: {
        shopId: shopA.id,
        workerId: workerIdA,
        rating: 4,
        barberRating: 4,
        comment: 'Great walk-in experience and welcoming vibe.',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.rating, 4);
    assert.equal(res.body.data.appointmentId, null);
  });

  it('5. Public reviews endpoint lists published reviews with privacy-masked customer names', async () => {
    const res = await h.call('GET', `/reviews/public/${shopA.slug}`, {});
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.equal(res.body.data.total, 2);
    // Masked name: "Arjun K." instead of full name
    assert.equal(res.body.data.items[0].customerName, 'Arjun K.');
    assert.equal(res.body.data.items[0].rating, 4);
  });

  it('6. Public summary endpoint aggregates average rating and star distribution', async () => {
    const res = await h.call('GET', `/reviews/public/${shopA.slug}/summary`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.totalReviews, 2);
    // (5 + 4) / 2 = 4.5
    assert.equal(res.body.data.averageRating, 4.5);
    assert.equal(res.body.data.ratingDistribution[5], 1);
    assert.equal(res.body.data.ratingDistribution[4], 1);
    assert.equal(res.body.data.ratingDistribution[1], 0);
  });

  it('7. Filters reviews by worker ID and minimum rating', async () => {
    const res = await h.call('GET', `/reviews/public/${shopA.slug}?workerId=${workerIdA}&minRating=5`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.items[0].rating, 5);
  });

  it('8. Shop owner replies to a customer review', async () => {
    const res = await h.call('POST', `/reviews/${reviewId1}/reply`, {
      token: ownerTokenA,
      body: {
        ownerReply: 'Thank you Arjun! Looking forward to seeing you again soon.',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ownerReply, 'Thank you Arjun! Looking forward to seeing you again soon.');
    assert.ok(res.body.data.ownerRepliedAt);

    // Verify reply appears in public listing
    const pubRes = await h.call('GET', `/reviews/public/${shopA.slug}`, {});
    const item = pubRes.body.data.items.find((r: any) => r.id === reviewId1);
    assert.equal(item.ownerReply, 'Thank you Arjun! Looking forward to seeing you again soon.');
  });

  it('9. Moderation: Admin hides a review and it is excluded from public endpoints', async () => {
    const res = await h.call('PATCH', `/reviews/${reviewId1}/status`, {
      token: ownerTokenA,
      body: { status: 'hidden' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'hidden');

    // Public list should now only contain 1 published review
    const pubRes = await h.call('GET', `/reviews/public/${shopA.slug}`, {});
    assert.equal(pubRes.body.data.total, 1);
    assert.ok(!pubRes.body.data.items.some((r: any) => r.id === reviewId1));

    // Admin list still shows all reviews including hidden ones
    const adminRes = await h.call('GET', '/reviews', {
      token: ownerTokenA,
    });
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.data.total, 2);
  });

  it('10. Enforces multi-tenant cross-shop isolation', async () => {
    // Shop B cannot reply to Shop A review
    const res1 = await h.call('POST', `/reviews/${reviewId1}/reply`, {
      token: ownerTokenB,
      body: { ownerReply: 'Hacked reply from Shop B' },
    });
    assert.equal(res1.status, 404);

    // Shop B cannot change status of Shop A review
    const res2 = await h.call('PATCH', `/reviews/${reviewId1}/status`, {
      token: ownerTokenB,
      body: { status: 'published' },
    });
    assert.equal(res2.status, 404);

    // Shop B admin reviews list is empty
    const res3 = await h.call('GET', '/reviews', {
      token: ownerTokenB,
    });
    assert.equal(res3.status, 200);
    assert.equal(res3.body.data.total, 0);
  });
});
