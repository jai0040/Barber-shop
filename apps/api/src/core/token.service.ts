import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config';

export interface AccessClaims { sub: string; typ: 'platform' | 'staff' | 'customer'; shop: string | null }

@Injectable()
export class TokenService {
  private cfg = loadConfig();

  signAccess(u: { id: string; type: AccessClaims['typ']; shop_id: string | null }): string {
    return jwt.sign({ typ: u.type, shop: u.shop_id }, this.cfg.JWT_ACCESS_SECRET, {
      subject: u.id, expiresIn: `${this.cfg.ACCESS_TOKEN_TTL_MIN}m`, issuer: 'barbershop', algorithm: 'HS256',
    });
  }
  verifyAccess(token: string): AccessClaims {
    return jwt.verify(token, this.cfg.JWT_ACCESS_SECRET, { issuer: 'barbershop', algorithms: ['HS256'] }) as unknown as AccessClaims;
  }

  /** Opaque refresh token "<id>.<secret>"; only an HMAC of the secret is stored. */
  newRefresh() {
    const id = randomUUID(), secret = randomBytes(32).toString('hex');
    return { id, raw: `${id}.${secret}`, hash: this.hash(secret) };
  }
  parseRefresh(raw: string): { id: string; secret: string } | null {
    const m = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(raw ?? '');
    return m ? { id: m[1], secret: m[2] } : null;
  }
  hash(secret: string) { return createHmac('sha256', this.cfg.JWT_REFRESH_SECRET).update(secret).digest('hex'); }
  safeEqual(a: string, b: string) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  newCsrf() { return randomBytes(24).toString('hex'); }
}
