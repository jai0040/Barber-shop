import { z } from 'zod';
import { emailSchema, phoneSchema } from '../auth/schemas';

const validTz = (v: string) => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } };
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();

export const updateShopSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema.nullable(),
  email: emailSchema.nullable(),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  country: z.string().trim().min(2).max(80),
  gstNo: z.string().trim().toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GST number').nullable(),
  timezone: z.string().trim().refine(validTz, 'Unknown timezone (use e.g. Asia/Kolkata)'),
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
export const hoursSchema = z.object({
  hours: z.array(z.object({
    weekday: z.number().int().min(1).max(7),
    isClosed: z.boolean(),
    openTime: hhmm.nullable().optional(),
    closeTime: hhmm.nullable().optional(),
  })).length(7, 'Provide all 7 days (1 = Monday … 7 = Sunday)'),
}).superRefine((v, ctx) => {
  const seen = new Set<number>();
  v.hours.forEach((h, i) => {
    if (seen.has(h.weekday)) ctx.addIssue({ code: 'custom', path: ['hours', i, 'weekday'], message: 'Duplicate weekday' });
    seen.add(h.weekday);
    if (h.isClosed) {
      if (h.openTime || h.closeTime) ctx.addIssue({ code: 'custom', path: ['hours', i, 'openTime'], message: 'A closed day must not have times' });
    } else if (!h.openTime || !h.closeTime) {
      ctx.addIssue({ code: 'custom', path: ['hours', i, 'openTime'], message: 'Opening and closing time are required for an open day' });
    } else if (h.closeTime <= h.openTime) {
      ctx.addIssue({ code: 'custom', path: ['hours', i, 'closeTime'], message: 'Closing time must be after opening time' });
    }
  });
});

export const settingsSchema = z.object({
  cancellationCooldownHours: z.number().int().min(0).max(720),
  advanceBookingDays: z.number().int().min(1).max(365),
  autoRemindersEnabled: z.boolean().optional(),
  webhookUrl: z.string().trim().url('Must be a valid HTTP or HTTPS URL').nullable().optional(),
  webhookSecret: z.string().trim().max(128).nullable().optional(),
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const publicListSchema = z.object({
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const slugParam = z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/);
