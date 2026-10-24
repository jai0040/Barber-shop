import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface AuditEntry {
  shopId: string | null; userId: string | null; action: string; entity: string;
  entityId?: string | null; oldValues?: unknown; newValues?: unknown; ip?: string | null;
}

@Injectable()
export class AuditService {
  /** Always called with the caller's transaction client, so audit and change commit (or roll back) together. */
  async log(c: PoolClient, e: AuditEntry) {
    await c.query(
      `INSERT INTO audit_logs (shop_id, user_id, action, entity, entity_id, old_values, new_values, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.shopId, e.userId, e.action, e.entity, e.entityId ?? null,
        e.oldValues === undefined ? null : JSON.stringify(e.oldValues),
        e.newValues === undefined ? null : JSON.stringify(e.newValues), e.ip ?? null]);
  }
}
