import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config';

const good = { DATABASE_URL: 'postgresql://a:b@localhost:5432/x', JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_REFRESH_SECRET: 'b'.repeat(32) };
test('valid env loads with defaults', () => {
  const c = loadConfig({ ...good } as any);
  assert.equal(c.PORT, 4000);
  assert.equal(c.DEFAULT_TIMEZONE, 'Asia/Kolkata');
});
test('short secret is rejected', () => {
  assert.throws(() => loadConfig({ ...good, JWT_ACCESS_SECRET: 'short' } as any), /Invalid environment/);
});
