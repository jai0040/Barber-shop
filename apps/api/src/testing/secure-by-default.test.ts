import 'reflect-metadata';
import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { boot, Harness } from './harness';

// A developer "forgets" to declare an access rule. The platform must refuse, not silently allow.
@Controller('forgotten') class Forgotten { @Get() oops() { return 'secret'; } }
@Public() @Controller('declared-public') class DeclaredPublic { @Get() ok() { return 'fine'; } }

let h: Harness; let token: string;
before(async () => {
  h = await boot(undefined, {}, [Forgotten, DeclaredPublic]);
  const { createPlatformAdmin } = await import('../cli-create-platform-admin');
  await createPlatformAdmin(h.ownerUrl, { name: 'Root', email: 'root@p.test', password: 'Passw0rd!x' });
  token = (await h.call('POST', '/auth/login', { body: { identifier: 'root@p.test', password: 'Passw0rd!x' } })).body.data.accessToken;
});
after(() => h?.close());

it('a route with no declared access rule is refused for logged-in users and anonymous callers', async () => {
  const r = await h.call('GET', '/forgotten', { token });
  assert.equal(r.status, 403); assert.notEqual(r.body.data, 'secret');
  assert.equal((await h.call('GET', '/forgotten')).status, 401);
});
it('an explicitly @Public route works', async () => {
  assert.equal((await h.call('GET', '/declared-public')).body.data, 'fine');
});
