import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ErrorCodes, PermissionScope } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext, Effective } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { assertCanGrant } from './rbac.helpers';

export interface StaffInput { name: string; phone?: string; email?: string; password: string; roleIds: string[] }
const notFound = () => new AppException(404, ErrorCodes.NOT_FOUND, 'User not found.');
const forbid = (m: string) => new AppException(403, ErrorCodes.FORBIDDEN, m);

@Injectable()
export class UsersService {
  constructor(private db: Db, private audit: AuditService) {}

  list(ctx: AuthContext) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) =>
      (await c.query(
        `SELECT u.id, u.name, u.phone, u.email, u.status, u.last_login_at,
                COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
           FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.shop_id = $1 AND u.type = 'staff' GROUP BY u.id ORDER BY u.created_at`, [ctx.shopId])).rows);
  }

  /** Creates a staff login in the caller's shop. */
  async create(ctx: AuthContext, actor: Effective, dto: StaffInput) {
    const hash = await hashPassword(dto.password);
    return this.db.tenant({ shopId: ctx.shopId }, (c) => this.createIn(c, ctx, actor, dto, hash));
  }

  /** Same, inside an existing tenant transaction (e.g. worker + login created atomically). Pass a pre-computed hash. */
  async createIn(c: PoolClient, ctx: AuthContext, actor: Effective, dto: StaffInput, passwordHash: string) {
    await this.assertRolesAssignable(c, actor, dto.roleIds);
    let id: string;
    try {
      id = (await c.query(
        `INSERT INTO users (type, name, phone, email, password_hash, shop_id) VALUES ('staff',$1,$2,$3,$4,$5) RETURNING id`,
        [dto.name, dto.phone ?? null, dto.email ?? null, passwordHash, ctx.shopId])).rows[0].id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppException(409, ErrorCodes.CONFLICT, 'An account with this mobile number or email already exists.');
      throw e;
    }
    await this.writeRoles(c, ctx.shopId!, id, dto.roleIds);
    await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'user.create', entity: 'user', entityId: id, newValues: { name: dto.name, roleIds: dto.roleIds }, ip: ctx.ip });
    return { id, name: dto.name, roleIds: dto.roleIds };
  }

  setRoles(ctx: AuthContext, actor: Effective, userId: string, roleIds: string[]) {
    if (userId === ctx.userId) throw forbid("You can't change your own roles.");
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      await this.target(c, ctx, userId);
      const ids = [...new Set(roleIds)];
      await this.assertRolesAssignable(c, actor, ids);
      const old = await this.roleRows(c, userId);
      const hadOwner = old.some((r) => r.system_key === 'owner');
      if (hadOwner && !actor.isOwner) throw forbid("Only an Owner can change another Owner's roles.");
      const next = (await c.query('SELECT id, system_key FROM roles WHERE id = ANY($1::uuid[])', [ids])).rows;
      if (hadOwner && !next.some((r) => r.system_key === 'owner')) await this.assertAnotherOwner(c, userId);
      await c.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
      await this.writeRoles(c, ctx.shopId!, userId, ids);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'user.roles.update', entity: 'user', entityId: userId, oldValues: { roleIds: old.map((r) => r.id) }, newValues: { roleIds: ids }, ip: ctx.ip });
      return { id: userId, roleIds: ids };
    });
  }

  setStatus(ctx: AuthContext, actor: Effective, userId: string, status: 'active' | 'disabled') {
    if (userId === ctx.userId) throw forbid("You can't change your own status.");
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const u = await this.target(c, ctx, userId);
      const roles = await this.roleRows(c, userId);
      const isOwner = roles.some((r) => r.system_key === 'owner');
      if (isOwner && !actor.isOwner) throw forbid("Only an Owner can change another Owner's status.");
      if (isOwner && status === 'disabled') await this.assertAnotherOwner(c, userId);
      await c.query('UPDATE users SET status=$2, updated_at=now() WHERE id=$1', [userId, status]);
      if (status === 'disabled') await c.query('UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
      await this.audit.log(c, { shopId: ctx.shopId, userId: ctx.userId, action: 'user.status.update', entity: 'user', entityId: userId, oldValues: { status: u.status }, newValues: { status }, ip: ctx.ip });
      return { id: userId, status };
    });
  }

  // ---- helpers (all queries run inside the caller's tenant transaction) ----
  private async target(c: PoolClient, ctx: AuthContext, userId: string) {
    const u = (await c.query(`SELECT id, status FROM users WHERE id=$1 AND shop_id=$2 AND type='staff' FOR UPDATE`, [userId, ctx.shopId])).rows[0];
    if (!u) throw notFound(); // staff of other shops are indistinguishable from non-existent
    return u;
  }
  private roleRows(c: PoolClient, userId: string) {
    return c.query('SELECT r.id, r.system_key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [userId]).then((r) => r.rows);
  }
  private async writeRoles(c: PoolClient, shopId: string, userId: string, roleIds: string[]) {
    await c.query('INSERT INTO user_roles (user_id, shop_id, role_id) SELECT $1, $2, unnest($3::uuid[])', [userId, shopId, [...new Set(roleIds)]]);
  }
  private async assertAnotherOwner(c: PoolClient, excludeUserId: string) {
    const n = (await c.query(
      `SELECT count(*)::int AS n FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
        WHERE r.system_key='owner' AND u.status='active' AND u.id <> $1`, [excludeUserId])).rows[0].n;
    if (n < 1) throw new AppException(409, ErrorCodes.CONFLICT, 'The shop must keep at least one active Owner.');
  }
  private async assertRolesAssignable(c: PoolClient, actor: Effective, roleIds: string[]) {
    const ids = [...new Set(roleIds)];
    const roles = (await c.query('SELECT id, system_key FROM roles WHERE id = ANY($1::uuid[])', [ids])).rows; // RLS: this shop only
    if (roles.length !== ids.length) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'One or more roles do not exist.');
    if (actor.isOwner) return;
    if (roles.some((r) => r.system_key === 'owner')) throw forbid('Only an Owner can assign the Owner role.');
    const perms = (await c.query(
      'SELECT p.key, rp.scope FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id = ANY($1::uuid[])', [ids])).rows;
    const merged: Record<string, PermissionScope> = {};
    for (const p of perms) if (merged[p.key] !== 'all') merged[p.key] = p.scope;
    assertCanGrant(actor, merged);
  }
}
