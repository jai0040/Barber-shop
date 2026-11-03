import { z } from 'zod';

export const clockInSchema = z.object({
  workerId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const clockOutSchema = z.object({
  workerId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const recordAttendanceSchema = z.object({
  workerId: z.string().uuid(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  status: z.enum(['present', 'absent', 'half_day', 'on_leave']),
  checkInAt: z.string().optional().nullable(),
  checkOutAt: z.string().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const attendanceQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['present', 'absent', 'half_day', 'on_leave']).optional(),
});

export const requestAdvanceSchema = z.object({
  workerId: z.string().uuid().optional(),
  amountPaise: z.number().int().min(100, 'Minimum advance amount is 100 paise (Rs 1)'),
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500),
});

export const reviewAdvanceSchema = z.object({
  status: z.enum(['approved', 'rejected', 'deducted']),
  notes: z.string().trim().max(500).optional(),
});

export const updateWorkerSalaryConfigSchema = z.object({
  baseSalaryPaise: z.number().int().min(0, 'Base salary cannot be negative'),
});

export const generatePayrollSchema = z.object({
  workerId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2020),
  bonusesPaise: z.number().int().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
});

export const payPayrollSettlementSchema = z.object({
  paymentMethod: z.enum(['cash', 'bank_transfer', 'upi']).default('bank_transfer'),
  recordExpense: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});
