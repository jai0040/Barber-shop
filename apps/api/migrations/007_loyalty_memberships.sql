-- Phase 2: Customer Loyalty Points & Memberships Architecture

-- 1. Add loyalty points cached balance to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points int NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0);

-- 2. Loyalty Settings per Shop
CREATE TABLE loyalty_settings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                 uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  is_enabled              boolean NOT NULL DEFAULT true,
  earn_per_rupee_paise    int NOT NULL DEFAULT 10000 CHECK (earn_per_rupee_paise > 0), -- 1 point per Rs 100 spent
  point_value_paise       int NOT NULL DEFAULT 100 CHECK (point_value_paise > 0),      -- 1 point = Rs 1 discount
  min_redeem_points       int NOT NULL DEFAULT 50 CHECK (min_redeem_points >= 0),
  max_discount_percentage int NOT NULL DEFAULT 50 CHECK (max_discount_percentage BETWEEN 1 AND 100),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id),
  UNIQUE (id, shop_id)
);
CREATE INDEX loyalty_settings_shop_idx ON loyalty_settings (shop_id);

-- 3. Customer Loyalty Ledger (Append-only)
CREATE TABLE customer_loyalty_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL,
  points_delta  int NOT NULL,
  balance_after int NOT NULL CHECK (balance_after >= 0),
  type          text NOT NULL CHECK (type IN ('earn_invoice', 'redeem_invoice', 'manual_adjustment', 'membership_bonus', 'welcome_bonus', 'reversal')),
  invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX customer_loyalty_ledger_customer_idx ON customer_loyalty_ledger (shop_id, customer_id, created_at DESC);
CREATE INDEX customer_loyalty_ledger_invoice_idx ON customer_loyalty_ledger (shop_id, invoice_id);

-- 4. Membership Plans
CREATE TABLE membership_plans (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name                       text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  description                text,
  price_paise                int NOT NULL CHECK (price_paise >= 0),
  duration_days              int NOT NULL CHECK (duration_days >= 1),
  discount_percent_services  int NOT NULL DEFAULT 0 CHECK (discount_percent_services BETWEEN 0 AND 100),
  discount_percent_products  int NOT NULL DEFAULT 0 CHECK (discount_percent_products BETWEEN 0 AND 100),
  points_multiplier          numeric(3,1) NOT NULL DEFAULT 1.0 CHECK (points_multiplier >= 1.0),
  status                     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name),
  UNIQUE (id, shop_id)
);
CREATE INDEX membership_plans_shop_idx ON membership_plans (shop_id);

-- 5. Included Services in Membership Plan
CREATE TABLE membership_plan_included_services (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  plan_id    uuid NOT NULL,
  service_id uuid NOT NULL,
  quantity   int NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, shop_id) REFERENCES membership_plans(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE CASCADE,
  UNIQUE (plan_id, service_id),
  UNIQUE (id, shop_id)
);
CREATE INDEX membership_plan_inc_srv_idx ON membership_plan_included_services (shop_id, plan_id);

-- 6. Customer Subscribed Memberships
CREATE TABLE customer_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL,
  plan_id       uuid NOT NULL,
  start_date    date NOT NULL DEFAULT CURRENT_DATE,
  end_date      date NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, shop_id) REFERENCES membership_plans(id, shop_id) ON DELETE CASCADE,
  UNIQUE (id, shop_id),
  CONSTRAINT customer_memberships_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX customer_memberships_customer_idx ON customer_memberships (shop_id, customer_id, status);

-- 7. Service Usages under Customer Membership
CREATE TABLE customer_membership_service_usages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_membership_id uuid NOT NULL,
  service_id             uuid NOT NULL,
  appointment_id         uuid REFERENCES appointments(id) ON DELETE SET NULL,
  invoice_id             uuid REFERENCES invoices(id) ON DELETE SET NULL,
  used_at                timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_membership_id, shop_id) REFERENCES customer_memberships(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX customer_membership_usage_idx ON customer_membership_service_usages (shop_id, customer_membership_id);

-- 8. Row Level Security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'loyalty_settings',
    'customer_loyalty_ledger',
    'membership_plans',
    'membership_plan_included_services',
    'customer_memberships',
    'customer_membership_service_usages'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

-- Public read for membership plans on customer site
CREATE POLICY public_read ON membership_plans FOR SELECT
  USING (app_is_public() AND status = 'active' AND EXISTS (SELECT 1 FROM shops s WHERE s.id = membership_plans.shop_id AND s.status = 'active'));

CREATE POLICY public_read ON membership_plan_included_services FOR SELECT
  USING (app_is_public() AND EXISTS (SELECT 1 FROM membership_plans mp WHERE mp.id = membership_plan_included_services.plan_id AND mp.status = 'active'));
