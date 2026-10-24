import { z } from 'zod';
import { emailSchema, nameSchema, phoneSchema } from '../auth/schemas';

const uuid = z.string().uuid();
const text = (n: number) => z.string().trim().max(n).transform((v) => v || null).nullable().optional();

export const createCustomerSchema = z.object({
  name: nameSchema, phone: phoneSchema, email: emailSchema.nullable().optional(), notes: text(500), internalNotes: text(1000),
  preferredWorkerId: uuid.nullable().optional(), serviceIds: z.array(uuid).max(50).optional(),
});
export const updateCustomerSchema = createCustomerSchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
/** What a customer may change about THEMSELVES (never internal notes, never phone: the phone is their identity). */
export const selfUpdateSchema = z.object({
  name: nameSchema, email: emailSchema.nullable(), notes: text(500), preferredWorkerId: uuid.nullable(), serviceIds: z.array(uuid).max(50),
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const listCustomersSchema = z.object({
  q: z.string().trim().max(60).optional(), preferredWorkerId: uuid.optional(),
  linkPending: z.enum(['true', 'false']).optional().transform((v) => v === 'true' ? true : undefined),
  includeArchived: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
});
