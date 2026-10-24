import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { ErrorCodes } from '@barbershop/shared';
import { loadConfig } from '../config';
import { AppException } from '../common/app-exception';

export interface TenantScope { shopId?: string | null; platform?: boolean; publicRead?: boolean }

@Injectable()
export class Db implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Db');
  readonly pool = new Pool({ connectionString: loadConfig().DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });

  async onModuleInit() {
    const r = await this.pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    if (r.rows[0]?.rolsuper || r.rows[0]?.rolbypassrls) {
      const msg = 'Application DB role can bypass Row-Level Security. Use a restricted role in DATABASE_URL.';
      if (loadConfig().NODE_ENV === 'production') throw new Error(msg);
      this.log.warn(msg);
    }
  }
  onModuleDestroy() { return this.pool.end(); }

  /** Identity tables only (users, refresh_tokens). Never use for tenant data: RLS would return nothing. */
  query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params as any[]);
  }

  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally { c.release(); }
  }

  /** Runs fn inside a transaction whose RLS context is the given shop. The ONLY way to touch tenant tables. */
  tenant<T>(scope: TenantScope, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if (!scope.platform && !scope.shopId && !scope.publicRead) {
      throw new AppException(403, ErrorCodes.FORBIDDEN, 'This action requires a shop account.');
    }
    return this.tx(async (c) => {
      await c.query(`SELECT set_config('app.shop_id', $1, true), set_config('app.is_platform', $2, true), set_config('app.public_read', $3, true)`,
        [scope.shopId ?? '', scope.platform ? 'on' : 'off', scope.publicRead ? 'on' : 'off']);
      return fn(c);
    });
  }
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';
