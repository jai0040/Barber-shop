-- 011_reviews_ratings.sql
-- Customer Reviews & Ratings Engine (Phase 6)

CREATE TABLE IF NOT EXISTS reviews (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id                     uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_id              uuid,
  customer_id                 uuid NOT NULL,
  customer_name               text NOT NULL DEFAULT 'Customer',
  worker_id                   uuid,
  service_id                  uuid,
  rating                      int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  barber_rating               int CHECK (barber_rating BETWEEN 1 AND 5),
  comment                     text CHECK (comment IS NULL OR length(comment) <= 1000),
  status                      text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'flagged')),
  owner_reply                 text CHECK (owner_reply IS NULL OR length(owner_reply) <= 1000),
  owner_replied_at            timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (customer_id, shop_id) REFERENCES customers(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id, shop_id) REFERENCES workers(id, shop_id) ON DELETE SET NULL,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id, shop_id) REFERENCES appointments(id, shop_id) ON DELETE SET NULL
);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT 'Customer';

-- At most one review per appointment to prevent duplicate feedback
CREATE UNIQUE INDEX IF NOT EXISTS reviews_appointment_uq ON reviews (shop_id, appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reviews_shop_status_idx ON reviews (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_worker_idx ON reviews (shop_id, worker_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY reviews_tenant ON reviews
  FOR ALL
  USING (shop_id = app_shop_id())
  WITH CHECK (shop_id = app_shop_id());

CREATE POLICY reviews_public_read ON reviews
  FOR SELECT
  USING (
    app_is_public() AND status = 'published' AND
    EXISTS (SELECT 1 FROM shops s WHERE s.id = reviews.shop_id AND s.status = 'active')
  );
