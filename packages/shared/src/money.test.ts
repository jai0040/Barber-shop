import test from 'node:test';
import assert from 'node:assert/strict';
import { rupeesToPaise, paiseToRupees } from './money';
test('rupees <-> paise', () => {
  assert.equal(rupeesToPaise(300), 30000);
  assert.equal(rupeesToPaise(149.99), 14999);
  assert.equal(paiseToRupees(45000), 450);
  assert.throws(() => rupeesToPaise(-1));
});
