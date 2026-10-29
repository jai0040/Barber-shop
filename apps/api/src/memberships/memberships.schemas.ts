import { z } from 'zod';

export const includedServiceItemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
});

export const createMembershipPlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).optional(),
  pricePaise: z.number().int().min(0),
  durationDays: z.number().int().min(1).default(30),
  discountPercentServices: z.number().int().min(0).max(100).default(0),
  discountPercentProducts: z.number().int().min(0).max(100).default(0),
  pointsMultiplier: z.number().min(1.0).max(10.0).default(1.0),
  includedServices: z.array(includedServiceItemSchema).default([]),
});

export const updateMembershipPlanSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
  pricePaise: z.number().int().min(0).optional(),
  durationDays: z.number().int().min(1).optional(),
  discountPercentServices: z.number().int().min(0).max(100).optional(),
  discountPercentProducts: z.number().int().min(0).max(100).optional(),
  pointsMultiplier: z.number().min(1.0).max(10.0).optional(),
  status: z.enum(['active', 'archived']).optional(),
  includedServices: z.array(includedServiceItemSchema).optional(),
});

export const assignCustomerMembershipSchema = z.object({
  customerId: z.string().uuid(),
  planId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});
