import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../auth/schemas';

const permMap = z.record(z.string(), z.string());
export const createRoleSchema = z.object({ name: z.string().trim().min(2).max(50), permissions: permMap.default({}) });
export const renameRoleSchema = z.object({ name: z.string().trim().min(2).max(50) });
export const setPermissionsSchema = z.object({ permissions: permMap });
export const setUserRolesSchema = z.object({ roleIds: z.array(z.string().uuid()).min(1, 'Choose at least one role').max(10) });
export const createStaffSchema = z.object({
  name: nameSchema, phone: phoneSchema.optional(), email: emailSchema.optional(), password: passwordSchema,
  roleIds: z.array(z.string().uuid()).min(1, 'Choose at least one role').max(10),
}).refine((v) => v.phone || v.email, { message: 'Provide a mobile number or an email', path: ['phone'] });
export const setStatusSchema = z.object({ status: z.enum(['active', 'disabled']) });
export const uuidParam = z.string().uuid('Invalid id');
