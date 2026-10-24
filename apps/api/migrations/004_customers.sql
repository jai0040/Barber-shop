-- Phase 5: Customers, customer preferences, and tenant isolation

CREATE TABLE customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  name                text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  phone               text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  email               text CHECK (email IS NULL OR email = lower(email)),
  preferred_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, phone),
  UNIQUE (id, shop_id)
);
CREATE INDEX customers_shop_phone_idx ON customers (shop_id, phone);
CREATE INDEX customers_user_idx ON customers (user_id);
CREATE INDEX customers_preferred_worker_idx ON customers (shop_id, preferred_worker_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON customers
  USING (shop_id = app_shop_id() OR app_is_platform())
  WITH CHECK (shop_id = app_shop_id() OR app_is_platform());

-- Customer self-view policy (a logged in customer user can see their own customer profile across shops)
CREATE POLICY customer_self_read ON customers FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
