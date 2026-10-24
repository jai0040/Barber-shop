import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthContext } from '../common/types';
import { Auth, Authenticated, Public, SkipCsrf } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { loadConfig } from '../config';
import { AuthService, Session } from './auth.service';
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from './schemas';

const cfg = loadConfig();
const meta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });

function setCookies(res: Response, s: Session) {
  const base = { secure: cfg.COOKIE_SECURE, sameSite: 'lax' as const };
  res.cookie('access_token', s.accessToken, { ...base, httpOnly: true, path: '/', maxAge: cfg.ACCESS_TOKEN_TTL_MIN * 60_000 });
  res.cookie('refresh_token', s.refreshToken, { ...base, httpOnly: true, path: '/api/v1/auth', expires: s.refreshExpiresAt });
  res.cookie('csrf_token', s.csrfToken, { ...base, httpOnly: false, path: '/', expires: s.refreshExpiresAt });
}
function clearCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });
  res.clearCookie('csrf_token', { path: '/' });
}
function respond(res: Response, r: { session: Session; body: object }) {
  setCookies(res, r.session);
  return {
    ...r.body, csrfToken: r.session.csrfToken,
    ...(cfg.AUTH_RETURN_TOKENS_IN_BODY ? { accessToken: r.session.accessToken, refreshToken: r.session.refreshToken } : {}),
  };
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @SkipCsrf() @Post('register')
  @Throttle({ default: { limit: () => cfg.REGISTER_RATE_LIMIT, ttl: 60_000 } })
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.register(dto, meta(req)));
  }

  @Public() @SkipCsrf() @Post('login') @HttpCode(200)
  @Throttle({ default: { limit: () => cfg.LOGIN_RATE_LIMIT, ttl: 60_000 } })
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.login(dto, meta(req)));
  }

  @Public() @Post('refresh') @HttpCode(200)
  @Throttle({ default: { limit: () => cfg.LOGIN_RATE_LIMIT * 3, ttl: 60_000 } })
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.refresh_token ?? (cfg.AUTH_RETURN_TOKENS_IN_BODY ? dto?.refreshToken : undefined);
    try { return respond(res, await this.auth.refresh(raw, meta(req))); }
    catch (e) { clearCookies(res); throw e; }
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) dto: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.refresh_token ?? dto?.refreshToken);
    clearCookies(res);
    return { loggedOut: true };
  }

  @Authenticated() @Get('me')
  me(@Auth() ctx: AuthContext) { return this.auth.me(ctx); }

  @Authenticated() @Post('change-password') @HttpCode(200)
  async changePassword(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(changePasswordSchema)) dto: any, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(ctx, dto);
    clearCookies(res);
    return { changed: true, message: 'Password changed. Please log in again.' };
  }
}
