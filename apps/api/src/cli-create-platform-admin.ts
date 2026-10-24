import { Pool } from 'pg';
import { loadConfig } from './config';
import { hashPassword } from './auth/auth.service';
import { emailSchema, nameSchema, passwordSchema } from './auth/schemas';

/** Usage: PLATFORM_ADMIN_EMAIL=.. PLATFORM_ADMIN_PASSWORD=.. PLATFORM_ADMIN_NAME=.. npm run create-platform-admin -w @barbershop/api */
export async function createPlatformAdmin(url: string, d: { name: string; email: string; password: string }) {
  const v = { name: nameSchema.parse(d.name), email: emailSchema.parse(d.email), password: passwordSchema.parse(d.password) };
  const pool = new Pool({ connectionString: url });
  try {
    const r = await pool.query(
      `INSERT INTO users (type, name, email, password_hash) VALUES ('platform',$1,$2,$3) RETURNING id`,
      [v.name, v.email, await hashPassword(v.password)]);
    return r.rows[0].id as string;
  } finally { await pool.end(); }
}

if (require.main === module) {
  const cfg = loadConfig();
  createPlatformAdmin(cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL, {
    name: process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin',
    email: process.env.PLATFORM_ADMIN_EMAIL ?? '', password: process.env.PLATFORM_ADMIN_PASSWORD ?? '',
  }).then((id) => console.log('platform admin created:', id)).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
