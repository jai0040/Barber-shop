import { PermissionScope } from '@barbershop/shared';

export interface AuthContext {
  userId: string;
  type: 'platform' | 'staff' | 'customer';
  shopId: string | null;
  ip: string | null;
}
export interface Effective { isOwner: boolean; map: Map<string, PermissionScope> }

declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext; perms?: Effective }
}
