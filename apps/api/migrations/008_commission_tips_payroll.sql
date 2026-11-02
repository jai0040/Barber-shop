-- 008_commission_tips_payroll.sql
-- Staff Commission & Tip Payout Ledger (Phase 3)

-- 1. Add product commission rate to workers
ALTER TABLE workers ADD COLUMN IF NOT EXISTS product_commission_rate_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (product_commission_rate_percent BETWEEN 0 AND 100);

-- 2. Add tip_paise to invoices and update check constraint
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tip_paise int NOT NULL DEFAULT 0 CHECK (tip_paise >= 0);

-- Drop old check constraint and recreate with tip_paise included
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_total_chk;
ALTER TABLE invoices ADD CONSTRAINT invoices_total_chk CHECK (final_total_paise = GREATEST(0, subtotal_paise - discount_paise) + tip_paise);

-- 3. Worker Commission & Tip Ledger (Append-only)
CREATE TABLE IF NOT EXISTS worker_commission_ledger (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL,
  invoice_id                  uuid,
  type                        text NOT NULL CHECK (type IN ('service_commission', 'product_commission', 'tip', 'manual_adjustment', 'payout', 'reversal')),
  amount_paise                int NOT NULL, -- positive for earnings, negative for payouts/reversals
  commission_rate_percent     numeric(5,2),
  base_amount_paise           int, -- base line item total on which commission was calculated
  notes                       text,
  created_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id, shop_id) REFERENCES invoices(id, shop_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS worker_commission_ledger_worker_idx ON worker_commission_ledger (shop_id, worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS worker_commission_ledger_invoice_idx ON worker_commission_ledger (shop_id, invoice_id);

ALTER TABLE worker_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_commission_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_commission_ledger_tenant ON worker_commission_ledger
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());

-- 4. Worker Payouts (Settlement records)
CREATE TABLE IF NOT EXISTS worker_payouts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  worker_id                   uuid NOT NULL,
  amount_paise                int NOT NULL CHECK (amount_paise > 0),
  payment_method              text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'upi')),
  period_start_date           date,
  period_end_date             date,
  notes                       text,
  expense_id                  uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_payouts_worker_idx ON worker_payouts (shop_id, worker_id, created_at DESC);

ALTER TABLE worker_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_payouts FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_payouts_tenant ON worker_payouts
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());
