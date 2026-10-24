import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const slotsQuerySchema = z.object({
  date: z.string().regex(dateRegex, 'Date must be formatted as YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'At least one serviceId is required'),
  workerId: z.string().optional(),
});
