import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(80),
  displayOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, 'Service name is required').max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  pricePaise: z.number().int().min(0, 'Price must be non-negative (in paise)'),
  durationMinutes: z.number().int().min(5, 'Duration must be at least 5 minutes').max(480, 'Duration cannot exceed 8 hours'),
});

export const updateServiceSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  pricePaise: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  isActive: z.boolean().optional(),
});
