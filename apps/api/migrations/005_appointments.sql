-- Phase 6 & 7: Appointments, appointment services (add-ons), status history, and walk-ins

CREATE SEQUENCE IF NOT EXISTS appointment_number_seq;

CREATE TABLE appointments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_number  int NOT NULL DEFAULT nextval('appointment_number_seq'),
  customer_id         uuid NOT NULL,
  worker_id           uuid,
  date                date NOT NULL,
  start_time          time NOT NULL,
  end_time            time NOT NULL,
  status              text NOT NULL DEFAULT 'booked' CHECK (
    status IN ('booked', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show', 'rescheduled')
  ),
  notes               text,
  is_walk_in          boolean NOT NULL DEFAULT false,
  total_amount_paise  int NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE SET NULL,
  CONSTRAINT appointments_window_chk CHECK (end_time > start_time)
);

CREATE INDEX appointments_shop_date_idx ON appointments (shop_id, date);
CREATE INDEX appointments_worker_date_idx ON appointments (shop_id, worker_id, date);
CREATE INDEX appointments_customer_idx ON appointments (shop_id, customer_id);
CREATE INDEX appointments_status_idx ON appointments (shop_id, status);

-- Appointment Services (supports multiple services & add-on services)
CREATE TABLE appointment_services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_id   uuid NOT NULL,
  service_id       uuid NOT NULL,
  service_name     text NOT NULL,
  unit_price_paise int NOT NULL CHECK (unit_price_paise >= 0),
  duration_minutes int NOT NULL CHECK (duration_minutes >= 5),
  added_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE RESTRICT
);
CREATE INDEX appointment_services_apt_idx ON appointment_services (shop_id, appointment_id);

-- Appointment status history audit
CREATE TABLE appointment_status_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL,
  status         text NOT NULL,
  notes          text,
  changed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX appointment_status_history_apt_idx ON appointment_status_history (shop_id, appointment_id, created_at DESC);

-- Row Level Security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','appointment_services','appointment_status_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;
