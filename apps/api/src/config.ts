import { z } from 'zod';

const bool = z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  MIGRATION_DATABASE_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 chars'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  DEFAULT_COUNTRY_CODE: z.string().regex(/^\d{1,3}$/).default('91'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),
  TRUST_PROXY: bool,
  COOKIE_SECURE: bool,
  AUTH_RETURN_TOKENS_IN_BODY: bool,
  GLOBAL_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
}).transform((c) => ({
  ...c,
  TRUST_PROXY: c.TRUST_PROXY ?? false,
  COOKIE_SECURE: c.COOKIE_SECURE ?? c.NODE_ENV === 'production',
  // Tokens in the JSON body defeat httpOnly cookies, so this is OFF in production unless explicitly enabled.
  AUTH_RETURN_TOKENS_IN_BODY: c.AUTH_RETURN_TOKENS_IN_BODY ?? c.NODE_ENV !== 'production',
}));
export type Config = z.output<typeof schema>;

let cached: Config | undefined;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached && env === process.env) return cached;
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}
