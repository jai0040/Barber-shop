# Technical decisions (beyond business requirements)

D1–D13 are in the Phase 0 plan. Added in Phase 2:

- **D14 SQL migrations + `pg` instead of Prisma.** RLS, exclusion constraints (anti double-booking) and the income view
  can't be expressed in Prisma schema, and raw SQL migrations are verifiable in CI. Migrations live in `apps/api/migrations`.
- **D15 Two DB roles.** Migrations run as the schema owner; the API runs as `barber_app` (no superuser / BYPASSRLS).
  The API refuses to start in production if its role can bypass RLS.
- **D16 Tenant context = RLS.** All tenant tables use `FORCE ROW LEVEL SECURITY` keyed on `app.shop_id`, set per
  transaction by `Db.tenant()`. No context => zero rows. `users`/`refresh_tokens` are global identity tables and are
  scoped in code (`WHERE shop_id = …`); all business tables are RLS-protected.
- **D17 Permission scope.** `role_permissions.scope` is `all` or `own`. The guard grants access; services apply ownership filtering.
  Owner role is implicit "everything" (new permissions reach owners automatically).
- **D18 Secure-by-default routes.** A route must declare `@Public`, `@Authenticated`, `@PlatformOnly` or
  `@RequirePermission(...)` or it is refused. Guard order: rate-limit → auth → CSRF → permission.
- **D19 Anti-escalation.** Non-owners can only grant permissions they hold, can't assign/modify Owners, can't edit their own roles.
- **D20 Sessions.** 15-min JWT access token + rotating opaque refresh token (HMAC-hashed in DB, reuse = family revoked),
  httpOnly cookies + double-submit CSRF token. Bearer header supported for API clients. 5 failed logins => 15-min lock.
- **D21 Identity.** One global `users` identity; phone and email are globally unique (a barber's number can't also be a customer account).
  Per-shop customer records arrive in Phase 5.
- **D22 Cancellation rule (per your answer).** After a customer cancels, they can't book for `cancellation_cooldown_hours` (default 24).
  Stored in `shops.settings`; enforced in Phase 6. Advance-booking window `advance_booking_days` default 30 (configurable).
- Known trade-off: two browser tabs refreshing simultaneously can trip reuse detection; the web app will serialise refreshes.

## Phase 3
- **D23 Public reads via RLS, not bypass.** Customer-facing shop pages use `Db.tenant({publicRead:true})`: a SELECT-only policy
  for *active* shops, their hours and the logo file. No writes, no roles/users/audit/QR visibility. Sensitive fields (GST no., settings,
  QR) are additionally omitted in code.
- **D24 Images are re-encoded, never stored as uploaded.** Real decoding (magic bytes, not filename/MIME), JPG/PNG/WebP only (SVG refused),
  pixel-bomb limit, EXIF stripped. Logo -> WebP <=512px; UPI QR -> lossless PNG <=1024px. Random server-side storage keys;
  `StorageService` is the seam for S3 later.
- **D25 UPI QR is private.** Served only to staff holding settings.manage / payments.record / billing.create, `Cache-Control: private, no-store`.
- **D26 Business hours:** one opening window per ISO weekday (1=Mon..7=Sun), `time` columns, shop-local (timezone on the shop). A shop with no hours saved is
  treated as closed; setup checklist flags it. Break windows are per-worker (Phase 4).
- **D27 Files can't cross shops:** composite FK `(file_id, shop_id)`; shop pointer columns use `ON DELETE SET NULL (col)`.

## Phase 4 (delivered in parts 4A–4D)
- **D28 Catalog (4A).** Services have `price_paise` (integer), `duration_min` (5–480), status active/inactive, and are archived, never deleted.
  Active names are unique per shop (case-insensitive); archived names can be reused. Price/duration changes are audited with old/new values;
  appointments and invoices snapshot price and duration (D5/D46), so history never changes. Editing an archived service is refused (restore first).
- **D29 Public catalog.** The customer site reads services through an RLS `public_read` policy (active shop, active & non-archived service only, SELECT only).
- **D30 Workers (4B).** A worker profile may exist without a login, be given one later, or link an existing staff account (e.g. an owner who also cuts hair).
  Creating a worker + login is ONE transaction (all-or-nothing) and goes through the same role-escalation checks as `/users`.
  A DB composite FK `(user_id, shop_id)` makes a cross-shop login link impossible.
- **D31 Archive = soft delete.** Archiving disables the worker's login and kills their sessions, EXCEPT when the login is an Owner (so a shop can't lock itself out).
  Restore re-enables it. You can't archive your own profile.
- **D32 Own scope.** `workers.view: own` shows a worker only their profile (others return 404, not 403). Editing profile/photo/login/archive always needs scope `all`;
  the Worker template gets `workers.view: own`. (Existing shops keep their old role data; roles are data, templates only seed NEW shops.)
- **D33 Worker photos** reuse the Phase 3 image pipeline (decoded + re-encoded, EXIF stripped, 256x256 WebP) and are public only while the worker is active.
