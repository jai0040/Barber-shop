-- Phase 4C: worker<->service mapping, weekly availability, time off

CREATE TABLE worker_services (
  worker_id  uuid NOT NULL,
  service_id uuid NOT NULL,
  shop_id    uuid NOT NULL,
  PRIMARY KEY (worker_id, service_id),
  FOREIGN KEY (worker_id, shop_id)  REFERENCES workers(id, shop_id)  ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX worker_services_service_idx ON worker_services (service_id);

-- One weekly window per ISO weekday (1=Mon..7=Sun) + one optional break (D12). No rows for a worker = not bookable yet.
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['worker_services','worker_availability','worker_time_off'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;
