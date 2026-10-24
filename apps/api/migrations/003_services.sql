-- Phase 4A: service categories and services

CREATE TABLE service_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id)
);
CREATE UNIQUE INDEX service_categories_name_uq ON service_categories (shop_id, lower(name));

-- Money in integer paise (D1). Appointments/invoices snapshot price+duration (D5); history never reads these columns.
CREATE TABLE services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES shops(id),
  category_id  uuid,
  name         text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description  text CHECK (description IS NULL OR length(description) <= 500),
  price_paise  int  NOT NULL CHECK (price_paise BETWEEN 0 AND 10000000),
  duration_min int  NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (category_id, shop_id) REFERENCES service_categories(id, shop_id) ON DELETE SET NULL (category_id)
);
CREATE UNIQUE INDEX services_name_uq ON services (shop_id, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX services_shop_idx ON services (shop_id, status);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_categories','services'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

-- Customer website: SELECT-only, active shops, bookable services only.
CREATE POLICY public_read ON service_categories FOR SELECT
  USING (app_is_public() AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
CREATE POLICY public_read ON services FOR SELECT
  USING (app_is_public() AND status = 'active' AND archived_at IS NULL AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
