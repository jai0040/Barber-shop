-- Phase 3: shop profile, business hours, uploaded files

CREATE FUNCTION app_is_public() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.public_read', true), 'off') = 'on' $$;

ALTER TABLE shops
  ADD COLUMN phone   text,
  ADD COLUMN email   text,
  ADD COLUMN address text,
  ADD COLUMN city    text,
  ADD COLUMN state   text,
  ADD COLUMN country text NOT NULL DEFAULT 'India',
  ADD COLUMN gst_no  text,
  ADD COLUMN logo_file_id   uuid,
  ADD COLUMN upi_qr_file_id uuid,
  ADD CONSTRAINT shops_phone_fmt CHECK (phone IS NULL OR phone ~ '^\+[0-9]{8,15}$'),
  ADD CONSTRAINT shops_email_lower CHECK (email IS NULL OR email = lower(email)),
  ADD CONSTRAINT shops_gst_fmt CHECK (gst_no IS NULL OR gst_no ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

CREATE TABLE files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL REFERENCES shops(id),
  kind        text NOT NULL CHECK (kind IN ('shop_logo','upi_qr')),
  storage_key text NOT NULL UNIQUE,
  mime        text NOT NULL CHECK (mime IN ('image/webp','image/png','image/jpeg')),
  size_bytes  int  NOT NULL CHECK (size_bytes > 0),
  sha256      text NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, shop_id)
);
CREATE INDEX files_shop_idx ON files (shop_id);

-- A shop can only point at its OWN files (composite FK); deleting a file clears only the pointer column.
ALTER TABLE shops
  ADD CONSTRAINT shops_logo_fk FOREIGN KEY (logo_file_id, id)   REFERENCES files(id, shop_id) ON DELETE SET NULL (logo_file_id),
  ADD CONSTRAINT shops_qr_fk   FOREIGN KEY (upi_qr_file_id, id) REFERENCES files(id, shop_id) ON DELETE SET NULL (upi_qr_file_id);

-- weekday: ISO 1 = Monday ... 7 = Sunday. One opening window per day.
CREATE TABLE shop_hours (
  shop_id    uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  weekday    smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_closed  boolean NOT NULL DEFAULT false,
  open_time  time,
  close_time time,
  PRIMARY KEY (shop_id, weekday),
  CONSTRAINT shop_hours_window_chk CHECK (
    (is_closed AND open_time IS NULL AND close_time IS NULL) OR
    (NOT is_closed AND open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time))
);

ALTER TABLE files      ENABLE ROW LEVEL SECURITY; ALTER TABLE files      FORCE ROW LEVEL SECURITY;
ALTER TABLE shop_hours ENABLE ROW LEVEL SECURITY; ALTER TABLE shop_hours FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON files
  USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform());
CREATE POLICY tenant_isolation ON shop_hours
  USING (shop_id = app_shop_id() OR app_is_platform()) WITH CHECK (shop_id = app_shop_id() OR app_is_platform());

-- PUBLIC (customer website) read access: SELECT only, active shops only, and only the logo file.
-- Enabled per-transaction by Db.tenant({publicRead:true}); never allows writes.
CREATE POLICY public_read ON shops      FOR SELECT USING (app_is_public() AND status = 'active');
CREATE POLICY public_read ON shop_hours FOR SELECT USING (app_is_public() AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
CREATE POLICY public_read ON files      FOR SELECT USING (app_is_public() AND kind = 'shop_logo' AND EXISTS (SELECT 1 FROM shops s WHERE s.id = shop_id AND s.status = 'active'));
