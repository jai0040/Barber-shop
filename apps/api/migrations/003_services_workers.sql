-- Phase 4: service categories, services, workers, worker-service mapping, schedules and breaks

-- Service categories
CREATE TABLE service_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name),
  UNIQUE (id, shop_id)
);
CREATE INDEX service_categories_shop_idx ON service_categories (shop_id);

-- Services offered by shop (prices in paise)
CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id      uuid REFERENCES service_categories(id, shop_id) ON DELETE SET NULL,
  name             text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description      text,
  price_paise      int NOT NULL CHECK (price_paise >= 0),
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id)
);
CREATE INDEX services_shop_idx ON services (shop_id);

-- Workers (barbers/staff profiles tied to a staff user)
CREATE TABLE workers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name            text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  phone                   text,
  is_active               boolean NOT NULL DEFAULT true,
  commission_rate_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate_percent BETWEEN 0 AND 100),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (id, shop_id)
);
CREATE INDEX workers_shop_idx ON workers (shop_id);

-- Worker to Service mapping (which worker can perform which service)
CREATE TABLE worker_services (
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id  uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (worker_id, service_id),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX worker_services_shop_idx ON worker_services (shop_id);

-- Worker weekly schedule (ISO weekday: 1=Mon..7=Sun)
CREATE TABLE worker_schedules (
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id  uuid NOT NULL,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time   time,
  PRIMARY KEY (worker_id, weekday),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  CONSTRAINT worker_schedules_window_chk CHECK (
    (NOT is_working AND start_time IS NULL AND end_time IS NULL) OR
    (is_working AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);
CREATE INDEX worker_schedules_shop_idx ON worker_schedules (shop_id);

-- Worker breaks during shifts
CREATE TABLE worker_breaks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id  uuid NOT NULL,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time   time NOT NULL,
  label      text DEFAULT 'Break',
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  CONSTRAINT worker_breaks_window_chk CHECK (end_time > start_time)
);
CREATE INDEX worker_breaks_shop_worker_idx ON worker_breaks (shop_id, worker_id);

-- ENABLE & FORCE ROW LEVEL SECURITY
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_categories','services','workers','worker_services','worker_schedules','worker_breaks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

-- PUBLIC READ POLICIES (for customer booking website)
CREATE POLICY public_read ON service_categories FOR SELECT
  USING (app_is_public() AND is_active AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));

CREATE POLICY public_read ON services FOR SELECT
  USING (app_is_public() AND is_active AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));

CREATE POLICY public_read ON workers FOR SELECT
  USING (app_is_public() AND is_active AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));

CREATE POLICY public_read ON worker_services FOR SELECT
  USING (app_is_public() AND EXISTS (
    SELECT 1 FROM workers w JOIN services s ON s.id = service_id
    WHERE w.id = worker_id AND w.is_active AND s.is_active AND w.shop_id = shop_id
  ));

CREATE POLICY public_read ON worker_schedules FOR SELECT
  USING (app_is_public() AND is_working AND EXISTS (
    SELECT 1 FROM workers w WHERE w.id = worker_id AND w.is_active AND w.shop_id = shop_id
  ));

CREATE POLICY public_read ON worker_breaks FOR SELECT
  USING (app_is_public() AND EXISTS (
    SELECT 1 FROM workers w WHERE w.id = worker_id AND w.is_active AND w.shop_id = shop_id
  ));
