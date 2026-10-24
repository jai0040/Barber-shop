import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema } from '../auth/schemas';

const uuid = z.string().uuid();
const loginSchema = z.object({
  phone: phoneSchema.optional(), email: emailSchema.optional(), password: passwordSchema, roleIds: z.array(uuid).min(1).max(10).optional(),
}).refine((v) => v.phone || v.email, { message: 'Provide a mobile number or an email for the login', path: ['phone'] });

export const createWorkerSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  login: loginSchema.optional(),
  linkUserId: uuid.optional(), // e.g. the owner who also cuts hair
}).refine((v) => !(v.login && v.linkUserId), { message: 'Use either a new login or an existing user, not both', path: ['linkUserId'] });
export const updateWorkerSchema = z.object({ displayName: z.string().trim().min(2).max(60), status: z.enum(['active', 'inactive']) })
  .partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const addLoginSchema = loginSchema;
export const listWorkersSchema = z.object({
  q: z.string().trim().max(60).optional(), status: z.enum(['active', 'inactive']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- 4C: mapping, availability, time off ----------
import { toMinutes } from './time';
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
export const idsSchema = z.object({ ids: z.array(uuid).max(100) });

/** Instants MUST carry a UTC offset (Z or +05:30) so they are never interpreted in the server's timezone. */
export const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, 'Use an ISO time with offset, e.g. 2030-01-07T11:00:00+05:30')
  .transform((v, ctx) => { const d = new Date(v); if (isNaN(d.getTime())) { ctx.addIssue({ code: 'custom', message: 'Invalid date/time' }); return z.NEVER; } return d; });

const day = z.object({
  weekday: z.number().int().min(1).max(7), isWorking: z.boolean(),
  startTime: hhmm.nullable().optional(), endTime: hhmm.nullable().optional(), breakStart: hhmm.nullable().optional(), breakEnd: hhmm.nullable().optional(),
});
export const availabilitySchema = z.union([
  z.object({ useShopHours: z.literal(true) }),
  z.object({ days: z.array(day).length(7, 'Provide all 7 days (1 = Monday … 7 = Sunday)') }).superRefine((v, ctx) => {
    const seen = new Set<number>();
    v.days.forEach((d, i) => {
      const bad = (message: string, f = 'startTime') => ctx.addIssue({ code: 'custom', path: ['days', i, f], message });
      if (seen.has(d.weekday)) bad('Duplicate weekday', 'weekday');
      seen.add(d.weekday);
      if (!d.isWorking) { if (d.startTime || d.endTime || d.breakStart || d.breakEnd) bad('A day off must not have times'); return; }
      if (!d.startTime || !d.endTime) return bad('Start and end time are required for a working day');
      const s = toMinutes(d.startTime), e = toMinutes(d.endTime);
      if (e <= s) return bad('End time must be after start time', 'endTime');
      if (!!d.breakStart !== !!d.breakEnd) return bad('Give both break start and break end, or neither', 'breakStart');
      if (d.breakStart && d.breakEnd) {
        const bs = toMinutes(d.breakStart), be = toMinutes(d.breakEnd);
        if (be <= bs) bad('Break end must be after break start', 'breakEnd');
        else if (bs < s || be > e) bad('Break must be inside working hours', 'breakStart');
      }
    });
  }),
]);
export const timeOffSchema = z.object({ startAt: instant, endAt: instant, reason: z.string().trim().max(200).optional() })
  .superRefine((v, ctx) => {
    if (v.endAt <= v.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' });
    else if (v.endAt.getTime() - v.startAt.getTime() > 366 * 86400_000) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'Time off cannot exceed one year' });
  });
export const timeOffListSchema = z.object({ from: instant.optional(), to: instant.optional() });

// ---------- 4D: eligibility & public barbers ----------
export const eligibleSchema = z.object({ serviceIds: z.string(), start: instant.optional() }).transform((v, ctx) => {
  const ids = [...new Set(v.serviceIds.split(',').map((x) => x.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 10 || ids.some((i) => !uuid.safeParse(i).success)) { ctx.addIssue({ code: 'custom', path: ['serviceIds'], message: 'Provide 1-10 comma-separated service ids' }); return z.NEVER; }
  return { serviceIds: ids, start: v.start };
});
export const publicBarbersSchema = z.object({ serviceIds: z.string().optional() }).transform((v, ctx) => {
  const ids = [...new Set((v.serviceIds ?? '').split(',').map((x) => x.trim()).filter(Boolean))];
  if (ids.length > 10 || ids.some((i) => !uuid.safeParse(i).success)) { ctx.addIssue({ code: 'custom', path: ['serviceIds'], message: 'serviceIds must be up to 10 comma-separated ids' }); return z.NEVER; }
  return { serviceIds: ids };
});
