import { z } from 'zod';

const uuid = z.string().uuid();
export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
}).transform((v) => ({
  ...v,
  sortOrder: v.sortOrder ?? v.displayOrder ?? 0,
}));

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .transform((v) => ({
    name: v.name,
    sortOrder: v.sortOrder ?? v.displayOrder,
  }));

const price = z.number({ invalid_type_error: 'Price must be a number' }).int('Price must be in whole paise (e.g. ₹300 = 30000)').min(0).max(10_000_000, 'Price is too high');
const duration = z.number({ invalid_type_error: 'Duration must be a number' }).int('Duration must be whole minutes').min(5, 'Minimum 5 minutes').max(480, 'Maximum 8 hours');
export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().max(500).transform((v) => v || null).nullable().optional(),
  pricePaise: price,
  durationMin: duration.optional(),
  durationMinutes: duration.optional(),
  status: z.enum(['active', 'inactive']).default('active'),
}).transform((v, ctx) => {
  const d = v.durationMin ?? v.durationMinutes;
  if (!d) {
    ctx.addIssue({ code: 'custom', message: 'Duration is required', path: ['durationMin'] });
    return z.NEVER;
  }
  return { ...v, durationMin: d };
});
export const serviceUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  categoryId: uuid.nullable().optional(),
  description: z.string().trim().max(500).transform((v) => v || null).nullable().optional(),
  pricePaise: price.optional(),
  durationMin: duration.optional(),
  durationMinutes: duration.optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update')
  .transform((v) => {
    const d = v.durationMin ?? v.durationMinutes;
    return d ? { ...v, durationMin: d } : v;
  });
export const listSchema = z.object({
  q: z.string().trim().max(60).optional(), categoryId: uuid.optional(), status: z.enum(['active', 'inactive']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idList = z.object({ ids: z.array(uuid).max(100) });
