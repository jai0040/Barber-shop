-- Phase 4B: workers (profile, optional login link, photo)

-- Lets workers.user_id guarantee the login belongs to the SAME shop (composite FK below).
ALTER TABLE users ADD CONSTRAINT users_id_shop_uq UNIQUE (id, shop_id);

ALTER TABLE files DROP CONSTRAINT files_kind_check;
ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('shop_logo','upi_qr','worker_photo'));

CREATE TABLE workers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES shops(id),
  user_id         uuid UNIQUE,
  display_name    text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 60),
  photo_file_id   uuid,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  archived_at     timestamptz,
  commission_rate numeric(5,2) CHECK (commission_rate IS NULL OR commission_rate BETWEEN 0 AND 100), -- reserved for Phase 2 (D10)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id),
  FOREIGN KEY (user_id, shop_id)       REFERENCES users(id, shop_id),
  FOREIGN KEY (photo_file_id, shop_id) REFERENCES files(id, shop_id) ON DELETE SET NULL (photo_file_id)
);
CREATE INDEX workers_shop_idx ON workers (shop_id, status);

ALTER TABLE workers ENABLE ROW LEVEL SECURITY; ALTER TABLE workers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workers
  USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform());

-- Customer website: only active, non-archived workers of active shops; photos only for those workers.
CREATE POLICY public_read ON workers FOR SELECT
  USING (app_is_public() AND status = 'active' AND archived_at IS NULL AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
DROP POLICY public_read ON files;
CREATE POLICY public_read ON files FOR SELECT USING (app_is_public()
  AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active')
  AND (kind = 'shop_logo' OR (kind = 'worker_photo' AND EXISTS (SELECT 1 FROM workers w WHERE w.photo_file_id = files.id AND w.status = 'active' AND w.archived_at IS NULL))));
