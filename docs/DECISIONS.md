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
- **D34 Mapping (4C).** `worker_services` is editable from either side (`PUT /workers/:id/services`, `PUT /services/:id/workers`); each call REPLACES the set
  atomically. Archived workers/services and anything from another shop are rejected (the whole request rolls back). Only managers/owners may change skills.
- **D35 Availability (4C).** One window per ISO weekday + one optional break, validated in the API and by a DB CHECK. A worker with NO rows is not bookable.
  "Copy shop hours" copies once (not a live link). Saving hours outside shop hours is allowed but returns warnings; the booking engine always intersects with shop hours.
- **D36 Time off (4C).** Instants must carry a UTC offset (never interpreted in the server timezone), max one year. Own scope (`workers.update: own`) lets a barber manage only
  their own availability/time off; skills, profile and archive always need scope `all`.
- **D37 Eligibility (4D).** `GET /workers/eligible?serviceIds=a,b[&start=<ISO with offset>]`. Capability = active, non-archived worker who can do EVERY selected service.
  With `start`, each capable worker is checked in the SHOP's timezone against shop hours, own window, break and time off (half-open intervals; never across local midnight);
  unavailable workers come back with a reason (`shop_closed`, `outside_shop_hours`, `not_working`, `outside_worker_hours`, `on_break`, `time_off`).
  Allowed for anyone holding `appointments.assign` or `appointments.create` (so workers can do walk-ins). Overlapping-appointment exclusion is added in Phase 6.
- **D38 Public barbers.** Customers see active barbers (name, photo, which active services they do), optionally filtered to those who can do ALL chosen services.
  Schedules and time off are never public.

## Phase 5
- **D39 Customers are per shop.** `customers` rows belong to one shop (RLS + composite FKs); `users` stays the global login. One LIVE customer per phone per shop (archived records free the number);
  one record per account per shop. Staff-created (walk-in) customers have no account.
- **D40 Linking is never automatic for an existing record.** Phones are unverified in Phase 1 (no OTP), so an account whose number matches an existing shop record becomes a PENDING link request;
  the customer sees nothing about the record and cannot edit it until staff (customers.update, scope all) approve. A number the shop has never seen links instantly.
  Revisit when OTP verification is added.
- **D41 Two kinds of notes.** `notes` ("Prefer short haircut") is visible to the customer and editable by them; `internal_notes` is staff-only and is never returned to a customer.
  A customer cannot change their phone (their identity) nor edit staff-only fields.
- **D42 Own scope for customers** = customers whose preferred barber is my worker profile. A barber's newly created customers are assigned to them automatically.
  Phase 6 widens this to "customers I have served". Out-of-scope records are 404 (existence is not revealed), and duplicate-phone errors don't disclose the other record to own-scope staff.
- **D43 Customer self-service runs inside ONE shop's RLS context** (resolved from the slug) with every query pinned to the caller's own account; there is no cross-shop customer listing
  (the UI asks per shop). Customers are never readable through the public (`public_read`) scope.

## Phase 6
- **D44 Double-booking is prevented by PostgreSQL itself (6A).** An EXCLUDE constraint (`appointments_no_overlap`, btree_gist) forbids two ACTIVE appointments
  (`booked/confirmed/checked_in/in_service`) for one worker whose `[start,end)` ranges overlap. Back-to-back is allowed; unassigned appointments never conflict;
  completed/cancelled/no_show/rescheduled free the slot. It holds under concurrent requests and for any code path (tested: 10 simultaneous bookings => exactly one wins).
  The application still pre-checks for friendly errors; the constraint is the final authority. Assigning a worker later, moving, or re-activating also go through it.
- **D45 CORRECTION of D4 (add-on conflicts).** D4 said an add-on that collides with the next appointment would be "allowed but flagged". That is impossible with a strict
  constraint on `end_at`, and the constraint is the better guarantee. Resolution (implemented in 6C): an add-on is ALWAYS accepted (the customer is already in the chair; the bill grows),
  but the calendar block (`end_at`) is extended only as far as the barber is free; any remaining minutes are recorded as an overrun and flagged to the admin.
- **D46 Snapshots are enforced by the database (6A).** `appointment_services` copies service name, price and duration at booking/add time, and a trigger rejects any later change to
  them (only `removed_at` may change). A catalog price change from Rs300 to Rs350 therefore cannot alter an existing appointment or, later, its invoice.
- **D47 Reschedule = new appointment.** Rescheduling creates a NEW appointment pointing at the old one (`rescheduled_from_id`); the old one becomes `rescheduled` and frees its slot.
  Add-ons, by contrast, are extra rows on the SAME appointment.
- **D48 No physical deletion / append-only history.** The application database role cannot DELETE appointments or appointment services, nor UPDATE/DELETE
  `appointment_status_history` or `audit_logs`. Cancellation records who cancelled and whether it was the customer (needed for the cooldown rule in 6D).
- **D49 Real-time Server-Sent Events (SSE) Stream.** Staff clients (the mobile barber station and admin operations console) stream live events via `@Sse('events/stream')` using an in-process RxJS event bus (`RealtimeEventsService`). Events are strictly scoped to the tenant (`shop_id = app_shop_id()`), worker-scoped subscribers receive their own chair queue updates plus shop announcements, heartbeats are dispatched every 25 seconds to prevent proxy timeouts, and clients update their queues silently without disruptive full-page reload spinners.
- **D50 One-Click Cloud Deployment Infrastructure Blueprint (`render.yaml`).** Multi-tier production deployment is codified via Render Blueprint Infrastructure-as-Code (`render.yaml`) directly in the GitHub repository. It provisions a managed PostgreSQL 16 database, NestJS REST API with automatic migration execution and demo seeding on start, and Next.js App Router standalone web frontend. Continuous deployment is connected 1-to-1 with the GitHub repository (`jai0040/Barber-shop`), auto-deploying every push to `main` while maintaining zero CORS overhead via Next.js internal `/api/v1` rewrites.
- **D51 Web Audio API Real-time Audio Chimes & Customer Calendar Integrations.** Real-time queue updates trigger zero-dependency harmonic synthesized audio chimes via Web Audio API (`apps/web/lib/audio.ts`) on worker mobile stations and admin consoles with user-toggleable mute controls. Confirmed customer bookings render 1-click Google Calendar integration links and `.ics` iCalendar file downloads for native device reminders.
