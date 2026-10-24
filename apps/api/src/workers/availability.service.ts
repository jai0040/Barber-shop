import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { AuthContext } from '../common/types';
import { Db } from '../db/db.service';
import { checkWorkerFits, DayWindow, localParts, toMinutes, Unfit } from './schedule';

/** "Who can do this job, and (optionally) at this moment?" Used by admin assignment, walk-ins and, in Phase 6, the booking engine. */
@Injectable()
export class AvailabilityService {
  constructor(private db: Db) {}

  eligible(ctx: AuthContext, serviceIds: string[], start?: Date) {
    return this.db.tenant({ shopId: ctx.shopId }, async (c) => {
      const services = (await c.query(`SELECT id, duration_min FROM services WHERE id = ANY($1::uuid[]) AND status = 'active' AND archived_at IS NULL`, [serviceIds])).rows;
      if (services.length !== serviceIds.length) throw new AppException(400, ErrorCodes.VALIDATION_FAILED, 'One or more services are not available.');
      const totalDurationMin = services.reduce((n, s) => n + s.duration_min, 0);

      // capability: active, not archived, can perform EVERY selected service
      const capable = (await c.query(
        `SELECT w.id, w.display_name FROM workers w WHERE w.status = 'active' AND w.archived_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM unnest($1::uuid[]) sid WHERE NOT EXISTS (SELECT 1 FROM worker_services ws WHERE ws.worker_id = w.id AND ws.service_id = sid))
          ORDER BY lower(w.display_name)`, [serviceIds])).rows;
      if (!start) return { totalDurationMin, eligible: capable.map((w) => ({ id: w.id, displayName: w.display_name })), unavailable: [] as unknown[] };

      const tz: string = (await c.query('SELECT timezone FROM shops WHERE id = $1', [ctx.shopId])).rows[0].timezone;
      const weekday = localParts(start, tz).weekday, end = new Date(start.getTime() + totalDurationMin * 60_000);
      const sh = (await c.query('SELECT is_closed, open_time::text o, close_time::text c FROM shop_hours WHERE shop_id = $1 AND weekday = $2', [ctx.shopId, weekday])).rows[0];
      const shopDay: DayWindow | null = sh ? (sh.is_closed ? { open: false, start: 0, end: 0 } : { open: true, start: toMinutes(sh.o), end: toMinutes(sh.c) }) : null;
      const ids = capable.map((w) => w.id);
      const avail = new Map((await c.query(
        `SELECT worker_id, is_working, start_time::text s, end_time::text e, break_start::text bs, break_end::text be FROM worker_availability WHERE worker_id = ANY($1::uuid[]) AND weekday = $2`, [ids, weekday])).rows.map((r) => [r.worker_id, r]));
      const off = (await c.query('SELECT worker_id, start_at, end_at FROM worker_time_off WHERE worker_id = ANY($1::uuid[]) AND start_at < $3 AND end_at > $2', [ids, start, end])).rows;
      // Phase 6: also exclude workers with an overlapping active appointment (a DB exclusion constraint remains the final guarantee).

      const eligible: { id: string; displayName: string }[] = [], unavailable: { id: string; displayName: string; reason: Unfit }[] = [];
      for (const w of capable) {
        const a = avail.get(w.id);
        const workerDay: DayWindow | null = a && a.is_working ? { open: true, start: toMinutes(a.s), end: toMinutes(a.e), breakStart: a.bs ? toMinutes(a.bs) : null, breakEnd: a.be ? toMinutes(a.be) : null } : null;
        const reason = checkWorkerFits({ start, durationMin: totalDurationMin, tz, shopDay, workerDay, timeOff: off.filter((t) => t.worker_id === w.id).map((t) => ({ start: t.start_at, end: t.end_at })) });
        if (reason) unavailable.push({ id: w.id, displayName: w.display_name, reason }); else eligible.push({ id: w.id, displayName: w.display_name });
      }
      return { totalDurationMin, start: start.toISOString(), end: end.toISOString(), timezone: tz, eligible, unavailable };
    });
  }
}
