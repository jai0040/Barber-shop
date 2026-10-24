import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  amountPaise: z.number().int().min(1, 'Amount must be greater than 0'),
  date: z.string().regex(dateRegex, 'Date format must be YYYY-MM-DD').optional(),
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(500),
  paymentMethod: z.enum(['cash', 'online', 'bank_transfer']).default('cash'),
});

export const updateExpenseSchema = z.object({
  categoryId: z.string().uuid().optional(),
  amountPaise: z.number().int().min(1).optional(),
  date: z.string().regex(dateRegex).optional(),
  description: z.string().trim().min(2).max(500).optional(),
  paymentMethod: z.enum(['cash', 'online', 'bank_transfer']).optional(),
});

export const expenseQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const summaryQuerySchema = z.object({
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
});
