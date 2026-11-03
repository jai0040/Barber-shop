-- Phase 8: Online Payment Gateway & Razorpay Integration (Section 61)

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('cash', 'upi_qr', 'razorpay', 'card', 'online_gateway'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_order_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_signature text;

CREATE INDEX IF NOT EXISTS payments_gateway_order_idx ON payments (gateway_order_id) WHERE gateway_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_gateway_payment_idx ON payments (gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;

-- Shop-level payment gateway credentials
ALTER TABLE shops ADD COLUMN IF NOT EXISTS razorpay_key_id text;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS razorpay_key_secret text;
