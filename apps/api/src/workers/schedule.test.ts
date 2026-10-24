import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWorkerFits, localParts, toMinutes, DayWindow } from './schedule';

const IST = 'Asia/Kolkata';
const at = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const day = (s: string, e: string, b?: [string, string]): DayWindow => ({ open: true, start: toMinutes(s), end: toMinutes(e), breakStart: b ? toMinutes(b[0]) : null, breakEnd: b ? toMinutes(b[1]) : null });
const shop = day('10:00', '21:00');

test('localParts converts an instant to shop-local weekday/minutes/date', () => {
  assert.deepEqual(localParts(at('2030-01-07', '11:00'), IST), { weekday: 1, minutes: 660, ymd: '2030-01-07' });
  assert.equal(localParts(at('2030-01-13', '09:00'), IST).weekday, 7);
  assert.deepEqual(localParts(new Date('2030-01-07T23:30:00Z'), IST), { weekday: 2, minutes: 300, ymd: '2030-01-08' }); // already Tuesday in Kolkata
  assert.equal(localParts(new Date('2030-01-07T23:30:00Z'), 'America/New_York').weekday, 1);
  assert.equal(localParts(new Date('2030-01-07T23:30:00Z'), 'America/New_York').minutes, 18 * 60 + 30);
});
test('DST: wall-clock time is right on both sides of a US transition', () => {
  assert.equal(localParts(new Date('2030-03-09T17:00:00Z'), 'America/New_York').minutes, 12 * 60); // EST
  assert.equal(localParts(new Date('2030-03-11T16:00:00Z'), 'America/New_York').minutes, 12 * 60); // EDT
});
test('boundaries are half-open', () => {
  const w = day('10:00', '21:00', ['13:00', '14:00']);
  const fit = (t: string, d: number) => checkWorkerFits({ start: at('2030-01-07', t), durationMin: d, tz: IST, shopDay: shop, workerDay: w });
  assert.equal(fit('12:30', 30), null); assert.equal(fit('12:45', 30), 'on_break'); assert.equal(fit('13:30', 15), 'on_break'); assert.equal(fit('14:00', 30), null);
  assert.equal(fit('20:30', 30), null); assert.equal(fit('20:45', 30), 'outside_shop_hours'); assert.equal(fit('09:45', 30), 'outside_shop_hours');
});
test('shop closed / worker not working / worker narrower than shop', () => {
  const base = { start: at('2030-01-07', '11:00'), durationMin: 30, tz: IST };
  assert.equal(checkWorkerFits({ ...base, shopDay: { open: false, start: 0, end: 0 }, workerDay: shop }), 'shop_closed');
  assert.equal(checkWorkerFits({ ...base, shopDay: null, workerDay: shop }), 'shop_closed');
  assert.equal(checkWorkerFits({ ...base, shopDay: shop, workerDay: null }), 'not_working');
  assert.equal(checkWorkerFits({ ...base, shopDay: shop, workerDay: day('12:00', '20:00') }), 'outside_worker_hours');
});
test('time off overlap (half-open)', () => {
  const off = [{ start: at('2030-01-07', '15:00'), end: at('2030-01-07', '18:00') }];
  const fit = (t: string, d: number) => checkWorkerFits({ start: at('2030-01-07', t), durationMin: d, tz: IST, shopDay: shop, workerDay: shop, timeOff: off });
  assert.equal(fit('14:30', 30), null); assert.equal(fit('14:45', 30), 'time_off'); assert.equal(fit('17:45', 45), 'time_off'); assert.equal(fit('18:00', 30), null);
});
test('never crosses local midnight; the shop timezone (not UTC) decides', () => {
  const late = day('00:00', '23:59');
  assert.equal(checkWorkerFits({ start: at('2030-01-07', '23:45'), durationMin: 30, tz: IST, shopDay: late, workerDay: late }), 'outside_shop_hours');
  const t = at('2030-01-07', '11:00'); // = 09:30 in Dubai, before opening
  assert.equal(checkWorkerFits({ start: t, durationMin: 30, tz: IST, shopDay: shop, workerDay: shop }), null);
  assert.equal(checkWorkerFits({ start: t, durationMin: 30, tz: 'Asia/Dubai', shopDay: shop, workerDay: shop }), 'outside_shop_hours');
});
