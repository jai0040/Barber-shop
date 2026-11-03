import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
let ownerTokenA: string;
let ownerTokenB: string;
let workerTokenA: string;
let shopA: { id: string; slug: string };
let shopB: { id: string; slug: string };
let workerIdA: string;
let workerUserA: { id: string };

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

    const resA = await onboard('att-shop-a', 'Attendance Shop A', 'owner.atta@example.com');
    shopA = resA.shop;
    ownerTokenA = resA.token;

    const resB = await onboard('att-shop-b', 'Attendance Shop B', 'owner.attb@example.com');
    shopB = resB.shop;
    ownerTokenB = resB.token;

    // Create a worker with login in Shop A
    const wRes = await h.call('POST', '/workers', {
      token: ownerTokenA,
      body: {
        displayName: 'Deepak Barber',
        phone: '+919876543211',
        email: 'deepak@barber.com',
        commissionRatePercent: 40,
        baseSalaryPaise: 3000000, // Rs 30,000 / month
        login: {
          phone: '+919876543211',
          password: 'WorkerPass#123',
        },
      },
    });
    assert.equal(wRes.status, 201, `Failed to create worker: ${JSON.stringify(wRes.body)}`);
    workerIdA = wRes.body.data.id;
    workerUserA = { id: wRes.body.data.userId };

    const { TokenService } = await import('../core/token.service');
    const tokens = new TokenService();
    workerTokenA = tokens.signAccess({
      id: workerUserA.id,
      type: 'staff',
      name: 'Deepak Barber',
      shop_id: shopA.id,
    } as any);

    // Grant worker attendance & salary view permissions to Worker role in Shop A
    const workerRoleIdA = (
      await h.ownerPool.query(
        `SELECT id FROM roles WHERE shop_id = $1 AND system_key = 'worker'`,
        [shopA.id]
      )
    ).rows[0].id;

    await h.ownerPool.query(
      `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope)
       SELECT $1, $2, id, 'own' FROM permissions WHERE key IN ('attendance.view', 'salary.view')
       ON CONFLICT DO NOTHING`,
      [workerRoleIdA, shopA.id]
    );
  } catch (err) {
    console.error('Test setup failed:', err);
    throw err;
  }
});

after(async () => {
  if (h) await h.close();
});

describe('Staff Attendance & Salary Advance Engine (Phase 5)', () => {
  let advanceId: string;
  let settlementId: string;

  it('1. Configures worker base salary successfully', async () => {
    const res = await h.call('PUT', `/attendance/worker/${workerIdA}/salary`, {
      token: ownerTokenA,
      body: { baseSalaryPaise: 3500000 }, // Rs 35,000
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.baseSalaryPaise, 3500000);
  });

  it('2. Worker clocks in successfully and double clock-in is prevented', async () => {
    // First clock in
    const res1 = await h.call('POST', '/attendance/clock-in', {
      token: workerTokenA,
      body: { notes: 'Started on time' },
    });
    assert.equal(res1.status, 201);
    assert.equal(res1.body.data.workerId, workerIdA);
    assert.equal(res1.body.data.status, 'present');
    assert.ok(res1.body.data.checkInAt);

    // Attempt double clock-in on same day
    const res2 = await h.call('POST', '/attendance/clock-in', {
      token: workerTokenA,
      body: { notes: 'Trying again' },
    });
    assert.equal(res2.status, 400);
    assert.match(res2.body.message, /Already clocked in/i);
  });

  it('3. Worker clocks out successfully recording check_out_at', async () => {
    const res = await h.call('POST', '/attendance/clock-out', {
      token: workerTokenA,
      body: { notes: 'Completed day shift' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.workerId, workerIdA);
    assert.ok(res.body.data.checkOutAt);
  });

  it('4. Retrieves today status for worker with base salary', async () => {
    const res = await h.call('GET', '/attendance/today', {
      token: workerTokenA,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.worker.id, workerIdA);
    assert.equal(res.body.data.worker.baseSalaryPaise, 3500000);
    assert.equal(res.body.data.attendance.status, 'present');
  });

  it('5. Manager records and overrides historical attendance records', async () => {
    // Record half day for yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const res = await h.call('POST', '/attendance/record', {
      token: ownerTokenA,
      body: {
        workerId: workerIdA,
        attendanceDate: yesterday,
        status: 'half_day',
        notes: 'Left early for personal work',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'half_day');
    assert.equal(res.body.data.attendanceDate, yesterday);
  });

  it('6. Lists attendance records with filter support', async () => {
    const res = await h.call('GET', `/attendance/records?workerId=${workerIdA}`, {
      token: ownerTokenA,
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length >= 2);
  });

  it('7. Worker requests salary advance and manager approves it', async () => {
    // Worker requests Rs 1,000 (100000 paise)
    const reqRes = await h.call('POST', '/attendance/advances/request', {
      token: workerTokenA,
      body: {
        amountPaise: 100000,
        reason: 'Medical emergency advance',
      },
    });
    assert.equal(reqRes.status, 201);
    assert.equal(reqRes.body.data.amountPaise, 100000);
    assert.equal(reqRes.body.data.status, 'pending');
    advanceId = reqRes.body.data.id;

    // Manager lists advances
    const listRes = await h.call('GET', '/attendance/advances?status=pending', {
      token: ownerTokenA,
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.some((a: any) => a.id === advanceId));

    // Manager approves advance
    const reviewRes = await h.call('POST', `/attendance/advances/${advanceId}/review`, {
      token: ownerTokenA,
      body: {
        status: 'approved',
        notes: 'Approved by shop manager',
      },
    });
    assert.equal(reviewRes.status, 201);
    assert.equal(reviewRes.body.data.status, 'approved');
  });

  it('8. Previews monthly payroll with attendance pro-rating and advance deductions', async () => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const res = await h.call(
      'GET',
      `/attendance/payroll/preview?workerId=${workerIdA}&periodMonth=${curMonth}&periodYear=${curYear}`,
      { token: ownerTokenA }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.workerId, workerIdA);
    assert.equal(res.body.data.baseSalaryPaise, 3500000);
    assert.equal(res.body.data.advancesDeductedPaise, 100000);
    assert.ok(res.body.data.proRatedBasePaise > 0);
  });

  it('9. Generates payroll settlement and marks advances deducted', async () => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const res = await h.call('POST', '/attendance/payroll/generate', {
      token: ownerTokenA,
      body: {
        workerId: workerIdA,
        periodMonth: curMonth,
        periodYear: curYear,
        bonusesPaise: 200000, // Rs 2,000 festival bonus
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.workerId, workerIdA);
    assert.equal(res.body.data.bonusesPaise, 200000);
    assert.equal(res.body.data.advancesDeductedPaise, 100000);
    assert.equal(res.body.data.payoutStatus, 'draft');
    settlementId = res.body.data.id;

    // Verify advance status changed to 'deducted'
    const advRes = await h.call('GET', `/attendance/advances?workerId=${workerIdA}`, {
      token: ownerTokenA,
    });
    const updatedAdv = advRes.body.data.find((a: any) => a.id === advanceId);
    assert.equal(updatedAdv.status, 'deducted');
  });

  it('10. Pays payroll settlement and automatically records shop expense', async () => {
    const res = await h.call('POST', `/attendance/payroll/${settlementId}/pay`, {
      token: ownerTokenA,
      body: {
        paymentMethod: 'bank_transfer',
        recordExpense: true,
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.payoutStatus, 'paid');
    assert.ok(res.body.data.paidAt);
    assert.ok(res.body.data.expenseId);

    // Verify expense logged in finance
    const expRes = await h.call('GET', '/finance/expenses', {
      token: ownerTokenA,
    });
    assert.equal(expRes.status, 200);
    assert.ok(expRes.body.data.items.some((e: any) => e.id === res.body.data.expenseId));
  });

  it('11. Enforces multi-tenant cross-shop isolation', async () => {
    // Shop B cannot view Shop A attendance records
    const res1 = await h.call('GET', `/attendance/records?workerId=${workerIdA}`, {
      token: ownerTokenB,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.data.length, 0); // zero rows across shops

    // Shop B cannot view or approve Shop A advances
    const res2 = await h.call('POST', `/attendance/advances/${advanceId}/review`, {
      token: ownerTokenB,
      body: { status: 'rejected' },
    });
    assert.equal(res2.status, 404);

    // Shop B cannot preview or generate payroll for Shop A worker
    const res3 = await h.call('GET', `/attendance/payroll/preview?workerId=${workerIdA}&periodMonth=1&periodYear=2026`, {
      token: ownerTokenB,
    });
    assert.equal(res3.status, 404);
  });
});
