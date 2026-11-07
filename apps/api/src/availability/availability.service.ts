import { Injectable } from '@nestjs/common';
import { ErrorCodes, TimeSlot } from '@barbershop/shared';
import { AppException } from '../common/app-exception';
import { Db } from '../db/db.service';

const notFound = (m = 'Shop not found.') => new AppException(404, ErrorCodes.NOT_FOUND, m);
const badRequest = (m: string) => new AppException(400, ErrorCodes.VALIDATION_FAILED, m);

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Returns ISO weekday 1=Monday ... 7=Sunday */
const getIsoWeekday = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  return day === 0 ? 7 : day;
};

@Injectable()
export class AvailabilityService {
  constructor(private db: Db) {}

  async calculateSlots(
    slug: string,
    query: { date: string; serviceIds: string[]; workerId?: string }
  ): Promise<{ date: string; totalDurationMinutes: number; slots: TimeSlot[] }> {
    return this.db.tenant({ publicRead: true }, async (c) => {
      // 1. Fetch shop and settings
      const shop = (await c.query(
        `SELECT id, timezone, settings FROM shops WHERE slug = $1 AND status = 'active'`,
        [slug]
      )).rows[0];
      if (!shop) throw notFound();

      await c.query(`SELECT set_config('app.shop_id', $1, true)`, [shop.id]);

      const advanceDays = shop.settings?.advance_booking_days ?? 30;
      const targetDate = new Date(query.date + 'T00:00:00Z');
      const now = new Date();
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      if (targetDate < todayUtc) {
        throw badRequest('Cannot book appointments in the past.');
      }
      const maxDate = new Date(todayUtc);
      maxDate.setUTCDate(maxDate.getUTCDate() + advanceDays);
      if (targetDate > maxDate) {
        throw badRequest(`Cannot book appointments more than ${advanceDays} days in advance.`);
      }

      // 2. Fetch requested services and compute total duration
      const services = (await c.query(
        `SELECT id, name, duration_minutes FROM services
         WHERE shop_id = $1 AND id = ANY($2::uuid[]) AND is_active = true`,
        [shop.id, query.serviceIds]
      )).rows;

      if (services.length !== query.serviceIds.length) {
        throw badRequest('One or more selected services are invalid or unavailable.');
      }

      const totalDuration = services.reduce((acc, s) => acc + s.duration_minutes, 0);
      if (totalDuration <= 0) throw badRequest('Selected services duration is invalid.');

      // 3. Check shop hours for this weekday
      const weekday = getIsoWeekday(query.date);
      const shopHour = (await c.query(
        `SELECT is_closed, open_time::text, close_time::text
         FROM shop_hours
         WHERE shop_id = $1 AND weekday = $2`,
        [shop.id, weekday]
      )).rows[0];

      if (!shopHour || shopHour.is_closed || !shopHour.open_time || !shopHour.close_time) {
        return { date: query.date, totalDurationMinutes: totalDuration, slots: [] };
      }

      const shopOpen = timeToMinutes(shopHour.open_time);
      const shopClose = timeToMinutes(shopHour.close_time);

      // 4. Find candidate workers
      const isAnyWorker = !query.workerId || query.workerId.toLowerCase() === 'any';

      let workerFilter = `w.shop_id = $1 AND w.is_active = true`;
      const workerParams: unknown[] = [shop.id];

      if (!isAnyWorker) {
        workerParams.push(query.workerId);
        workerFilter += ` AND w.id = $${workerParams.length}`;
      }

      // Worker must be capable of ALL selected services
      workerParams.push(query.serviceIds);
      workerParams.push(query.serviceIds.length);
      const candidateWorkers = (await c.query(
        `SELECT w.id, w.display_name
         FROM workers w
         JOIN worker_services ws ON ws.worker_id = w.id
         WHERE ${workerFilter} AND ws.service_id = ANY($${workerParams.length - 1}::uuid[])
         GROUP BY w.id
         HAVING count(DISTINCT ws.service_id) = $${workerParams.length}`,
        workerParams
      )).rows;

      if (candidateWorkers.length === 0) {
        return { date: query.date, totalDurationMinutes: totalDuration, slots: [] };
      }

      const candidateWorkerIds = candidateWorkers.map((w) => w.id);

      // 5. Fetch schedules and breaks for candidate workers on this weekday
      const schedules = (await c.query(
        `SELECT worker_id, is_working, start_time::text, end_time::text
         FROM worker_schedules
         WHERE shop_id = $1 AND worker_id = ANY($2::uuid[]) AND weekday = $3`,
        [shop.id, candidateWorkerIds, weekday]
      )).rows;

      const scheduleMap = new Map<string, { start: number; end: number }>();
      for (const s of schedules) {
        if (s.is_working && s.start_time && s.end_time) {
          const wStart = Math.max(shopOpen, timeToMinutes(s.start_time));
          const wEnd = Math.min(shopClose, timeToMinutes(s.end_time));
          if (wEnd > wStart) {
            scheduleMap.set(s.worker_id, { start: wStart, end: wEnd });
          }
        }
      }

      const breaks = (await c.query(
        `SELECT worker_id, start_time::text, end_time::text
         FROM worker_breaks
         WHERE shop_id = $1 AND worker_id = ANY($2::uuid[]) AND weekday = $3`,
        [shop.id, candidateWorkerIds, weekday]
      )).rows;

      const breaksMap = new Map<string, Array<{ start: number; end: number }>>();
      for (const b of breaks) {
        const list = breaksMap.get(b.worker_id) ?? [];
        list.push({ start: timeToMinutes(b.start_time), end: timeToMinutes(b.end_time) });
        breaksMap.set(b.worker_id, list);
      }

      // Check if appointments table exists; if yes, fetch existing bookings
      const appointmentsMap = new Map<string, Array<{ start: number; end: number }>>();
      const hasAppointmentsTable = (await c.query(
        `SELECT to_regclass('public.appointments') AS tbl`
      )).rows[0]?.tbl;

      if (hasAppointmentsTable) {
        const booked = (await c.query(
          `SELECT worker_id, start_time::text, end_time::text
           FROM appointments
           WHERE shop_id = $1 AND worker_id = ANY($2::uuid[]) AND date = $3::date
             AND status IN ('booked', 'confirmed', 'checked_in', 'in_service')`,
          [shop.id, candidateWorkerIds, query.date]
        )).rows;

        for (const bk of booked) {
          if (!bk.worker_id) continue;
          const list = appointmentsMap.get(bk.worker_id) ?? [];
          list.push({ start: timeToMinutes(bk.start_time), end: timeToMinutes(bk.end_time) });
          appointmentsMap.set(bk.worker_id, list);
        }
      }

      // 6. Generate discrete slots (15-minute increments)
      const slotStep = 15;
      const workerLookup = new Map(candidateWorkers.map((w) => [w.id, w.display_name]));
      const slots: TimeSlot[] = [];

      for (let t = shopOpen; t + totalDuration <= shopClose; t += slotStep) {
        const slotStart = t;
        const slotEnd = t + totalDuration;
        const availableWorkersForSlot: Array<{ id: string; displayName: string }> = [];

        for (const workerId of candidateWorkerIds) {
          const sched = scheduleMap.get(workerId);
          if (!sched) continue; // worker not working today

          // Slot must be inside worker shift
          if (slotStart < sched.start || slotEnd > sched.end) continue;

          // Check breaks
          const workerBreaks = breaksMap.get(workerId) ?? [];
          const hasBreakConflict = workerBreaks.some(
            (b) => slotStart < b.end && slotEnd > b.start
          );
          if (hasBreakConflict) continue;

          // Check existing appointments
          const workerAppointments = appointmentsMap.get(workerId) ?? [];
          const hasAptConflict = workerAppointments.some(
            (a) => slotStart < a.end && slotEnd > a.start
          );
          if (hasAptConflict) continue;

          availableWorkersForSlot.push({
            id: workerId,
            displayName: workerLookup.get(workerId)!,
          });
        }

        if (availableWorkersForSlot.length > 0) {
          slots.push({
            time: minutesToTime(slotStart),
            availableWorkers: availableWorkersForSlot,
          });
        }
      }

      return {
        date: query.date,
        totalDurationMinutes: totalDuration,
        slots,
      };
    });
  }
}
