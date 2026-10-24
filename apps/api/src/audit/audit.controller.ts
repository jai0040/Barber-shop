import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Db } from '../db/db.service';

const q = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
  entity: z.string().max(50).optional(), entityId: z.string().max(100).optional(), userId: z.string().uuid().optional(),
  action: z.string().max(80).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(private db: Db) {}

  @RequirePermission('audit.view') @Get()
  list(@Auth() ctx: AuthContext, @Query(new ZodValidationPipe(q)) f: z.infer<typeof q>) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const w: string[] = ['TRUE']; const p: unknown[] = [];
      const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)); };
      if (f.entity) add('a.entity = ?', f.entity);
      if (f.entityId) add('a.entity_id = ?', f.entityId);
      if (f.userId) add('a.user_id = ?', f.userId);
      if (f.action) add('a.action = ?', f.action);
      if (f.from) add('a.created_at >= ?', f.from);
      if (f.to) add('a.created_at <= ?', f.to);
      const total = (await c.query(`SELECT count(*)::int AS n FROM audit_logs a WHERE ${w.join(' AND ')}`, p)).rows[0].n;
      const items = (await c.query(
        `SELECT a.id, a.action, a.entity, a.entity_id, a.old_values, a.new_values, a.created_at, a.user_id, u.name AS user_name
           FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${w.join(' AND ')}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`, p)).rows;
      return { items, page: f.page, limit: f.limit, total };
    });
  }
}
