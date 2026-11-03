-- Phase 7: Notifications & Alerting Engine (Master Prompt #52 & #53)

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  customer_id  uuid,
  title        text NOT NULL CHECK (length(trim(title)) >= 2 AND length(title) <= 200),
  message      text NOT NULL CHECK (length(trim(message)) >= 2 AND length(message) <= 2000),
  type         text NOT NULL CHECK (type IN (
    'appointment_booked',
    'appointment_confirmed',
    'appointment_assigned',
    'appointment_cancelled',
    'appointment_completed',
    'payment_received',
    'low_stock',
    'salary_advance_requested',
    'review_received'
  )),
  channel      text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'sms', 'email')),
  status       text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'delivered', 'failed')),
  metadata     jsonb DEFAULT '{}'::jsonb,
  whatsapp_url text,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS notifications_shop_idx ON notifications(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, status) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_customer_idx ON notifications(customer_id, status) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(shop_id, status) WHERE status = 'unread';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_tenant_isolation ON notifications
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());
