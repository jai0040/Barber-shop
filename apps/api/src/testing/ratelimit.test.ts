import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Harness } from './harness';

let h: Harness;
before(async () => { h = await boot(54342, { LOGIN_RATE_LIMIT: '3' }); });
after(() => h?.close());

it('login endpoint is rate limited (429 after the limit)', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await h.call('POST', '/auth/login', { body: { identifier: 'x@y.test', password: 'whatever1' } })).status);
  assert.deepEqual(codes.slice(0, 3), [401, 401, 401]);
  assert.deepEqual(codes.slice(3), [429, 429]);
});
