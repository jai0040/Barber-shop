-- Phase 5: customers (per shop), preferences, account-link requests

CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id),
  user_id             uuid REFERENCES users(id),          -- the customer's app account, once linked
  pending_user_id     uuid REFERENCES users(id),          -- an account asking to link (unverified phone => needs staff approval)
  name                text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  phone               text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  email               text CHECK (email IS NULL OR email = lower(email)),
  notes               text CHECK (notes IS NULL OR length(notes) <= 500),            -- visible to the customer ("Prefer short haircut")
  internal_notes      text CHECK (internal_notes IS NULL OR length(internal_notes) <= 1000), -- staff only, never shown to the customer
  preferred_worker_id uuid,
  archived_at         timestamptz,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (preferred_worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE SET NULL (preferred_worker_id),
  CONSTRAINT customers_link_chk CHECK (user_id IS NULL OR pending_user_id IS NULL)
);
-- one live customer per phone per shop (archived records free the number); one record per account per shop
CREATE UNIQUE INDEX customers_phone_uq ON customers (shop_id, phone) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX customers_user_uq  ON customers (shop_id, user_id) WHERE user_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX customers_name_idx ON customers (shop_id, lower(name));
CREATE INDEX customers_pref_worker_idx ON customers (shop_id, preferred_worker_id);

CREATE TABLE customer_preferred_services (
  customer_id uuid NOT NULL,
  service_id  uuid NOT NULL,
  shop_id     uuid NOT NULL,
  PRIMARY KEY (customer_id, service_id),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id)  REFERENCES services(id, shop_id)  ON DELETE CASCADE
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','customer_preferred_services'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;
-- Customers are NOT public: no public_read policy exists for these tables.
