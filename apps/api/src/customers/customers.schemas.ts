import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: z.string().trim().min(8, 'Phone number is required'),
  email: z.string().trim().email().toLowerCase().optional().nullable(),
  preferredWorkerId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(8).optional(),
  email: z.string().trim().email().toLowerCase().optional().nullable(),
  preferredWorkerId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const customerQuerySchema = z.object({
  q: z.string().optional(),
  preferredWorkerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
