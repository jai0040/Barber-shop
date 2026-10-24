import { z } from 'zod';
import { loadConfig } from '../config';
import { normalizePhone } from './phone';

export const phoneSchema = z.string().trim().transform((v, ctx) => {
  const n = normalizePhone(v, loadConfig().DEFAULT_COUNTRY_CODE);
  if (!n) { ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number' }); return z.NEVER; }
  return n;
});
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters').max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/\d/, 'Password must contain a number');
export const nameSchema = z.string().trim().min(2, 'Name is too short').max(80, 'Name is too long');

export const registerSchema = z.object({
  name: nameSchema, phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  password: passwordSchema,
});
export const loginSchema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const refreshSchema = z.object({ refreshToken: z.string().optional() }).optional();
