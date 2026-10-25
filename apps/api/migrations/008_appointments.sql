-- Phase 6A: appointments, appointment services (price/duration SNAPSHOTS), status history, and the anti-double-booking guarantee

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id),
  customer_id         uuid NOT NULL,
  worker_id           uuid,                                   -- NULL = unassigned (admin assigns later)
  start_at            timestamptz NOT NULL,                   -- UTC instants; the shop timezone is applied at the edges (D2)
  end_at              timestamptz NOT NULL,                   -- the time the calendar BLOCKS for this appointment
  status              text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')),
  source              text NOT NULL CHECK (source IN ('online','walk_in','admin')),
  notes               text CHECK (notes IS NULL OR length(notes) <= 500),
  rescheduled_from_id uuid,                                   -- a reschedule creates a NEW appointment that points at the old one (old becomes 'rescheduled')
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES users(id),
  cancelled_by_customer boolean NOT NULL DEFAULT false,       -- drives the "no new booking for N hours after the customer cancels" rule
  cancel_reason       text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (customer_id, shop_id)  REFERENCES customers(id, shop_id),
  FOREIGN KEY (worker_id, shop_id)    REFERENCES workers(id, shop_id),
  FOREIGN KEY (rescheduled_from_id, shop_id) REFERENCES appointments(id, shop_id),
  CONSTRAINT appointments_time_chk      CHECK (end_at > start_at),
  CONSTRAINT appointments_cancelled_chk CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  -- THE GUARANTEE: one worker can never have two ACTIVE appointments whose [start,end) ranges overlap.
  -- Back-to-back (one ends exactly when the next starts) is allowed. Unassigned appointments never conflict.
  -- Enforced by PostgreSQL itself, so it holds under concurrent requests and for any code path (API, scripts, SQL).
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (worker_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (worker_id IS NOT NULL AND status IN ('booked','confirmed','checked_in','in_service'))
);
CREATE INDEX appointments_shop_start_idx   ON appointments (shop_id, start_at);
CREATE INDEX appointments_worker_start_idx ON appointments (worker_id, start_at) WHERE worker_id IS NOT NULL;
CREATE INDEX appointments_shop_status_idx  ON appointments (shop_id, status);
CREATE INDEX appointments_customer_idx     ON appointments (customer_id, start_at DESC);
CREATE INDEX appointments_cancel_idx       ON appointments (customer_id, cancelled_at) WHERE cancelled_by_customer;

-- One row per service on the appointment. Name, price and duration are COPIED here when the service is booked/added (D5, D46):
-- later changes to the catalog never alter this row, and a trigger below makes that impossible even for direct SQL.
CREATE TABLE appointment_services (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  shop_id        uuid NOT NULL,
  service_id     uuid NOT NULL,
  name_snapshot  text NOT NULL CHECK (length(trim(name_snapshot)) BETWEEN 2 AND 80),
  price_paise    int  NOT NULL CHECK (price_paise BETWEEN 0 AND 10000000),
  duration_min   int  NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  is_addon       boolean NOT NULL DEFAULT false,              -- added after the appointment was created ("+ Add Service")
  sort_order     int  NOT NULL DEFAULT 0,
  added_by       uuid REFERENCES users(id),
  added_at       timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,                                 -- the ONLY column that may change after insert
  UNIQUE (id, shop_id),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id),
  FOREIGN KEY (service_id, shop_id)     REFERENCES services(id, shop_id)
);
CREATE INDEX appointment_services_appt_idx    ON appointment_services (appointment_id);
CREATE INDEX appointment_services_service_idx ON appointment_services (shop_id, service_id);

CREATE FUNCTION appointment_services_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot OR NEW.price_paise IS DISTINCT FROM OLD.price_paise
     OR NEW.duration_min IS DISTINCT FROM OLD.duration_min OR NEW.is_addon IS DISTINCT FROM OLD.is_addon THEN
    RAISE EXCEPTION 'appointment_services price/duration/name snapshots are immutable (only removed_at may change)' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appointment_services_immutable_trg BEFORE UPDATE ON appointment_services FOR EACH ROW EXECUTE FUNCTION appointment_services_immutable();

-- Append-only audit trail of status changes (the app role cannot UPDATE or DELETE it; see migrate.ts).
CREATE TABLE appointment_status_history (
  id             bigserial PRIMARY KEY,
  appointment_id uuid NOT NULL,
  shop_id        uuid NOT NULL,
  from_status    text,
  to_status      text NOT NULL CHECK (to_status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')),
  changed_by     uuid REFERENCES users(id),
  changed_at     timestamptz NOT NULL DEFAULT now(),
  note           text CHECK (note IS NULL OR length(note) <= 300),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id)
);
CREATE INDEX appointment_status_history_idx ON appointment_status_history (appointment_id, changed_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','appointment_services','appointment_status_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;
-- Appointments are NOT public: no public_read policy exists for these tables.
