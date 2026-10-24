import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone';
test('phone normalisation', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('919876543210'), '+919876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('5876543210'), null); // Indian mobiles start 6-9
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone(''), null);
});
