/** Pure scheduling helpers (no DB). Used by eligibility now and by the slot engine in Phase 6. */
import { toMinutes } from './time';
export { toMinutes };

export interface LocalParts { weekday: number; minutes: number; ymd: string } // weekday: ISO 1=Mon..7=Sun
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock weekday/minutes/date of an instant in a given IANA timezone. */
export function localParts(d: Date, tz: string): LocalParts {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }); fmtCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: WEEKDAYS[p.weekday], minutes: Number(p.hour) * 60 + Number(p.minute), ymd: `${p.year}-${p.month}-${p.day}` };
}

export interface DayWindow { open: boolean; start: number; end: number; breakStart?: number | null; breakEnd?: number | null }
export type Unfit = 'shop_closed' | 'outside_shop_hours' | 'not_working' | 'outside_worker_hours' | 'on_break' | 'time_off';

/** Why a worker CANNOT take [start, start+duration), or null if the schedule allows it. Half-open: ending exactly at close/break start is fine. */
export function checkWorkerFits(a: { start: Date; durationMin: number; tz: string; shopDay?: DayWindow | null; workerDay?: DayWindow | null; timeOff?: { start: Date; end: Date }[] }): Unfit | null {
  const end = new Date(a.start.getTime() + a.durationMin * 60_000);
  const s = localParts(a.start, a.tz), e = localParts(end, a.tz);
  if (!a.shopDay || !a.shopDay.open) return 'shop_closed';
  if (s.ymd !== e.ymd || s.minutes < a.shopDay.start || e.minutes > a.shopDay.end) return 'outside_shop_hours'; // never crosses local midnight
  if (!a.workerDay || !a.workerDay.open) return 'not_working';
  if (s.minutes < a.workerDay.start || e.minutes > a.workerDay.end) return 'outside_worker_hours';
  if (a.workerDay.breakStart != null && a.workerDay.breakEnd != null && s.minutes < a.workerDay.breakEnd && e.minutes > a.workerDay.breakStart) return 'on_break';
  if ((a.timeOff ?? []).some((t) => a.start < t.end && end > t.start)) return 'time_off';
  return null;
}
