-- Phase 6 & 7: Appointments, appointment services, status history, anti-double-booking guarantee

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SEQUENCE IF NOT EXISTS appointment_number_seq;

CREATE TABLE appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_number    int NOT NULL DEFAULT nextval('appointment_number_seq'),
  customer_id           uuid NOT NULL,
  worker_id             uuid,
  date                  date,
  start_time            time,
  end_time              time,
  start_at              timestamptz NOT NULL,
  end_at                timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'booked' CHECK (
    status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')
  ),
  source                text NOT NULL DEFAULT 'online' CHECK (source IN ('online','walk_in','admin')),
  is_walk_in            boolean NOT NULL DEFAULT false,
  total_amount_paise    int NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
  notes                 text CHECK (notes IS NULL OR length(notes) <= 500),
  rescheduled_from_id   uuid,
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES users(id),
  cancelled_by_customer boolean NOT NULL DEFAULT false,
  cancel_reason         text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  created_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE SET NULL,
  FOREIGN KEY (rescheduled_from_id, shop_id) REFERENCES appointments(id, shop_id),
  CONSTRAINT appointments_time_chk CHECK (end_at > start_at),
  CONSTRAINT appointments_cancelled_chk CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (worker_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (worker_id IS NOT NULL AND status IN ('booked','confirmed','checked_in','in_service'))
);

CREATE INDEX appointments_shop_start_idx   ON appointments (shop_id, start_at);
CREATE INDEX appointments_worker_start_idx ON appointments (worker_id, start_at) WHERE worker_id IS NOT NULL;
CREATE INDEX appointments_shop_status_idx  ON appointments (shop_id, status);
CREATE INDEX appointments_customer_idx     ON appointments (customer_id, start_at DESC);
CREATE INDEX appointments_shop_date_idx    ON appointments (shop_id, date);

CREATE OR REPLACE FUNCTION sync_appointments_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_at IS NULL AND NEW.date IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.start_at := ((NEW.date::text || ' ' || NEW.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata');
  END IF;
  IF NEW.end_at IS NULL AND NEW.date IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    NEW.end_at := ((NEW.date::text || ' ' || NEW.end_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata');
  END IF;
  IF NEW.date IS NULL AND NEW.start_at IS NOT NULL THEN
    NEW.date := (NEW.start_at AT TIME ZONE 'Asia/Kolkata')::date;
    NEW.start_time := (NEW.start_at AT TIME ZONE 'Asia/Kolkata')::time;
    NEW.end_time := (NEW.end_at AT TIME ZONE 'Asia/Kolkata')::time;
  END IF;
  IF NEW.is_walk_in THEN
    NEW.source := 'walk_in';
  ELSIF NEW.source = 'walk_in' THEN
    NEW.is_walk_in := true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_appointments_columns_trg BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION sync_appointments_columns();

-- Appointment Services
CREATE TABLE appointment_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   uuid NOT NULL,
  shop_id          uuid NOT NULL,
  service_id       uuid NOT NULL,
  name_snapshot    text CHECK (name_snapshot IS NULL OR length(trim(name_snapshot)) BETWEEN 2 AND 100),
  service_name     text CHECK (service_name IS NULL OR length(trim(service_name)) BETWEEN 1 AND 100),
  price_paise      int CHECK (price_paise IS NULL OR (price_paise BETWEEN 0 AND 10000000)),
  unit_price_paise int CHECK (unit_price_paise IS NULL OR unit_price_paise >= 0),
  duration_min     int CHECK (duration_min IS NULL OR (duration_min BETWEEN 5 AND 480)),
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes >= 5),
  is_addon         boolean NOT NULL DEFAULT false,
  sort_order       int NOT NULL DEFAULT 0,
  added_by         uuid REFERENCES users(id),
  added_at         timestamptz NOT NULL DEFAULT now(),
  removed_at       timestamptz,
  UNIQUE (id, shop_id),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id)
);
CREATE INDEX appointment_services_appt_idx    ON appointment_services (appointment_id);
CREATE INDEX appointment_services_service_idx ON appointment_services (shop_id, service_id);

CREATE OR REPLACE FUNCTION sync_appointment_services_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.service_name IS NULL AND NEW.name_snapshot IS NOT NULL THEN
    NEW.service_name := NEW.name_snapshot;
  ELSIF NEW.name_snapshot IS NULL AND NEW.service_name IS NOT NULL THEN
    NEW.name_snapshot := NEW.service_name;
  END IF;

  IF NEW.unit_price_paise IS NULL AND NEW.price_paise IS NOT NULL THEN
    NEW.unit_price_paise := NEW.price_paise;
  ELSIF NEW.price_paise IS NULL AND NEW.unit_price_paise IS NOT NULL THEN
    NEW.price_paise := NEW.unit_price_paise;
  END IF;

  IF NEW.duration_minutes IS NULL AND NEW.duration_min IS NOT NULL THEN
    NEW.duration_minutes := NEW.duration_min;
  ELSIF NEW.duration_min IS NULL AND NEW.duration_minutes IS NOT NULL THEN
    NEW.duration_min := NEW.duration_minutes;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_appointment_services_columns_trg BEFORE INSERT OR UPDATE ON appointment_services FOR EACH ROW EXECUTE FUNCTION sync_appointment_services_columns();

CREATE OR REPLACE FUNCTION appointment_services_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR NEW.shop_id IS DISTINCT FROM OLD.shop_id OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot OR NEW.price_paise IS DISTINCT FROM OLD.price_paise
     OR NEW.duration_min IS DISTINCT FROM OLD.duration_min OR NEW.is_addon IS DISTINCT FROM OLD.is_addon THEN
    RAISE EXCEPTION 'appointment_services price/duration/name snapshots are immutable (only removed_at may change)' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER appointment_services_immutable_trg BEFORE UPDATE ON appointment_services FOR EACH ROW EXECUTE FUNCTION appointment_services_immutable();

-- Appointment status history
CREATE TABLE appointment_status_history (
  id             bigserial PRIMARY KEY,
  appointment_id uuid NOT NULL,
  shop_id        uuid NOT NULL,
  from_status    text CHECK (from_status IS NULL OR from_status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')),
  to_status      text CONSTRAINT appointment_status_history_to_status_check CHECK (to_status IS NULL OR to_status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')),
  status         text CONSTRAINT appointment_status_history_to_status_alias_check CHECK (status IS NULL OR status IN ('booked','confirmed','checked_in','in_service','completed','cancelled','no_show','rescheduled')),
  changed_by     uuid REFERENCES users(id),
  changed_at     timestamptz NOT NULL DEFAULT now(),
  note           text CHECK (note IS NULL OR length(note) <= 500),
  notes          text CHECK (notes IS NULL OR length(notes) <= 500),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX appointment_status_history_idx ON appointment_status_history (appointment_id, changed_at);

CREATE OR REPLACE FUNCTION sync_status_history_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NULL AND NEW.to_status IS NOT NULL THEN
    NEW.status := NEW.to_status;
  ELSIF NEW.to_status IS NULL AND NEW.status IS NOT NULL THEN
    NEW.to_status := NEW.status;
  END IF;
  IF NEW.note IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.note := NEW.notes;
  ELSIF NEW.notes IS NULL AND NEW.note IS NOT NULL THEN
    NEW.notes := NEW.note;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_status_history_columns_trg BEFORE INSERT OR UPDATE ON appointment_status_history FOR EACH ROW EXECUTE FUNCTION sync_status_history_columns();

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
