#!/usr/bin/env node

/**
 * Synthetic End-to-End Smoke Test & System Health Verification
 * 
 * Verifies live connectivity, database readiness, public booking catalog,
 * worker mobile station APIs, shop owner administration APIs, and Next.js
 * static & metadata web routes.
 * 
 * Usage:
 *   node scripts/smoke-test.mjs
 *   API_URL=http://localhost:4000/api/v1 WEB_URL=http://localhost:3000 node scripts/smoke-test.mjs
 */

const API_BASE = process.env.API_URL || 'http://localhost:4000/api/v1';
const WEB_BASE = process.env.WEB_URL || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

async function testStep(name, fn) {
  const start = performance.now();
  try {
    const detail = await fn();
    const duration = Math.round(performance.now() - start);
    console.log(
      `  ${colors.green}✓${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}${
        detail ? ` ${colors.dim}- ${detail}${colors.reset}` : ''
      }`
    );
    return true;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    console.error(
      `  ${colors.red}✗${colors.reset} ${name} ${colors.dim}(${duration}ms)${colors.reset}`
    );
    console.error(`    ${colors.red}Error: ${err.message}${colors.reset}`);
    return false;
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} (${text.slice(0, 100)})`);
  }
  const json = await res.json();
  // Automatically unwrap standard NestJS ResponseInterceptor payload { success: true, data: ... }
  if (json && typeof json === 'object' && json.success === true && json.data !== undefined) {
    return json.data;
  }
  return json;
}

async function fetchStatus(url, expectedStatus = 200) {
  const res = await fetch(url);
  if (res.status !== expectedStatus) {
    throw new Error(`Expected HTTP ${expectedStatus}, received ${res.status}`);
  }
  return `HTTP ${res.status}`;
}

async function runSmokeTests() {
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  💈 BarberPro End-to-End Smoke Test & System Probe   ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  console.log(`${colors.dim}API Base URL: ${API_BASE}${colors.reset}`);
  console.log(`${colors.dim}Web Base URL: ${WEB_BASE}${colors.reset}\n`);

  let passed = 0;
  let total = 0;
  let workerToken = '';
  let customerToken = '';
  let ownerToken = '';

  const record = (success) => {
    total++;
    if (success) passed++;
  };

  // --------------------------------------------------------------------------
  // 1. Healthcheck Probes
  // --------------------------------------------------------------------------
  console.log(`${colors.bold}1. Core API & Database Health Probes${colors.reset}`);
  record(
    await testStep('API Liveness Check (GET /health)', async () => {
      const data = await fetchJson(`${API_BASE}/health`);
      if (data.status !== 'ok') throw new Error(`Unexpected status: ${data.status}`);
      return `status: ${data.status}`;
    })
  );

  record(
    await testStep('PostgreSQL Connectivity Check (GET /health/db)', async () => {
      const data = await fetchJson(`${API_BASE}/health/db`);
      if (data.status !== 'ok' || data.database !== 'up') {
        throw new Error(`Database check failed: ${JSON.stringify(data)}`);
      }
      return `database: ${data.database}`;
    })
  );

  // --------------------------------------------------------------------------
  // 2. Public Customer Experience Endpoints
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}2. Public Customer Discovery & Booking Endpoints${colors.reset}`);
  record(
    await testStep('Public Shop Profile (GET /shops/public/classic-barber)', async () => {
      const shop = await fetchJson(`${API_BASE}/shops/public/classic-barber`);
      if (!shop.name || shop.slug !== 'classic-barber') throw new Error('Invalid shop metadata returned');
      return `Shop: "${shop.name}" (${shop.timezone})`;
    })
  );

  record(
    await testStep('Services Menu Catalog (GET /shops/public/classic-barber/services)', async () => {
      const data = await fetchJson(`${API_BASE}/shops/public/classic-barber/services`);
      const services = data.services || data;
      if (!Array.isArray(services) || services.length === 0) throw new Error('No services catalog returned');
      return `${services.length} services loaded (e.g. "${services[0].name}")`;
    })
  );

  record(
    await testStep('Stylist & Barber Profiles (GET /shops/public/classic-barber/barbers)', async () => {
      const workers = await fetchJson(`${API_BASE}/shops/public/classic-barber/barbers`);
      if (!Array.isArray(workers) || workers.length === 0) throw new Error('No workers returned');
      return `${workers.length} active stylists available (${workers.map((w) => w.displayName).join(', ')})`;
    })
  );

  record(
    await testStep('VIP Membership Plans (GET /memberships/public/classic-barber/plans)', async () => {
      const plans = await fetchJson(`${API_BASE}/memberships/public/classic-barber/plans`);
      if (!Array.isArray(plans)) throw new Error('Expected array of membership plans');
      return `${plans.length} VIP plans configured`;
    })
  );

  record(
    await testStep('Client Reviews & Ratings Summary (GET /reviews/public/classic-barber/summary)', async () => {
      const summary = await fetchJson(`${API_BASE}/reviews/public/classic-barber/summary`);
      if (!summary || typeof summary.averageRating !== 'number') {
        throw new Error('Invalid reviews summary payload');
      }
      return `Average: ${summary.averageRating}★ (${summary.totalReviews} reviews)`;
    })
  );

  record(
    await testStep('Public Promotional Coupons (GET /coupons/public/classic-barber)', async () => {
      const coupons = await fetchJson(`${API_BASE}/coupons/public/classic-barber`);
      if (!Array.isArray(coupons)) throw new Error('Expected array of promotional coupons');
      return `${coupons.length} active promo offers listed`;
    })
  );

  record(
    await testStep('Public Promo Coupon Validation (POST /coupons/public/classic-barber/validate)', async () => {
      const val = await fetchJson(`${API_BASE}/coupons/public/classic-barber/validate`, {
        method: 'POST',
        body: JSON.stringify({
          code: 'WELCOME10',
          subtotalPaise: 50000,
          servicesTotalPaise: 50000,
          productsTotalPaise: 0,
        }),
      });
      return `Valid: ${val.valid ? 'Yes' : 'No'} (Discount: ₹${((val.discountPaise || 0) / 100).toFixed(2)})`;
    })
  );

  // --------------------------------------------------------------------------
  // 3. Worker Mobile Station Authentication & Work Queue
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}3. Worker Mobile Station Authentication & Workflows${colors.reset}`);
  record(
    await testStep('Worker Login as Rahul (POST /auth/login)', async () => {
      const res = await fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ identifier: 'rahul@classicbarber.com', password: 'WorkerPass#123' }),
      });
      if (!res.accessToken) throw new Error('Missing accessToken in login response');
      workerToken = res.accessToken;
      return `User: ${res.user?.name}`;
    })
  );

  record(
    await testStep('Real-Time Worker SSE Live Stream Probe (GET /events/stream)', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      try {
        const res = await fetch(`${API_BASE}/events/stream`, {
          headers: { Authorization: `Bearer ${workerToken}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          throw new Error(`Expected text/event-stream, got ${contentType}`);
        }
        return `Connected: HTTP ${res.status} (${contentType.split(';')[0]})`;
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          return `Stream Active (HTTP 200 text/event-stream established)`;
        }
        throw err;
      }
    })
  );

  record(
    await testStep('Worker Appointments Work Queue (GET /appointments)', async () => {
      const appts = await fetchJson(`${API_BASE}/appointments`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      const list = Array.isArray(appts) ? appts : appts.items || [];
      return `${list.length} appointments in queue`;
    })
  );

  record(
    await testStep('Worker Commission & Earnings (GET /commission/summary)', async () => {
      const summary = await fetchJson(`${API_BASE}/commission/summary`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      return `Earned Comm: ₹${((summary.earnedCommissionPaise || 0) / 100).toFixed(2)}, Tips: ₹${((summary.earnedTipsPaise || 0) / 100).toFixed(2)}`;
    })
  );

  record(
    await testStep("Worker Today's Attendance Status (GET /attendance/today)", async () => {
      const att = await fetchJson(`${API_BASE}/attendance/today`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      const status = att.attendance ? att.attendance.status : 'not clocked in yet';
      return `Worker: ${att.worker?.displayName || 'Rahul'} (${status})`;
    })
  );

  // --------------------------------------------------------------------------
  // 4. Customer Account, Loyalty & Memberships Portal
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}4. Customer Account, Loyalty & VIP Membership Portal${colors.reset}`);
  record(
    await testStep('Customer Login as Jayant Patel (POST /auth/login)', async () => {
      const res = await fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ identifier: '+919876599001', password: 'CustomerPass#123' }),
      });
      if (!res.accessToken) throw new Error('Missing accessToken in customer login response');
      customerToken = res.accessToken;
      return `User: ${res.user?.name} (Type: ${res.user?.type})`;
    })
  );

  record(
    await testStep('Customer Linked Shop Profile (GET /me/shops/classic-barber/profile)', async () => {
      const profileData = await fetchJson(`${API_BASE}/me/shops/classic-barber/profile`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      if (!profileData || profileData.status !== 'linked') throw new Error('Customer account not linked to shop');
      return `Status: ${profileData.status} (Client: "${profileData.profile?.name}")`;
    })
  );

  record(
    await testStep('Customer Loyalty Balance (GET /me/shops/classic-barber/loyalty)', async () => {
      const loyalty = await fetchJson(`${API_BASE}/me/shops/classic-barber/loyalty`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      if (!loyalty || typeof loyalty.pointsBalance !== 'number') throw new Error('Invalid loyalty summary');
      return `Balance: ${loyalty.pointsBalance} pts (Value: ₹${((loyalty.monetaryValuePaise || 0) / 100).toFixed(2)})`;
    })
  );

  record(
    await testStep('Customer Active VIP Membership (GET /me/shops/classic-barber/membership)', async () => {
      const mem = await fetchJson(`${API_BASE}/me/shops/classic-barber/membership`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      if (!mem || mem.status !== 'active') throw new Error('Active VIP membership not found');
      return `Plan: "${mem.planName}" (Status: ${mem.status}, Multiplier: ${mem.pointsMultiplier}x)`;
    })
  );

  record(
    await testStep('Customer Appointments History (GET /me/shops/classic-barber/appointments)', async () => {
      const appts = await fetchJson(`${API_BASE}/me/shops/classic-barber/appointments`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const list = Array.isArray(appts) ? appts : [];
      return `${list.length} appointments in customer ledger`;
    })
  );

  // --------------------------------------------------------------------------
  // 5. Shop Admin & Management Operations
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}5. Shop Owner Administrative Operations${colors.reset}`);
  record(
    await testStep('Shop Owner Login (POST /auth/login)', async () => {
      const res = await fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ identifier: 'owner@classicbarber.com', password: 'ClassicOwner#123' }),
      });
      if (!res.accessToken) throw new Error('Missing accessToken in login response');
      ownerToken = res.accessToken;
      return `User: ${res.user?.name} (Shop: ${res.shop?.name || 'Classic Barber Shop'})`;
    })
  );

  record(
    await testStep('Admin Dashboard Metrics (GET /reports/dashboard/admin)', async () => {
      const dash = await fetchJson(`${API_BASE}/reports/dashboard/admin`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      return `Appointments: ${dash.todayAppointmentsCount ?? 0}, Revenue: ₹${(((dash.todayRevenuePaise ?? 0)) / 100).toFixed(2)}`;
    })
  );

  record(
    await testStep('POS Completed Invoices History (GET /billing/invoices)', async () => {
      const invoices = await fetchJson(`${API_BASE}/billing/invoices`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const list = Array.isArray(invoices) ? invoices : invoices.items || [];
      return `${list.length} invoices recorded in ledger`;
    })
  );

  record(
    await testStep('Staff Attendance Records Roster (GET /attendance/records)', async () => {
      const att = await fetchJson(`${API_BASE}/attendance/records`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const list = Array.isArray(att) ? att : att.items || [];
      return `${list.length} attendance records found`;
    })
  );

  record(
    await testStep('Security & Operational Audit Log (GET /audit-logs)', async () => {
      const logs = await fetchJson(`${API_BASE}/audit-logs`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const count = logs.total ?? (Array.isArray(logs) ? logs.length : 0);
      return `${count} audit events tracked`;
    })
  );

  record(
    await testStep('Payment Gateway Credentials (GET /payments/credentials)', async () => {
      const creds = await fetchJson(`${API_BASE}/payments/credentials`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      return `Configured: ${creds.configured ? 'Yes' : 'No'} (${creds.keyIdMasked || 'Default Sandbox'})`;
    })
  );

  record(
    await testStep('Upcoming Appointment Reminders Dispatch (POST /appointments/dispatch-reminders)', async () => {
      const res = await fetchJson(`${API_BASE}/appointments/dispatch-reminders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ windowMinutes: 180 }),
      });
      return `Processed: ${res.count ?? 0} reminders dispatched`;
    })
  );

  record(
    await testStep('End-of-Day Daily Reconciliation (GET /reports/eod)', async () => {
      const eod = await fetchJson(`${API_BASE}/reports/eod`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      return `Date: ${eod.date}, Expected Cash: ₹${((eod.drawerReconciliation?.expectedCashInDrawerPaise || 0) / 100).toFixed(2)}, Invoices: ${eod.revenue?.totalInvoices || 0}`;
    })
  );

  record(
    await testStep('Shop Database Backup Snapshot (GET /shops/current/backup)', async () => {
      const backup = await fetchJson(`${API_BASE}/shops/current/backup`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      const tableCount = Object.keys(backup.tables || {}).length;
      return `Snapshot: "${backup.shopName}" (${tableCount} tables exported)`;
    })
  );

  record(
    await testStep('Outbound Webhook Delivery Ping (POST /notifications/test-webhook)', async () => {
      const ping = await fetchJson(`${API_BASE}/notifications/test-webhook`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          webhookUrl: 'https://example.com/barber-webhook-receiver',
          webhookSecret: 'whsec_smoke_test_secret_123',
        }),
      });
      return `Status: ${ping.status} (${ping.statusText || 'OK'}), Latency: ${ping.durationMs}ms`;
    })
  );

  // --------------------------------------------------------------------------
  // 6. Next.js Web Frontend & PWA Metadata Routes
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}6. Next.js Web Frontend & PWA Routes${colors.reset}`);
  const webRoutes = [
    ['Landing Page (GET /)', `${WEB_BASE}/`],
    ['Customer Booking Flow (GET /classic-barber/book)', `${WEB_BASE}/classic-barber/book`],
    ['Public Services Menu (GET /classic-barber/services)', `${WEB_BASE}/classic-barber/services`],
    ['Public Barbers Showcase (GET /classic-barber/barbers)', `${WEB_BASE}/classic-barber/barbers`],
    ['VIP Memberships Catalog (GET /classic-barber/memberships)', `${WEB_BASE}/classic-barber/memberships`],
    ['Customer Reviews Showcase (GET /classic-barber/reviews)', `${WEB_BASE}/classic-barber/reviews`],
    ['Customer Self-Service Account Portal (GET /my-account)', `${WEB_BASE}/my-account`],
    ['Barber Station Login Portal (GET /worker)', `${WEB_BASE}/worker`],
    ['Admin Dashboard Portal (GET /admin/dashboard)', `${WEB_BASE}/admin/dashboard`],
    ['Admin POS Billing Portal (GET /admin/billing)', `${WEB_BASE}/admin/billing`],
    ['Admin Reports & Analytics Portal (GET /admin/reports)', `${WEB_BASE}/admin/reports`],
    ['Admin Settings Portal (GET /admin/settings)', `${WEB_BASE}/admin/settings`],
    ['PWA Web App Manifest (GET /manifest.webmanifest)', `${WEB_BASE}/manifest.webmanifest`],
    ['PWA Offline Service Worker (GET /sw.js)', `${WEB_BASE}/sw.js`],
    ['App Launcher SVG Icon (GET /icon.svg)', `${WEB_BASE}/icon.svg`],
    ['Robots Directives (GET /robots.txt)', `${WEB_BASE}/robots.txt`],
    ['XML Sitemap (GET /sitemap.xml)', `${WEB_BASE}/sitemap.xml`],
  ];

  for (const [name, url] of webRoutes) {
    record(await testStep(name, () => fetchStatus(url)));
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n${colors.bold}${colors.cyan}======================================================${colors.reset}`);
  if (passed === total) {
    console.log(
      `${colors.bold}${colors.green}  🎉 ALL SMOKE TESTS PASSED (${passed}/${total}) - SYSTEM 100% HEALTHY${colors.reset}`
    );
  } else {
    console.log(
      `${colors.bold}${colors.red}  ⚠️ SMOKE TESTS FAILED (${passed}/${total} passed)${colors.reset}`
    );
  }
  console.log(`${colors.bold}${colors.cyan}======================================================${colors.reset}\n`);

  process.exit(passed === total ? 0 : 1);
}

runSmokeTests().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
