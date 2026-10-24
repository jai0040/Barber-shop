-- Phase 2: identity, RBAC, tenancy, audit

CREATE FUNCTION app_shop_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.shop_id', true), '')::uuid $$;
CREATE FUNCTION app_is_platform() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE(current_setting('app.is_platform', true), 'off') = 'on' $$;

CREATE TABLE shops (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  timezone   text NOT NULL DEFAULT 'Asia/Kolkata',
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  settings   jsonb NOT NULL DEFAULT '{"cancellation_cooldown_hours":24,"advance_booking_days":30}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- users = global login identity (platform admins, shop staff, customers)
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type               text NOT NULL CHECK (type IN ('platform','staff','customer')),
  name               text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  phone              text,
  email              text,
  password_hash      text NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  shop_id            uuid REFERENCES shops(id),
  failed_login_count int NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_chk CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT users_customer_phone_chk CHECK (type <> 'customer' OR phone IS NOT NULL),
  CONSTRAINT users_shop_chk CHECK ((type = 'staff' AND shop_id IS NOT NULL) OR (type <> 'staff' AND shop_id IS NULL)),
  CONSTRAINT users_phone_fmt CHECK (phone IS NULL OR phone ~ '^\+[0-9]{8,15}$'),
  CONSTRAINT users_email_lower CHECK (email IS NULL OR email = lower(email))
);
CREATE UNIQUE INDEX users_phone_uq ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE email IS NOT NULL;
CREATE INDEX users_shop_idx ON users (shop_id) WHERE shop_id IS NOT NULL;

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Global permission vocabulary (written only by migrations, read-only for the app)
CREATE TABLE permissions (
  id          serial PRIMARY KEY,
  key         text NOT NULL UNIQUE,
  module      text NOT NULL,
  description text NOT NULL,
  supports_own boolean NOT NULL DEFAULT false
);

CREATE TABLE roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    uuid NOT NULL REFERENCES shops(id),
  name       text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 50),
  is_system  boolean NOT NULL DEFAULT false,
  system_key text CHECK (system_key IN ('owner','manager','worker','cashier','inventory_manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name),
  UNIQUE (id, shop_id)
);
CREATE UNIQUE INDEX roles_system_key_uq ON roles (shop_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE role_permissions (
  role_id       uuid NOT NULL,
  shop_id       uuid NOT NULL,
  permission_id int  NOT NULL REFERENCES permissions(id),
  scope         text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','own')),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id, shop_id) REFERENCES roles(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX role_permissions_shop_idx ON role_permissions (shop_id);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL,
  role_id uuid NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (role_id, shop_id) REFERENCES roles(id, shop_id) ON DELETE CASCADE
);
CREATE INDEX user_roles_shop_idx ON user_roles (shop_id);

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  shop_id    uuid REFERENCES shops(id),
  user_id    uuid REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  old_values jsonb,
  new_values jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_shop_time_idx ON audit_logs (shop_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (shop_id, entity, entity_id);

-- ROW LEVEL SECURITY: last line of defence for tenant isolation.
-- A connection with no tenant context (and not platform) sees ZERO rows of these tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','role_permissions','user_roles','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (shop_id = app_shop_id() OR app_is_platform())
      WITH CHECK (shop_id = app_shop_id() OR app_is_platform())$p$, t);
  END LOOP;
END $$;

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shops
  USING (id = app_shop_id() OR app_is_platform())
  WITH CHECK (id = app_shop_id() OR app_is_platform());
