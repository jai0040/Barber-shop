import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { Pool } from 'pg';

export interface Harness {
  base: string; ownerPool: Pool; appPool: Pool; appUrl: string; ownerUrl: string;
  close(): Promise<void>;
  call(method: string, p: string, o?: { token?: string; body?: unknown; headers?: Record<string, string> }): Promise<{ status: number; body: any; headers: Headers }>;
  upload(p: string, token: string | undefined, file: Buffer | null, o?: { filename?: string; mime?: string; field?: string }): Promise<{ status: number; body: any; headers: Headers }>;
  uploadDir: string;
}

/** Boots a real PostgreSQL + the real Nest app (same pipeline as production). */
export async function boot(port: number, env: Record<string, string> = {}, extraControllers: any[] = []): Promise<Harness> {
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(path.join(tmpdir(), 'bs-pg-')), user: 'postgres', password: 'pw', port,
    persistent: false, createPostgresUser: true, onLog: () => undefined, onError: () => undefined,
  });
  await pg.initialise(); await pg.start();
  const uploadDir = mkdtempSync(path.join(tmpdir(), 'bs-up-'));
  const ownerUrl = `postgresql://postgres:pw@localhost:${port}/postgres`;
  const appUrl = `postgresql://barber_app:apppw@localhost:${port}/postgres`;
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
    base, ownerPool, appPool, appUrl, ownerUrl, uploadDir,
    async close() { await app.close(); await ownerPool.end(); await appPool.end(); await pg.stop(); },
    async upload(p, token, file, o = {}) {
      const fd = new FormData();
      if (file) fd.append(o.field ?? 'file', new Blob([new Uint8Array(file)], { type: o.mime ?? 'image/png' }), o.filename ?? 'upload.png');
      const res = await fetch(base + p, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: fd });
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    },
    async call(method, p, o = {}) {
      const res = await fetch(base + p, {
        method, headers: { 'content-type': 'application/json', ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
      return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    },
  };
}
