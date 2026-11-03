-- 009_coupons_offers.sql
-- Promotional Offers & Discount Coupon Engine (Phase 4)

-- 1. Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                       uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code                          text NOT NULL,
  description                   text,
  discount_type                 text NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value                int NOT NULL CHECK (discount_value > 0), -- percentage (1-100) or flat paise
  max_discount_paise            int CHECK (max_discount_paise IS NULL OR max_discount_paise > 0), -- cap for percentage discounts
  min_order_paise               int NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
  applicable_to                 text NOT NULL DEFAULT 'all' CHECK (applicable_to IN ('all', 'services', 'products')),
  max_redemptions_total         int CHECK (max_redemptions_total IS NULL OR max_redemptions_total > 0),
  max_redemptions_per_customer  int NOT NULL DEFAULT 1 CHECK (max_redemptions_per_customer > 0),
  times_redeemed                int NOT NULL DEFAULT 0 CHECK (times_redeemed >= 0),
  valid_from                    timestamptz NOT NULL DEFAULT now(),
  valid_until                   timestamptz,
  is_active                     boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_shop_code_unique UNIQUE (shop_id, code)
);

CREATE INDEX IF NOT EXISTS coupons_shop_idx ON coupons (shop_id, is_active);
CREATE INDEX IF NOT EXISTS coupons_code_idx ON coupons (shop_id, code);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons FORCE ROW LEVEL SECURITY;

CREATE POLICY coupons_tenant ON coupons
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());

CREATE POLICY public_read ON coupons
  FOR SELECT
  USING (
    app_is_public() AND is_active = true AND
    (valid_until IS NULL OR valid_until > now()) AND
    (valid_from <= now()) AND
    EXISTS (SELECT 1 FROM shops s WHERE s.id = coupons.shop_id AND s.status = 'active')
  );

-- 2. Add coupon columns to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS coupon_discount_paise int NOT NULL DEFAULT 0 CHECK (coupon_discount_paise >= 0);

-- 3. Coupon Redemptions (Append-only audit trail)
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  coupon_id           uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id         uuid REFERENCES customers(id) ON DELETE SET NULL,
  type                text NOT NULL DEFAULT 'redemption' CHECK (type IN ('redemption', 'reversal')),
  discount_paise      int NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON coupon_redemptions (shop_id, coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_customer_idx ON coupon_redemptions (shop_id, customer_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_invoice_idx ON coupon_redemptions (shop_id, invoice_id);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions FORCE ROW LEVEL SECURITY;

CREATE POLICY coupon_redemptions_tenant ON coupon_redemptions
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());
