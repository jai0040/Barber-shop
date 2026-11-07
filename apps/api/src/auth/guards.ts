import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { IS_AUTHENTICATED, IS_PUBLIC, PERMISSIONS_META, PLATFORM_ONLY, SKIP_CSRF, STAFF_ONLY, CUSTOMER_ONLY } from '../common/decorators';
import { Db } from '../db/db.service';
import { TokenService } from '../core/token.service';
import { PermissionsService, hasAny } from '../core/permissions.service';

const flag = (r: Reflector, key: string, ctx: ExecutionContext) => r.getAllAndOverride<boolean>(key, [ctx.getHandler(), ctx.getClass()]);

/** 1. Who is calling? Verifies the access token and that the account/shop is still active. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private r: Reflector, private tokens: TokenService, private db: Db) {}

  async canActivate(ctx: ExecutionContext) {
    if (flag(this.r, IS_PUBLIC, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : undefined;
    const token = bearer ?? req.cookies?.access_token ?? queryToken;
    if (!token) throw new AppException(401, ErrorCodes.UNAUTHENTICATED, 'Please log in to continue.');

    let claims;
    try { claims = this.tokens.verifyAccess(token); }
    catch (e) {
      if (e instanceof jwt.TokenExpiredError) throw new AppException(401, ErrorCodes.SESSION_EXPIRED, 'Your session has expired. Please log in again.');
      throw new AppException(401, ErrorCodes.UNAUTHENTICATED, 'Please log in to continue.');
    }
    const u = (await this.db.query('SELECT id, type, status, shop_id FROM users WHERE id = $1', [claims.sub])).rows[0];
    if (!u || u.status !== 'active' || u.type !== claims.typ || (u.shop_id ?? null) !== (claims.shop ?? null)) {
      throw new AppException(401, ErrorCodes.UNAUTHENTICATED, 'Please log in to continue.');
    }
    if (u.type === 'staff') {
      const shop = await this.db.tenant({ shopId: u.shop_id }, async (c) => (await c.query('SELECT status FROM shops WHERE id=$1', [u.shop_id])).rows[0]);
      if (!shop || shop.status !== 'active') throw new AppException(403, ErrorCodes.FORBIDDEN, 'This shop is currently suspended.');
    }
    req.auth = { userId: u.id, type: u.type, shopId: u.shop_id ?? null, ip: req.ip ?? null };
    return true;
  }
}

/** 2. Double-submit CSRF check, only for cookie-authenticated state-changing requests. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private r: Reflector, private tokens: TokenService) {}
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || flag(this.r, SKIP_CSRF, ctx)) return true;
    if (req.headers.authorization) return true; // explicit header credentials are not auto-sent by browsers
    if (!req.cookies?.access_token && !req.cookies?.refresh_token) return true;
    const header = req.headers['x-csrf-token'], cookie = req.cookies?.csrf_token;
    if (typeof header === 'string' && typeof cookie === 'string' && this.tokens.safeEqual(header, cookie)) return true;
    throw new AppException(403, ErrorCodes.CSRF_FAILED, 'Security check failed. Please refresh the page and try again.');
  }
}

/** 3. May they do this? Secure by default: a route with no declared access rule is refused. */
@Injectable()
export class PermissionGuard implements CanActivate {
  private log = new Logger('PermissionGuard');
  constructor(private r: Reflector, private perms: PermissionsService) {}

  async canActivate(ctx: ExecutionContext) {
    if (flag(this.r, IS_PUBLIC, ctx)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.auth!;
    const required = this.r.getAllAndOverride<string[] | undefined>(PERMISSIONS_META, [ctx.getHandler(), ctx.getClass()]);
    const forbidden = (m = "You don't have permission to do this.") => new AppException(403, ErrorCodes.FORBIDDEN, m);

    if (flag(this.r, PLATFORM_ONLY, ctx)) {
      if (auth.type !== 'platform') throw forbidden();
      return true;
    }
    if (required?.length) {
      if (auth.type !== 'staff' || !auth.shopId) throw forbidden();
      const eff = await this.perms.effective(auth.shopId, auth.userId);
      if (!hasAny(eff, required)) throw forbidden();
      req.perms = eff;
      return true;
    }
    if (flag(this.r, CUSTOMER_ONLY, ctx)) {
      if (auth.type !== 'customer') throw forbidden();
      return true;
    }
    if (flag(this.r, STAFF_ONLY, ctx)) {
      if (auth.type !== 'staff' || !auth.shopId) throw forbidden();
      return true;
    }
    if (flag(this.r, IS_AUTHENTICATED, ctx)) return true;
    this.log.error(`Route ${req.method} ${req.path} has no access rule; refusing.`);
    throw forbidden('This endpoint is not available.');
  }
}
