import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthContext, Effective } from './types';

export const IS_PUBLIC = 'isPublic';
export const IS_AUTHENTICATED = 'isAuthenticated';
export const SKIP_CSRF = 'skipCsrf';
export const PLATFORM_ONLY = 'platformOnly';
export const STAFF_ONLY = 'staffOnly';
export const PERMISSIONS_META = 'permissions';

/** No login needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Any logged-in user (customer, staff or platform). */
export const Authenticated = () => SetMetadata(IS_AUTHENTICATED, true);
/** Login/register only: nothing to forge before a session exists. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);
/** Any staff member of a shop (no specific permission needed). */
export const StaffOnly = () => SetMetadata(STAFF_ONLY, true);
/** Staff user must hold ANY of the listed permissions. */
export const RequirePermission = (...keys: string[]) => SetMetadata(PERMISSIONS_META, keys);

export const Auth = createParamDecorator((_d, ctx: ExecutionContext): AuthContext =>
  ctx.switchToHttp().getRequest().auth);
export const Perms = createParamDecorator((_d, ctx: ExecutionContext): Effective =>
  ctx.switchToHttp().getRequest().perms);
