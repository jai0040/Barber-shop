import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { Client } from 'pg';
import { PERMISSIONS } from '@barbershop/shared';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
/** Tables the application role may only INSERT/SELECT (append-only ledgers). */
const APPEND_ONLY = ['audit_logs', 'appointment_status_history', 'customer_loyalty_ledger', 'customer_membership_service_usages', 'worker_commission_ledger', 'worker_payouts'];
/** Records that are cancelled/archived but never physically deleted by the application (history & money trail). */
const NO_DELETE = ['appointments', 'appointment_services', 'customer_memberships'];

export async function migrate(ownerUrl: string, appUrl: string, log: (m: string) => void = console.log) {
  const c = new Client({ connectionString: ownerUrl });
  await c.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log(`applied ${f}`);
      } catch (e) { await c.query('ROLLBACK'); throw new Error(`Migration ${f} failed: ${(e as Error).message}`); }
    }
    await syncPermissions(c);
    await applyGrants(c, appUrl);
  } finally { await c.end(); }
}

async function syncPermissions(c: Client) {
  for (const p of PERMISSIONS) {
    await c.query(
      `INSERT INTO permissions(key, module, description, supports_own) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key) DO UPDATE SET module=EXCLUDED.module, description=EXCLUDED.description, supports_own=EXCLUDED.supports_own`,
      [p.key, p.module, p.description, p.supportsOwn]);
  }
}

/** Creates the restricted application role (no superuser, no BYPASSRLS) and grants least privilege. */
async function applyGrants(c: Client, appUrl: string) {
  const u = new URL(appUrl);
  const role = decodeURIComponent(u.username), pass = decodeURIComponent(u.password);
  const owner = (await c.query('SELECT current_user AS u')).rows[0].u;
  if (role === owner) return; // dev misconfiguration; Db.onModuleInit warns / refuses in production
  const exists = (await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount;
  const q = async (sql: string, ...a: unknown[]) => c.query((await c.query(`SELECT format(${sql}) AS s`, a as any[])).rows[0].s);
  if (!exists) await q(`'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', $1::text, $2::text`, role, pass);
  const db = (await c.query('SELECT current_database() AS d')).rows[0].d;
  await q(`'GRANT CONNECT ON DATABASE %I TO %I', $1::text, $2::text`, db, role);
  await q(`'GRANT USAGE ON SCHEMA public TO %I', $1::text`, role);
  await q(`'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', $1::text`, role);
  await q(`'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', $1::text`, role);
  await q(`'REVOKE ALL ON schema_migrations FROM %I', $1::text`, role);
  await q(`'REVOKE INSERT, UPDATE, DELETE ON permissions FROM %I', $1::text`, role);
  for (const t of NO_DELETE) await q(`'REVOKE DELETE ON %I FROM %I', $1::text, $2::text`, t, role);
  for (const t of APPEND_ONLY) await q(`'REVOKE UPDATE, DELETE ON %I FROM %I', $1::text, $2::text`, t, role);
}
