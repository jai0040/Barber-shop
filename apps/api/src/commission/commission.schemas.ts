import { z } from 'zod';

export const recordPayoutSchema = z.object({
  workerId: z.string().uuid(),
  amountPaise: z.number().int().min(1, 'Payout amount must be greater than 0'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'upi']).default('cash'),
  periodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  notes: z.string().trim().max(500).optional(),
  recordExpense: z.boolean().default(true),
});

export const manualAdjustmentSchema = z.object({
  workerId: z.string().uuid(),
  amountPaise: z.number().int().refine((val) => val !== 0, 'Amount cannot be 0'),
  type: z.enum(['manual_adjustment', 'tip']).default('manual_adjustment'),
  notes: z.string().trim().min(2, 'Notes must be at least 2 characters').max(500),
});

export const commissionQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
