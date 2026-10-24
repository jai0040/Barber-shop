import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { z } from 'zod';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { TokenService } from '../core/token.service';
import { PermissionsService, permsToObject } from '../core/permissions.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config';
import { changePasswordSchema, loginSchema, registerSchema } from './schemas';
import { normalizePhone } from './phone';

type Meta = { ip: string | null; userAgent: string | null };
interface UserRow {
  id: string; type: 'platform' | 'staff' | 'customer'; name: string; phone: string | null; email: string | null;
  password_hash: string; status: string; shop_id: string | null; failed_login_count: number; locked_until: Date | null;
}
export interface Session { accessToken: string; refreshToken: string; csrfToken: string; refreshExpiresAt: Date }

const ARGON = { type: argon2.argon2id as 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (p: string) => argon2.hash(p, ARGON);
let dummy: Promise<string> | undefined;

@Injectable()
export class AuthService {
  private cfg = loadConfig();
  constructor(private db: Db, private tokens: TokenService, private perms: PermissionsService, private audit: AuditService) {}

  private invalid() { return new AppException(401, ErrorCodes.UNAUTHENTICATED, 'Incorrect mobile/email or password.'); }

  async register(input: z.infer<typeof registerSchema>, meta: Meta) {
    const hash = await hashPassword(input.password);
    let user: UserRow;
    try {
      user = (await this.db.query<UserRow>(
        `INSERT INTO users (type, name, phone, email, password_hash) VALUES ('customer',$1,$2,$3,$4) RETURNING *`,
        [input.name, input.phone, input.email ?? null, hash])).rows[0];
    } catch (e) {
      if (isUniqueViolation(e)) {
        const field = String((e as any).constraint).includes('email') ? 'email address' : 'mobile number';
        throw new AppException(409, ErrorCodes.CONFLICT, `An account with this ${field} already exists. Try logging in.`);
      }
      throw e;
    }
    return this.start(user, meta);
  }

  async login(input: z.infer<typeof loginSchema>, meta: Meta) {
    const ident = input.identifier.trim();
    let user: UserRow | undefined;
    if (ident.includes('@')) {
      user = (await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [ident.toLowerCase()])).rows[0];
    } else {
      const phone = normalizePhone(ident, this.cfg.DEFAULT_COUNTRY_CODE);
      if (phone) user = (await this.db.query<UserRow>('SELECT * FROM users WHERE phone = $1', [phone])).rows[0];
    }
    if (!user) {
      dummy ??= hashPassword('timing-equaliser-password');
      await argon2.verify(await dummy, input.password).catch(() => false); // same cost whether or not the user exists
      throw this.invalid();
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new AppException(429, ErrorCodes.RATE_LIMITED, `Too many failed attempts. Try again in ${this.cfg.LOCKOUT_MINUTES} minutes.`);
    }
    if (!(await argon2.verify(user.password_hash, input.password).catch(() => false))) {
      await this.db.query(
        `UPDATE users SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1`, [user.id, this.cfg.MAX_FAILED_LOGINS, this.cfg.LOCKOUT_MINUTES]);
      throw this.invalid();
    }
    if (user.status !== 'active') throw new AppException(403, ErrorCodes.FORBIDDEN, 'This account has been disabled. Please contact the shop.');
    await this.db.query('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    return this.start(user, meta);
  }

  /** Issues a session (new token family) and the response payload. */
  private async start(user: UserRow, meta: Meta, familyId?: string) {
    if (user.type === 'staff') await this.assertShopActive(user.shop_id!);
    const session = await this.issue(user, meta, familyId);
    return { session, body: await this.profile(user) };
  }

  private async assertShopActive(shopId: string) {
    const s = await this.db.tenant({ shopId }, async (c) => (await c.query('SELECT status FROM shops WHERE id=$1', [shopId])).rows[0]);
    if (!s || s.status !== 'active') throw new AppException(403, ErrorCodes.FORBIDDEN, 'This shop is currently suspended.');
  }

  private async issue(user: UserRow, meta: Meta, familyId?: string, c?: { query: Db['query'] }): Promise<Session> {
    const r = this.tokens.newRefresh();
    const expires = new Date(Date.now() + this.cfg.REFRESH_TOKEN_TTL_DAYS * 86400_000);
    await (c ?? this.db).query(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, user.id, familyId ?? r.id, r.hash, expires, meta.userAgent?.slice(0, 300) ?? null, meta.ip]);
    return { accessToken: this.tokens.signAccess(user), refreshToken: r.raw, csrfToken: this.tokens.newCsrf(), refreshExpiresAt: expires };
  }

  /** Rotating refresh with reuse detection: replaying a used token revokes the whole family. */
  async refresh(raw: string | undefined, meta: Meta) {
    const bad = () => new AppException(401, ErrorCodes.SESSION_EXPIRED, 'Your session has expired. Please log in again.');
    const parsed = raw ? this.tokens.parseRefresh(raw) : null;
    if (!parsed) throw bad();
    type Out = { ok: true; user: UserRow; session: Session } | { ok: false };
    const out = await this.db.tx<Out>(async (c) => {
      const t = (await c.query('SELECT * FROM refresh_tokens WHERE id = $1 FOR UPDATE', [parsed.id])).rows[0];
      if (!t || !this.tokens.safeEqual(t.token_hash, this.tokens.hash(parsed.secret))) return { ok: false };
      if (t.revoked_at) {
        await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
        return { ok: false };
      }
      if (t.expires_at < new Date()) return { ok: false };
      const user = (await c.query<UserRow>('SELECT * FROM users WHERE id = $1', [t.user_id])).rows[0];
      if (!user || user.status !== 'active') return { ok: false };
      const session = await this.issue(user, meta, t.family_id, c as any);
      await c.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [t.id, this.tokens.parseRefresh(session.refreshToken)!.id]);
      return { ok: true, user, session };
    });
    if (!out.ok) throw bad();
    if (out.user.type === 'staff') await this.assertShopActive(out.user.shop_id!);
    return { session: out.session, body: await this.profile(out.user) };
  }

  async logout(raw: string | undefined) {
    const parsed = raw ? this.tokens.parseRefresh(raw) : null;
    if (!parsed) return;
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE id = $1) AND revoked_at IS NULL`, [parsed.id]);
  }

  async me(ctx: AuthContext) {
    const user = (await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [ctx.userId])).rows[0];
    return this.profile(user);
  }

  async changePassword(ctx: AuthContext, input: z.infer<typeof changePasswordSchema>) {
    const user = (await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [ctx.userId])).rows[0];
    if (!(await argon2.verify(user.password_hash, input.currentPassword).catch(() => false))) {
      throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'Current password is incorrect.');
    }
    const hash = await hashPassword(input.newPassword);
    await this.db.tx(async (c) => {
      await c.query('UPDATE users SET password_hash=$2, updated_at=now() WHERE id=$1', [user.id, hash]);
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]); // sign out everywhere
    });
  }

  private async profile(user: UserRow) {
    const base = { id: user.id, type: user.type, name: user.name, phone: user.phone, email: user.email };
    if (user.type !== 'staff') return { user: base, shop: null, isOwner: false, permissions: {} };
    return this.db.tenant({ shopId: user.shop_id! }, async (c) => {
      const shop = (await c.query('SELECT id, name, slug FROM shops WHERE id = $1', [user.shop_id])).rows[0];
      const eff = await this.perms.effectiveIn(c, user.id);
      const roles = (await c.query('SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [user.id])).rows;
      return { user: { ...base, roles }, shop, isOwner: eff.isOwner, permissions: permsToObject(eff) };
    });
  }
}
