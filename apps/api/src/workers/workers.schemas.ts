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
