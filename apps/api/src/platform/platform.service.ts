import { Injectable } from '@nestjs/common';
import { ErrorCodes, ROLE_TEMPLATES } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db, isUniqueViolation } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { loadConfig } from '../config';

@Injectable()
export class PlatformService {
  constructor(private db: Db, private audit: AuditService) {}

  list() {
    return this.db.tenant({ platform: true }, async (c) =>
      (await c.query('SELECT id, name, slug, status, timezone, created_at FROM shops ORDER BY created_at')).rows);
  }

  /** Creates the shop, its default roles (from templates) and the first Owner, atomically. */
  async createShop(ctx: AuthContext, dto: { name: string; slug: string; owner: { name: string; phone?: string; email?: string; password: string } }) {
    const hash = await hashPassword(dto.owner.password);
    return this.db.tenant({ platform: true }, async (c) => {
      let shopId: string;
      try {
        shopId = (await c.query('INSERT INTO shops (name, slug, timezone) VALUES ($1,$2,$3) RETURNING id', [dto.name, dto.slug, loadConfig().DEFAULT_TIMEZONE])).rows[0].id;
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppException(409, ErrorCodes.CONFLICT, 'A shop with this URL name already exists.');
        throw e;
      }
      let ownerRoleId = '';
      for (const t of ROLE_TEMPLATES) {
        const roleId = (await c.query('INSERT INTO roles (shop_id, name, is_system, system_key) VALUES ($1,$2,true,$3) RETURNING id', [shopId, t.name, t.systemKey])).rows[0].id;
        if (t.systemKey === 'owner') ownerRoleId = roleId;
        const keys = Object.keys(t.permissions);
        if (keys.length) {
          await c.query(
            `INSERT INTO role_permissions (role_id, shop_id, permission_id, scope)
             SELECT $1, $2, p.id, x.scope FROM unnest($3::text[], $4::text[]) AS x(key, scope) JOIN permissions p ON p.key = x.key`,
            [roleId, shopId, keys, keys.map((k) => t.permissions[k])]);
        }
      }
      let ownerId: string;
      try {
        ownerId = (await c.query(
          `INSERT INTO users (type, name, phone, email, password_hash, shop_id) VALUES ('staff',$1,$2,$3,$4,$5) RETURNING id`,
          [dto.owner.name, dto.owner.phone ?? null, dto.owner.email ?? null, hash, shopId])).rows[0].id;
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppException(409, ErrorCodes.CONFLICT, 'The owner mobile number or email is already registered.');
        throw e;
      }
      await c.query('INSERT INTO user_roles (user_id, shop_id, role_id) VALUES ($1,$2,$3)', [ownerId, shopId, ownerRoleId]);
      await this.audit.log(c, { shopId, userId: ctx.userId, action: 'shop.create', entity: 'shop', entityId: shopId, newValues: { name: dto.name, slug: dto.slug, ownerId }, ip: ctx.ip });
      return { id: shopId, name: dto.name, slug: dto.slug, ownerId };
    });
  }

  setStatus(ctx: AuthContext, id: string, status: 'active' | 'suspended') {
    return this.db.tenant({ platform: true }, async (c) => {
      const s = (await c.query('SELECT status FROM shops WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw new AppException(404, ErrorCodes.NOT_FOUND, 'Shop not found.');
      await c.query('UPDATE shops SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
      await this.audit.log(c, { shopId: id, userId: ctx.userId, action: 'shop.status.update', entity: 'shop', entityId: id, oldValues: { status: s.status }, newValues: { status }, ip: ctx.ip });
      return { id, status };
    });
  }
}
