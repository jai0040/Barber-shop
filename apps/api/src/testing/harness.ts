import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Pool } from 'pg';
import net from 'net';

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

export interface Harness {
  base: string; ownerPool: Pool; appPool: Pool; appUrl: string; ownerUrl: string; app: any;
  close(): Promise<void>;
  call(method: string, p: string, o?: { token?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: any; headers: Headers }>;
  upload(p: string, token: string | undefined, file: Buffer | null, o?: { filename?: string; mime?: string; field?: string }): Promise<{ status: number; body: any; headers: Headers }>;
  uploadDir: string;
}

/** Boots a real PostgreSQL + the real Nest app (same pipeline as production). */
export async function boot(port?: number, env: Record<string, string> = {}, extraControllers: any[] = []): Promise<Harness> {
  const actualPort = port ?? await getFreePort();
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(path.join(tmpdir(), 'bs-pg-')), user: 'postgres', password: 'pw', port: actualPort,
    persistent: true, createPostgresUser: false, onLog: () => undefined, onError: (e: any) => console.error('[EMBEDDED-PG-ERR]', e),
  });
  await pg.initialise(); await pg.start();
  const uploadDir = mkdtempSync(path.join(tmpdir(), 'bs-up-'));
  const ownerUrl = `postgresql://postgres:pw@localhost:${actualPort}/postgres`;
  const appUrl = `postgresql://barber_app:apppw@localhost:${actualPort}/postgres`;
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: appUrl, MIGRATION_DATABASE_URL: ownerUrl,
    JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
    UPLOAD_DIR: uploadDir, MAX_UPLOAD_MB: '1', LOGIN_RATE_LIMIT: '1000', REGISTER_RATE_LIMIT: '1000', GLOBAL_RATE_LIMIT: '100000', ...env,
  });
  const { migrate } = await import('../db/migrate');
  await migrate(ownerUrl, appUrl, () => undefined);
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../app.setup');
  const { Module } = await import('@nestjs/common');
  class TestRoot {}
  Module({ imports: [AppModule], controllers: extraControllers })(TestRoot); // decorator mutates the class; returns void
  const Root = TestRoot;
  const app = await NestFactory.create(Root as any, { logger: false, abortOnError: false });
  configureApp(app);
  await app.listen(0);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}/api/v1`;
  const ownerPool = new Pool({ connectionString: ownerUrl, max: 3 });
  const appPool = new Pool({ connectionString: appUrl, max: 3 });
  return {
    base, ownerPool, appPool, appUrl, ownerUrl, uploadDir, app,
    async close() {
      const srv = app.getHttpServer() as any;
      try { srv?.close?.(); } catch {}
      try { srv?.closeAllConnections?.(); } catch {}
      try { srv?.closeIdleConnections?.(); } catch {}
      try {
        const { Db } = await import('../db/db.service');
        const db = app.get(Db, { strict: false });
        await db?.pool?.end().catch(() => undefined);
      } catch {}
      await app.close().catch(() => undefined);
      await ownerPool.end().catch(() => undefined);
      await appPool.end().catch(() => undefined);
      try {
        const proc = (pg as any)?.process;
        if (proc) {
          proc.stdin?.destroy?.();
          proc.stdout?.destroy?.();
          proc.stderr?.destroy?.();
          proc.unref?.();
          try { process.kill(proc.pid, 'SIGKILL'); } catch {}
          try { proc.kill('SIGKILL'); } catch {}
        }
      } catch {}
      await Promise.race([pg.stop().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 300))]);
    },
    async upload(p, token, file, o = {}) {
      const fd = new FormData();
      if (file) fd.append(o.field ?? 'file', new Blob([new Uint8Array(file)], { type: o.mime ?? 'image/png' }), o.filename ?? 'upload.png');
      const res = await fetch(base + p, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    },
    async call(method, p, o = {}) {
      const res = await fetch(base + p, {
        method, headers: { 'content-type': 'application/json', connection: 'close', ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
      const body = await res.json().catch(() => null);
      if (body && body.data && typeof body.data === 'object' && Array.isArray(body.data.items)) {
        const arr = body.data.items;
        Object.assign(arr, body.data);
        if (!body.data.find) {
          Object.defineProperty(body.data, 'find', { value: (...a: any[]) => arr.find(...a), configurable: true });
          Object.defineProperty(body.data, 'filter', { value: (...a: any[]) => arr.filter(...a), configurable: true });
          Object.defineProperty(body.data, 'map', { value: (...a: any[]) => arr.map(...a), configurable: true });
          Object.defineProperty(body.data, 'length', { get: () => arr.length, configurable: true });
          Object.defineProperty(body.data, Symbol.iterator, { value: function* () { yield* arr; }, configurable: true });
        }
      }
      return { status: res.status, body, headers: res.headers };
    },
  };
}
