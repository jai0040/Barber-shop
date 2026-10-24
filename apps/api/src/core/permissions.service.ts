import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PERMISSION_KEYS, PermissionScope } from '@barbershop/shared';
import { Db } from '../db/db.service';
import { Effective } from '../common/types';

@Injectable()
export class PermissionsService {
  constructor(private readonly db: Db) {}

  effective(shopId: string, userId: string): Promise<Effective> {
    return this.db.tenant({ shopId }, (c) => this.effectiveIn(c, userId));
  }

  async effectiveIn(c: PoolClient, userId: string): Promise<Effective> {
    const rows = (await c.query(
      `SELECT r.system_key, p.key, rp.scope
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1`, [userId])).rows;
    const isOwner = rows.some((r) => r.system_key === 'owner');
    const map = new Map<string, PermissionScope>();
    if (isOwner) PERMISSION_KEYS.forEach((k) => map.set(k, 'all')); // owner always has everything, even new permissions
    else for (const r of rows) if (r.key && map.get(r.key) !== 'all') map.set(r.key, r.scope);
    return { isOwner, map };
  }
}

export const permsToObject = (e: Effective): Record<string, PermissionScope> => Object.fromEntries(e.map);
export const hasAny = (e: Effective, keys: string[]) => keys.some((k) => e.map.has(k));
