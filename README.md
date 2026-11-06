# Barber Shop Management Software 💈

A production-ready, mobile-first, multi-tenant barber shop management platform designed for modern salons and barber shops.

---

## 🌟 Features & Systems

- **Customer Appointment Management**:
  - Mobile-first responsive customer booking flow (`/[slug]/book`).
  - Deep-link query parameter preselection support for services and preferred barbers (`/[slug]/book?serviceId=...&workerId=...`).
  - Multi-service selection with cumulative duration & price calculation.
  - Preferred barber selection or **"Any Available Barber"** automated slot matching.
  - 15-minute slot generator adhering to shop hours, worker shifts, lunch/tea breaks, time-offs, and existing bookings.
  - Full appointment lifecycle: `booked` $\rightarrow$ `confirmed` $\rightarrow$ `checked_in` $\rightarrow$ `in_service` $\rightarrow$ `completed`, plus `cancelled`, `no_show`, and `rescheduled`.
  - Immutable service price & duration snapshots at time of booking.
  - Append-only status audit log with timestamps and notes.
  - On-chair **"+ Add Service"** add-ons without duplicate appointments.
  - Customer self-service online cancellation (`/my-account` -> `POST /me/shops/:slug/appointments/:id/cancel`) enforcing the shop's configurable cancellation cooldown window (`cancellation_cooldown_hours`), automatically releasing the booked chair slot, updating status history, and dispatching in-app alerts to salon staff.
  - Automated upcoming appointment reminder dispatch engine (`POST /appointments/dispatch-reminders`) and 1-click admin trigger (`/admin/appointments`) broadcasting in-app and WhatsApp reminders for appointments within upcoming service windows.
  - Walk-in support with admin barber assignment.

- **Services Catalog & Stylist Matrix (Sections 7, 8 & 71)**:
  - Custom category management hub (create, rename, and safe deletion of empty categories).
  - Service price (in integer paise), duration (in minutes), description, and active/archived lifecycle controls (`/admin/services`).
  - Direct Stylist-to-Service capability assignment modal (`PUT /services/:id/workers`) with *Select All* and *Clear All* controls.
  - 1-click UTF-8 BOM CSV catalog export.

- **Customer Loyalty Points Program (Phase 2)**:
  - Configurable shop earn rates (`earn_per_rupee_paise`) and point redemption values (`point_value_paise`).
  - Configurable minimum redemption thresholds and maximum bill percentage coverage limits.
  - Append-only `customer_loyalty_ledger` (`earn_invoice`, `redeem_invoice`, `manual_adjustment`, `membership_bonus`, `welcome_bonus`, `reversal`).
  - Real-time POS points redemption with automatic balance checks.
  - Automatic loyalty points award upon full invoice payment.
  - Automatic ledger reversal and point refunding upon invoice voiding.

- **Membership Plans & VIP Subscriptions (Phase 2)**:
  - Multi-tier membership plans (e.g. VIP Grooming Pass) with custom durations (monthly, quarterly, annual).
  - Service & product percentage discounts with 1-click POS auto-calculation.
  - Bonus points multiplier on every invoice payment.
  - Included complimentary services quota (e.g., 2 free haircuts/month) with real-time remaining quota tracking.
  - 1-click complimentary service redemption directly at the POS billing terminal.
  - Public membership plan catalog (`/[slug]/memberships`) and customer self-service dashboard (`/my-account`).
  - Full admin management portal (`/admin/memberships`) for plans, subscriptions, and manual point adjustments.

- **Staff Commission & Tip Payout Ledger (Phase 3)**:
  - Configurable service commission (`commission_rate_percent`) and retail product commission (`product_commission_rate_percent`) per worker.
  - Tip recording during in-shop POS checkout (`tip_paise`), added to invoice grand total and credited 100% directly to the assigned worker.
  - Append-only `worker_commission_ledger` (`service_commission`, `product_commission`, `tip`, `manual_adjustment`, `payout`, `reversal`) with RLS isolation.
  - Automatic commission & tip accrual upon invoice payment in `BillingService`.
  - Automatic reversal of earned commissions and tips if an invoice is voided.
  - Payout settlements (`worker_payouts`) with optional automatic shop expense logging under `Salaries & Commissions`.
  - Barber self-service earnings card (`/worker`), POS billing tip selector (`/admin/billing`), admin finance payroll ledger and payout settlement modal (`/admin/finance`), and worker commission rate configuration (`/admin/workers`).

- **Promotional Offers & Discount Coupon Engine (Phase 4)**:
  - Promo code management (`/admin/coupons`) supporting percentage discounts with optional caps and flat discounts in paise.
  - Configurable minimum order values, expiration dates, total usage caps, and per-customer usage limits.
  - Category-scoped applicability (`all`, `services_only`, `products_only`).
  - Real-time POS checkout validation and 1-click apply widget (`/admin/billing`).
  - Append-only `coupon_redemptions` ledger with PostgreSQL RLS and automatic immutable reversal tracking upon invoice voiding.

- **Staff Attendance & Salary / Advance Engine (Phase 5)**:
  - Daily worker shift clock-in and clock-out with status (`present`, `half_day`, `on_leave`, `absent`).
  - Configurable monthly basic salary per barber with pro-rated base salary calculations based on attendance.
  - Salary advance request, approval/rejection workflow, and automated settlement deduction.
  - 1-click barber attendance controls and advance requests on the mobile barber station (`/worker`).
  - Comprehensive shop admin attendance board, logs, advance review, and monthly payroll sheet generator (`/admin/attendance`).
  - Automated expense recording under `Salaries & Commissions` upon payroll settlement disbursement.

- **Customer Reviews & Ratings Engine (Phase 6)**:
  - Post-appointment customer review submission with 1–5 star overall ratings, individual barber ratings, and comments.
  - Anti-duplicate review guarantee per appointment; rejects reviews for non-completed appointments.
  - Public reviews showcase (`/[slug]/reviews`) with rating breakdown, distribution bars, verified client badges, and owner replies.
  - Admin review moderation board (`/admin/reviews`) with publish, hide, flag controls, and 1-click owner replies.
  - Customer self-service "Rate & Review" modal directly on past completed visits (`/my-account`).

- **In-System Notifications & WhatsApp Alert Engine (Phase 7)**:
  - Real-time in-app alert dispatcher with unread badge counter in admin header (`NotificationBell`).
  - Automated event trigger hooks for new bookings, appointment confirmations, status changes, POS payments, low-stock alerts, and 5-star customer reviews.
  - Ready-to-send click-to-chat WhatsApp deep links (`https://wa.me/...`) for digital receipts and appointment confirmations.
  - Customer portal alerts and 1-click WhatsApp share buttons on appointment records (`/my-account`).

- **Online Payment Gateway & Razorpay Integration (Phase 8)**:
  - Server-side Razorpay order generation (`POST /payments/razorpay/create-order`) linked to unpaid shop invoices.
  - Cryptographic HMAC-SHA256 signature verification (`POST /payments/razorpay/verify`) with atomic invoice status update and receipt dispatch.
  - Webhook callback listener (`POST /payments/razorpay/webhook`) for asynchronous payment capture notifications.
  - Shop-level Razorpay key and secret credentials management (`PATCH /payments/credentials`).
  - Integrated 3-way checkout selector on the POS terminal (`/admin/billing`): Cash (with change calculator), UPI QR, and Online Payment Gateway.

- **CSV Data Export Engine (Sections 36 & 67)**:
  - 1-click client-side CSV report export across all 13 administrative data tables.
  - UTF-8 BOM encoding ensures proper spreadsheet formatting across Excel, Google Sheets, and LibreOffice without mojibake.
  - Export capabilities on Reports & Analytics (`/admin/reports`): Sales & Category Breakdown, Stylist Productivity, Inventory Asset Valuation, and Finance summaries.
  - Export capabilities on Finance & Payroll (`/admin/finance`): Operational Expense Ledger and Staff Commission / Payout Ledgers.
  - Export capabilities on Point of Sale & Invoices (`/admin/billing`): Completed invoice history ledger with customer, stylist, items, discounts, tips, totals, and payment status.
  - Export capabilities on Customer Profiles (`/admin/customers`): Complete customer directory, visit history, and notes.
  - Export capabilities on Promotional Coupons (`/admin/coupons`): Promo code directory, discount rules, caps, redemptions, and expiry.
  - Export capabilities on Inventory (`/admin/inventory`): Product catalog, SKU, stock quantities, valuations, and low-stock thresholds.
  - Export capabilities on Staff Attendance & Payroll (`/admin/attendance`): Today's attendance board, historical logs, salary advances, and monthly payroll sheets.
  - Export capabilities on Appointments (`/admin/appointments`): Daily and filtered appointments with times, customer contacts, assigned barbers, services, and amounts.
  - Export capabilities on Services Catalog (`/admin/services`): Full service catalog with categories, durations, prices, and assigned stylists count.
  - Export capabilities on Staff & Barbers (`/admin/workers`): Barber directory, contact numbers, commission rates, base salaries, and skills count.
  - Export capabilities on Customer Reviews (`/admin/reviews`): Verified testimonials, ratings, and owner responses.
  - Export capabilities on Memberships & Loyalty (`/admin/memberships`): VIP membership plans, discount rules, points multipliers, and active subscriber rosters.
  - Export capabilities on Security & Activity Audit Trail (`/admin/audit`): Security and operational event logs with actor, action, entity, and timestamp.

- **Multi-Location & Branch Switcher (Section 85)**:
  - Multi-branch extensible architecture enabling unified owner management across multiple shop locations.
  - Interactive Branch Location switcher dropdown in `AdminLayout` header and sidebar.
  - Instant location context switching between flagship and branch stores (e.g., Indiranagar Flagship vs. Koramangala Branch).

- **Security & Activity Audit Trail (Section 41)**:
  - Append-only audit logging of all sensitive administrative and operational activities (`audit_logs` table with PostgreSQL RLS).
  - Tracks user actor, action type, entity, timestamp, IP address, and precise old-versus-new JSON diffs.
  - Comprehensive admin portal (`/admin/audit`) with action badges, entity filtering, pagination, expandable diff viewer, and CSV report export.

- **Progressive Web App (PWA) & Mobile Installation (Phase 9)**:
  - Next.js 14 Web Manifest (`/manifest.webmanifest`) configured with `display: 'standalone'`, theme color `#d97706`, and dark navy background `#020617`.
  - Amber/gold gradient vector icon (`/icon.svg`) serving as high-resolution favicon and mobile home screen launcher badge.
  - iOS-native standalone meta tags (`appleWebApp: { capable: true, statusBarStyle: 'black-translucent' }`).
  - **PWA Offline Service Worker & Connectivity Sentinel**: Dedicated service worker (`/sw.js`) pre-caching app shell assets and static chunks with a real-time network connectivity sentinel (`PwaRegister`) that notifies staff with floating offline/reconnected status pills.

- **SEO Directives & Crawling Metadata (Phase 9)**:
  - Dynamic `robots.txt` (`/robots.txt`) granting full crawling access to public shop catalogs, services, and booking flows while protecting private portals (`/admin/`, `/worker/`, `/auth/`, `/my-account/`).
  - Dynamic XML Sitemap (`/sitemap.xml`) indexing all public customer booking and discovery pages.

- **Automated Backup & Recovery Engine (Section 72)**:
  - Production CLI utility (`npm run backup`) backing up all 43 tenant and system PostgreSQL tables into timestamped JSON snapshots in strict foreign-key dependency order.
  - Atomic database restoration utility (`npm run restore <file>`) with transaction rollback protection.
  - **1-Click Shop Backup & Offline Archival**: Admin self-service database snapshot exporter (`/admin/settings` -> `GET /api/v1/shops/current/backup`) delivering a downloadable JSON archive containing all 35 tenant-isolated database tables with row counts and cryptographic audit tracking.

- **Worker & Barber Station**:
  - Dedicated mobile-friendly worker queue (`/worker`).
  - Worker-service capability matrix (barbers only assigned to services they can perform).
  - 7-day shifts, breaks, and time-off calendar.
  - Live station controls: Check In, Start Service, Add On-Chair Service, Mark Completed.
  - Strict privacy: Barbers only see their own work queue, clients, and performance summary.

- **Billing & POS System**:
  - Fast in-shop checkout for completed appointments and retail walk-ins (`/admin/billing`).
  - Integrated VIP Membership benefits, complimentary inclusions, and loyalty points redemption.
  - Integer paise precision ($1\text{ INR} = 100\text{ paise}$) preventing floating-point rounding errors.
  - Discount calculator (flat discounts, VIP membership discounts, and loyalty points).
  - Cash payment calculator with automatic change return display.
  - High-contrast UPI QR modal (`upi://pay?...`) for fast scanning.
  - **POS 80mm Thermal Receipt Printing Engine**: Native `@media print` layout formatting receipts for 80mm roll printers while hiding all application chrome; includes GSTIN, itemized breakdown, discounts, tips, payment method, and cashier sign-off.
  - Completed Invoices History ledger with search, status filters (`paid`, `void`), and 1-click UTF-8 BOM CSV export.
  - Interactive Invoice Details Inspector modal with full line item breakdown (services vs retail products, quantities, prices, discounts, tips).
  - 1-click Invoice Voiding workflow (`POST /billing/invoices/:id/void`) that atomically restores inventory product stock, reverses customer loyalty points, and deducts earned staff commissions.
  - Printable / downloadable invoice summaries.

- **Products & Inventory**:
  - SKU tracking, cost price vs selling price, stock quantities, and low-stock threshold triggers (`/admin/inventory`).
  - Atomic stock deductions upon retail checkout.
  - Stock-in, adjustment, damage, and wastage tracking.

- **Finance & P&L Ledger**:
  - Operating expense tracking with custom categories (Rent, Utilities, Salaries, Supplies) (`/admin/finance`).
  - Automated ledger entry for inventory purchases.
  - Real-time net profit/loss calculation (Revenue − Expenses).
  - **End-of-Day (EOD) Daily Cash & Drawer Reconciliation Report**: Complete closing sheet (`/reports/eod` -> `/admin/reports`) itemizing Expected Cash in Drawer, UPI QR, and online gateway receipts against gross sales, discounts, tips, stylist commissions, and petty expenses disbursed with 1-click printable sheet and CSV export.

- **Role-Based Access Control (RBAC)**:
  - Six granular roles: Platform Super Admin, Shop Owner / Main Admin, Manager, Worker, Cashier, Inventory Manager.
  - Server-side `@RequirePermission(...)` authorization guards on all API routes.
  - Anti-privilege escalation safeguards.

- **Multi-Tenant Architecture**:
  - PostgreSQL Row-Level Security (RLS) enforces `shop_id = app_shop_id()` at the database engine level across all core and loyalty/membership tables.
  - Shop A and Shop B data are strictly isolated.
  - `btree_gist` exclusion constraint prevents overlapping bookings for the same barber under high concurrency.

---

## 🚀 Quickstart (One Command)

### Prerequisites
- **Node.js**: v20+ (tested on Node v26)
- **npm**: v10+

> **Note**: No external Docker or PostgreSQL installation is required for development. The platform includes an embedded PostgreSQL engine (`embedded-postgres`) that initializes automatically on port `5432`.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend API & Database
```bash
npm run dev:api
```
This single command automatically:
1. Boots embedded PostgreSQL on port `5432` with data stored in `.data/postgres/`.
2. Applies all database migrations (`001_core.sql` through `009_coupons_offers.sql`).
3. Seeds comprehensive demo data for **Classic Barber Shop** (including loyalty rules, VIP plans, barber commission rates, promotional coupons, and customer balances).
4. Starts the NestJS API on **`http://localhost:4000/api/v1`**.

### 3. Start the Web Frontend
In a separate terminal:
```bash
npm run dev:web
```
Starts the Next.js 14 App Router on **`http://localhost:3000`**.

---

## 🔑 Demo Logins & Credentials

### 1. Shop Owner / Administrator
- **Email**: `owner@classicbarber.com`
- **Password**: `ClassicOwner#123`
- **Access**: Full shop administrative permissions across all panels.

### 2. Barbers / Workers
- **Rahul**: `rahul@classicbarber.com` / `WorkerPass#123` *(Skills: Haircut, Beard Trim, Combo)*
- **Amit**: `amit@classicbarber.com` / `WorkerPass#123` *(Skills: Haircut, Beard Trim, Combo, Hair Spa)*
- **Raj**: `raj@classicbarber.com` / `WorkerPass#123` *(Skills: Haircut, Hair Spa)*

### 3. Customer Accounts (With Loyalty & Memberships)
- **Jayant Patel**: `jayant@example.com` / `CustomerPass#123` *(Balance: 150 Loyalty Pts | VIP Grooming Pass Subscriber)*
- **Rohit Sharma**: `rohit@example.com` / `CustomerPass#123` *(Balance: 60 Loyalty Pts)*

---

## 🗺️ Application Routes

### Customer Portal
- `http://localhost:3000/classic-barber/book` — 4-step mobile booking flow.
- `http://localhost:3000/classic-barber/services` — Public service menu with prices and categories.
- `http://localhost:3000/classic-barber/memberships` — Public VIP membership plans & perks catalog.
- `http://localhost:3000/classic-barber/reviews` — Public customer reviews, star breakdown, and owner replies.
- `http://localhost:3000/classic-barber/barbers` — Public barber team profiles and capabilities.
- `http://localhost:3000/classic-barber/products` — In-shop retail product catalog.
- `http://localhost:3000/my-account` — Customer self-service appointments, loyalty points balance, active VIP membership status, and Rate & Review modal.

### Worker Station
- `http://localhost:3000/worker` — Barber chair queue, status transitions, and on-chair service additions.

### Shop Admin Panel
- `http://localhost:3000/admin/dashboard` — Daily overview metrics (appointments, active chair, revenue).
- `http://localhost:3000/admin/appointments` — Calendar / list appointment manager & walk-in assignment.
- `http://localhost:3000/admin/billing` — Point of Sale (POS) checkout, VIP perks, loyalty point redemption, promo coupon codes, cash change, and UPI QR.
- `http://localhost:3000/admin/attendance` — Staff daily attendance board, logs, salary advances, and monthly payroll sheets.
- `http://localhost:3000/admin/reviews` — Customer review moderation board and owner reply composer.
- `http://localhost:3000/admin/coupons` — Promotional coupon codes, campaign rules, limits, and redemptions.
- `http://localhost:3000/admin/memberships` — VIP Membership plans, customer subscriptions, loyalty configuration, and manual points adjustments.
- `http://localhost:3000/admin/customers` — Client directory, service history, and notes.
- `http://localhost:3000/admin/inventory` — Product catalog, stock levels, adjustments, and low-stock alerts.
- `http://localhost:3000/admin/finance` — Income, expense categories, and net profit ledger.
- `http://localhost:3000/admin/reports` — Multi-dimensional revenue, barber performance, and service analytics.
- `http://localhost:3000/admin/services` — Service catalog management (categories, prices, durations).
- `http://localhost:3000/admin/workers` — Worker profiles, credentials, service mappings, and schedules.
- `http://localhost:3000/admin/settings` — Shop business hours, logo upload, and cancellation cooldown settings.
- `http://localhost:3000/admin/audit` — Append-only security audit trail, old/new value diff viewer, and CSV report export.

---

## 🧪 Automated Test Suites

The test suite runs with a self-contained embedded database:
```bash
npm test
```

### End-to-End System Smoke Probe (37 Probes)
Verify full system health, live database readiness, worker queues, owner reports, payment credentials, backup export, and Next.js static metadata routes against running instances:
```bash
npm run smoke-test
```

### Test Coverage (100% Passing — 315 / 315 Tests across 22 Suites)
1. `appointments-db.test.ts` — `btree_gist` anti-double-booking exclusion constraint, 10-tx race condition, immutable price snapshots, append-only status log.
2. `appointments.test.ts` — End-to-end booking lifecycle, on-chair "+ Add Service", "Any Available Barber" assignment, cross-tenant isolation.
3. `attendance-salary.test.ts` — Shift clock-in/out, historical overrides, base salary configuration, advance approvals, pro-rated payroll calculation, automatic expense logging, and cross-shop isolation.
4. `audit-trail.test.ts` — Section 41 security & activity audit trail, action & entity filtering, old/new value JSON diffs, RBAC view permission, and cross-shop isolation.
5. `auth-rbac.test.ts` — Granular RBAC permission enforcement, Argon2 password hashing, refresh token family rotation, CSRF cookie security, escalation prevention.
6. `billing-products-finance.test.ts` — Inventory stock-in, damage adjustments, POS checkout, cash change calculation, UPI QR, and net result ledger.
7. `catalog.test.ts` — Service categories, integer paise validation, price history audit, active/archived state, public catalog grouping.
8. `commission-payroll.test.ts` — Service & product commission auto-accrual, POS checkout tips, payout settlements, ledger reversals upon voiding, RBAC `own` scope enforcement, and tenant isolation.
9. `coupons-offers.test.ts` — Promotional coupon validation, percentage caps & flat discounts, category-scoped rules, usage limits, per-customer caps, and immutable ledger reversal upon voiding.
10. `customers.test.ts` — E.164 phone normalization, pending account linking, owner/manager vs worker "own" scope, self-service profile.
11. `eligibility.test.ts` — Real-time worker capability matching, timezone-aware boundaries, multi-service duration checking, public barbers endpoint.
12. `loyalty-memberships.test.ts` — Loyalty settings, balance summaries, manual points adjustments, POS checkout point redemptions, VIP membership creation, subscription management, complimentary quota tracking, and multi-tenant isolation.
13. `notifications-alerts.test.ts` — In-system notifications, unread counts, WhatsApp click-to-chat links, event hooks for bookings/status/payments/stock/reviews, customer portal receipts, and tenant isolation.
14. `payment-gateway.test.ts` — Razorpay online orders, HMAC-SHA256 signature verification, webhook handling, shop credentials update, and cross-shop payment isolation.
15. `ratelimit.test.ts` — Brute-force protection, HTTP 429 Too Many Requests enforcement.
16. `reports-dashboards.test.ts` — Owner/Admin dashboard metrics, Worker personal work queue, multi-dimensional business reports.
17. `reviews-ratings.test.ts` — Customer 1–5 star reviews, duplicate prevention, public ratings summary, barber feedback, owner replies, moderation, and tenant isolation.
18. `schedule.test.ts` — 7-day shifts, lunch/tea breaks, time-off overlap, "copy shop hours", worker-service capability mapping.
19. `secure-by-default.test.ts` — Least privilege DB role restrictions, defense-in-depth isolation.
20. `services-workers.test.ts` — Worker creation with login, service capability assignment, 15-min increment slot generator, shift bounds.
21. `shops.test.ts` — Shop setup wizard, business hours, cancellation cooldown, EXIF-stripped WebP logo upload, private UPI QR.
22. `workers.test.ts` — Atomic worker+user provisioning, manager vs owner safeguards, 256x256 WebP profile photos.

---

## 🏗️ Production Build

To compile all workspaces:
```bash
npm run build
```
Builds:
- `@barbershop/shared`: TypeScript types, validation schemas, and constants.
- `@barbershop/api`: NestJS API compiled to JavaScript (`apps/api/dist`).
- `@barbershop/web`: Next.js 14 App Router production bundle (`apps/web/.next`).

### Production Docker Orchestration
To deploy the full container stack (PostgreSQL 16 + NestJS API + Next.js Standalone web frontend) with automated container healthcheck supervision:
```bash
npm run docker:prod
```
Or manually via Docker Compose:
```bash
docker compose -f docker-compose.prod.yml up --build -d
```

---

## 📐 Technical Decisions Reference

Full architectural decisions (D1 through D50) are detailed in [docs/DECISIONS.md](docs/DECISIONS.md).
