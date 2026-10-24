import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes, PERMISSION_KEYS, PERMISSIONS, PermissionScope } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { assertCanGrant, validatePermissionMap } from './rbac.helpers';

const notFound = () => new AppException(404, ErrorCodes.NOT_FOUND, 'Role not found.');
const ownerAll = () => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'all']));

@Injectable()
export class RolesService {
  constructor(private db: Db, private audit: AuditService) {}

  catalog() { return PERMISSIONS; }

  list(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const rows = (await c.query(
        `SELECT r.id, r.name, r.is_system, r.system_key,
                COALESCE(jsonb_object_agg(p.key, rp.scope) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions,
                (SELECT count(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
           FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id LEFT JOIN permissions p ON p.id = rp.permission_id
          GROUP BY r.id ORDER BY r.created_at, r.name`)).rows;
      return rows.map((r) => (r.system_key === 'owner' ? { ...r, permissions: ownerAll() } : r));
    });
  }

  async get(ctx: AuthContext, id: string) {
    const all = await this.list(ctx);
    const r = all.find((x) => x.id === id);
    if (!r) throw notFound(); // RLS hides other shops' roles, so a foreign id is simply "not found"
    return r;
  }

  create(ctx: AuthContext, actor: Effective, dto: { name: string; permissions: Record<string, string> }) {
    const perms = validatePermissionMap(dto.permissions);
    assertCanGrant(actor, perms);
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      let id: string;
      try {
        id = (await c.query('INSERT INTO roles (shop_id, name) VALUES ($1,$2) RETURNING id', [ctx.shopId, dto.name])).rows[0].id;
      } catch (e) { throw this.nameConflict(e); }
      await this.writePermissions(c, ctx.shopId!, id, perms);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'role.create', entity: 'role', entityId: id, newValues: { name: dto.name, permissions: perms }, ip: ctx.ip });
      return { id, name: dto.name, is_system: false, permissions: perms };
    });
  }

  rename(ctx: AuthContext, id: string, name: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = await this.lock(c, id);
      if (r.is_system) throw new AppException(409, ErrorCodes.CONFLICT, "System roles can't be renamed.");
      try { await c.query('UPDATE roles SET name=$2 WHERE id=$1', [id, name]); } catch (e) { throw this.nameConflict(e); }
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'role.rename', entity: 'role', entityId: id, oldValues: { name: r.name }, newValues: { name }, ip: ctx.ip });
      return { id, name };
    });
  }

  setPermissions(ctx: AuthContext, actor: Effective, id: string, input: Record<string, string>) {
    const perms = validatePermissionMap(input);
    assertCanGrant(actor, perms);
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = await this.lock(c, id);
      if (r.system_key === 'owner') throw new AppException(409, ErrorCodes.CONFLICT, 'The Owner role always has full access and cannot be edited.');
      const before = await this.currentPermissions(c, id);
      // A non-owner must not be able to strip or alter grants they could not themselves give.
      assertCanGrant(actor, before);
      await c.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      await this.writePermissions(c, ctx.shopId!, id, perms);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'role.permissions.update', entity: 'role', entityId: id, oldValues: before, newValues: perms, ip: ctx.ip });
      return { id, permissions: perms };
    });
  }

  remove(ctx: AuthContext, id: string) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const r = await this.lock(c, id);
      if (r.is_system) throw new AppException(409, ErrorCodes.CONFLICT, "System roles can't be deleted.");
      const n = (await c.query('SELECT count(*)::int AS n FROM user_roles WHERE role_id=$1', [id])).rows[0].n;
      if (n > 0) throw new AppException(409, ErrorCodes.CONFLICT, `This role is assigned to ${n} user(s). Reassign them first.`);
      await c.query('DELETE FROM roles WHERE id=$1', [id]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'role.delete', entity: 'role', entityId: id, oldValues: { name: r.name }, ip: ctx.ip });
      return { deleted: true };
    });
  }

  private async lock(c: PoolClient, id: string) {
    const r = (await c.query('SELECT id, name, is_system, system_key FROM roles WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!r) throw notFound();
    return r;
  }
  private async currentPermissions(c: PoolClient, roleId: string): Promise<Record<string, PermissionScope>> {
    const rows = (await c.query('SELECT p.key, rp.scope FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1', [roleId])).rows;
    return Object.fromEntries(rows.map((r) => [r.key, r.scope]));
  }
  private async writePermissions(c: PoolClient, shopId: string, roleId: string, perms: Record<string, PermissionScope>) {
    const keys = Object.keys(perms);
    if (!keys.length) return;
    await c.query(
      `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope)
       SELECT $1, $2, p.id, x.scope FROM unnest($3::text[], $4::text[]) AS x(key, scope) JOIN permissions p ON p.key = x.key`,
      [roleId, shopId, keys, keys.map((k) => perms[k])]);
  }
  private nameConflict(e: unknown) {
    return isUniqueViolation(e) ? new AppException(409, ErrorCodes.CONFLICT, 'A role with this name already exists.') : e;
  }
}
