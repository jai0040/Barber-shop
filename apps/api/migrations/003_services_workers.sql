-- Phase 4: service categories, services, workers, worker-service mapping, schedules and breaks

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_shop_uq;
ALTER TABLE users ADD CONSTRAINT users_id_shop_uq UNIQUE (id, shop_id);

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('shop_logo','upi_qr','worker_photo'));

-- Service categories
CREATE TABLE service_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  sort_order    int NOT NULL DEFAULT 0,
  display_order int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id)
);
CREATE UNIQUE INDEX service_categories_name_uq ON service_categories (shop_id, lower(name));
CREATE INDEX service_categories_shop_idx ON service_categories (shop_id);

CREATE OR REPLACE FUNCTION sync_categories_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sort_order <> 0 AND NEW.display_order = 0 THEN
    NEW.display_order := NEW.sort_order;
  ELSIF NEW.display_order <> 0 AND NEW.sort_order = 0 THEN
    NEW.sort_order := NEW.display_order;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_categories_columns_trg BEFORE INSERT OR UPDATE ON service_categories FOR EACH ROW EXECUTE FUNCTION sync_categories_columns();

-- Services offered by shop (prices in paise)
CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category_id      uuid,
  name             text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description      text CHECK (description IS NULL OR length(description) <= 1000),
  price_paise      int NOT NULL CHECK (price_paise BETWEEN 0 AND 10000000),
  duration_min     int CHECK (duration_min IS NULL OR duration_min BETWEEN 5 AND 480),
  duration_minutes int CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 480),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_active        boolean NOT NULL DEFAULT true,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (category_id, shop_id) REFERENCES service_categories(id, shop_id) ON DELETE SET NULL (category_id)
);
CREATE UNIQUE INDEX services_name_uq ON services (shop_id, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX services_shop_idx ON services (shop_id, status);

CREATE OR REPLACE FUNCTION sync_services_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.duration_min IS NULL AND NEW.duration_minutes IS NOT NULL THEN
    NEW.duration_min := NEW.duration_minutes;
  ELSIF NEW.duration_minutes IS NULL AND NEW.duration_min IS NOT NULL THEN
    NEW.duration_minutes := NEW.duration_min;
  END IF;
  IF NEW.status IS NOT NULL THEN
    NEW.is_active := (NEW.status = 'active' AND NEW.archived_at IS NULL);
  ELSIF NEW.is_active IS NOT NULL THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_services_columns_trg BEFORE INSERT OR UPDATE ON services FOR EACH ROW EXECUTE FUNCTION sync_services_columns();

-- Workers (barbers/staff profiles tied to a staff user)
CREATE TABLE workers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id                 uuid UNIQUE,
  display_name            text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 80),
  phone                   text,
  photo_file_id           uuid,
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_active               boolean NOT NULL DEFAULT true,
  archived_at             timestamptz,
  commission_rate         numeric(5,2) CHECK (commission_rate IS NULL OR commission_rate BETWEEN 0 AND 100),
  commission_rate_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_rate_percent BETWEEN 0 AND 100),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (user_id, shop_id) REFERENCES users(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (photo_file_id, shop_id) REFERENCES files(id, shop_id) ON DELETE SET NULL (photo_file_id)
);
CREATE INDEX workers_shop_idx ON workers (shop_id, status);

CREATE OR REPLACE FUNCTION sync_workers_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT NULL THEN
    NEW.is_active := (NEW.status = 'active' AND NEW.archived_at IS NULL);
  ELSIF NEW.is_active IS NOT NULL THEN
    NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END;
  END IF;
  IF NEW.commission_rate IS NOT NULL AND NEW.commission_rate_percent = 0 THEN
    NEW.commission_rate_percent := NEW.commission_rate;
  ELSIF NEW.commission_rate_percent <> 0 AND NEW.commission_rate IS NULL THEN
    NEW.commission_rate := NEW.commission_rate_percent;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_workers_columns_trg BEFORE INSERT OR UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION sync_workers_columns();

-- Worker to Service mapping (which worker can perform which service)
CREATE TABLE worker_services (
  worker_id  uuid NOT NULL,
  service_id uuid NOT NULL,
  shop_id    uuid NOT NULL,
  PRIMARY KEY (worker_id, service_id),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX worker_services_shop_idx ON worker_services (shop_id);
CREATE INDEX worker_services_service_idx ON worker_services (service_id);

-- Worker weekly availability
CREATE TABLE worker_availability (
  worker_id   uuid NOT NULL,
  shop_id     uuid NOT NULL,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_working  boolean NOT NULL,
  start_time  time,
  end_time    time,
  break_start time,
  break_end   time,
  PRIMARY KEY (worker_id, weekday),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  CONSTRAINT worker_avail_chk CHECK (
    (NOT is_working AND start_time IS NULL AND end_time IS NULL AND break_start IS NULL AND break_end IS NULL) OR
    (is_working AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time AND
      ((break_start IS NULL AND break_end IS NULL) OR
       (break_start IS NOT NULL AND break_end IS NOT NULL AND break_start >= start_time AND break_end > break_start AND break_end <= end_time))))
);
CREATE INDEX worker_availability_shop_idx ON worker_availability (shop_id);

-- Worker weekly schedule (alternative schema compatibility)
CREATE TABLE worker_schedules (
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id  uuid NOT NULL,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time   time,
  PRIMARY KEY (worker_id, weekday),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
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
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX worker_breaks_shop_worker_idx ON worker_breaks (shop_id, worker_id);

-- Mutual synchronization triggers for worker_availability <-> worker_schedules / worker_breaks
CREATE OR REPLACE FUNCTION sync_worker_availability_to_schedules()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM worker_schedules WHERE worker_id = OLD.worker_id AND weekday = OLD.weekday;
    DELETE FROM worker_breaks WHERE worker_id = OLD.worker_id AND weekday = OLD.weekday;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO worker_schedules (shop_id, worker_id, weekday, is_working, start_time, end_time)
    VALUES (NEW.shop_id, NEW.worker_id, NEW.weekday, NEW.is_working, NEW.start_time, NEW.end_time)
    ON CONFLICT (worker_id, weekday)
    DO UPDATE SET shop_id = EXCLUDED.shop_id, is_working = EXCLUDED.is_working, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

    DELETE FROM worker_breaks WHERE worker_id = NEW.worker_id AND weekday = NEW.weekday;
    IF NEW.break_start IS NOT NULL AND NEW.break_end IS NOT NULL THEN
      INSERT INTO worker_breaks (shop_id, worker_id, weekday, start_time, end_time, label)
      VALUES (NEW.shop_id, NEW.worker_id, NEW.weekday, NEW.break_start, NEW.break_end, 'Break');
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_worker_availability ON worker_availability;
CREATE TRIGGER trg_sync_worker_availability
AFTER INSERT OR UPDATE OR DELETE ON worker_availability
FOR EACH ROW EXECUTE FUNCTION sync_worker_availability_to_schedules();

CREATE OR REPLACE FUNCTION sync_worker_schedules_to_availability()
RETURNS TRIGGER AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM worker_availability WHERE worker_id = OLD.worker_id AND weekday = OLD.weekday;
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO worker_availability (shop_id, worker_id, weekday, is_working, start_time, end_time)
    VALUES (NEW.shop_id, NEW.worker_id, NEW.weekday, NEW.is_working, NEW.start_time, NEW.end_time)
    ON CONFLICT (worker_id, weekday)
    DO UPDATE SET shop_id = EXCLUDED.shop_id, is_working = EXCLUDED.is_working, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_worker_schedules ON worker_schedules;
CREATE TRIGGER trg_sync_worker_schedules
AFTER INSERT OR UPDATE OR DELETE ON worker_schedules
FOR EACH ROW EXECUTE FUNCTION sync_worker_schedules_to_availability();

CREATE TABLE worker_time_off (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL,
  worker_id  uuid NOT NULL,
  start_at   timestamptz NOT NULL,
  end_at     timestamptz NOT NULL,
  reason     text CHECK (reason IS NULL OR length(reason) <= 200),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  CONSTRAINT worker_time_off_range_chk CHECK (end_at > start_at)
);
CREATE INDEX worker_time_off_idx ON worker_time_off (worker_id, start_at, end_at);

-- ENABLE & FORCE ROW LEVEL SECURITY
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_categories','services','workers','worker_services','worker_availability','worker_schedules','worker_breaks','worker_time_off'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

-- PUBLIC READ POLICIES (for customer booking website)
CREATE POLICY public_read ON service_categories FOR SELECT
  USING (app_is_public() AND is_active AND EXISTS (SELECT 1 FROM shops s WHERE s.id = service_categories.shop_id AND s.status = 'active'));

CREATE POLICY public_read ON services FOR SELECT
  USING (app_is_public() AND status = 'active' AND archived_at IS NULL AND EXISTS (SELECT 1 FROM shops s WHERE s.id = services.shop_id AND s.status = 'active'));

CREATE POLICY public_read ON workers FOR SELECT
  USING (app_is_public() AND status = 'active' AND archived_at IS NULL AND EXISTS (SELECT 1 FROM shops s WHERE s.id = workers.shop_id AND s.status = 'active'));

CREATE POLICY public_read ON worker_services FOR SELECT
  USING (app_is_public() AND EXISTS (
    SELECT 1 FROM workers w JOIN services s ON s.id = worker_services.service_id
    WHERE w.id = worker_services.worker_id AND w.status = 'active' AND w.archived_at IS NULL AND s.status = 'active' AND s.archived_at IS NULL AND w.shop_id = worker_services.shop_id
  ));

CREATE POLICY public_read ON worker_schedules FOR SELECT
  USING (app_is_public() AND is_working AND EXISTS (
    SELECT 1 FROM workers w WHERE w.id = worker_schedules.worker_id AND w.status = 'active' AND w.archived_at IS NULL AND w.shop_id = worker_schedules.shop_id
  ));

CREATE POLICY public_read ON worker_breaks FOR SELECT
  USING (app_is_public() AND EXISTS (
    SELECT 1 FROM workers w WHERE w.id = worker_breaks.worker_id AND w.status = 'active' AND w.archived_at IS NULL AND w.shop_id = worker_breaks.shop_id
  ));

DROP POLICY IF EXISTS public_read ON files;
CREATE POLICY public_read ON files FOR SELECT USING (app_is_public()
  AND EXISTS (SELECT 1 FROM shops s WHERE s.id = files.shop_id AND s.status = 'active')
  AND (kind = 'shop_logo' OR (kind = 'worker_photo' AND EXISTS (SELECT 1 FROM workers w WHERE w.photo_file_id = files.id AND w.status = 'active' AND w.archived_at IS NULL))));
