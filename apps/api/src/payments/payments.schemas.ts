import { z } from 'zod';

export const createRazorpayOrderSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  amountPaise: z.number().int().min(100, 'Minimum payment amount is Rs 1 (100 paise)'),
  currency: z.string().default('INR'),
  notes: z.record(z.any()).optional(),
});

export const verifyRazorpayPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  razorpayOrderId: z.string().trim().min(5),
  razorpayPaymentId: z.string().trim().min(5),
  razorpaySignature: z.string().trim().min(5),
});

export const updateGatewayCredentialsSchema = z.object({
  razorpayKeyId: z.string().trim().min(5).max(100).optional().nullable(),
  razorpayKeySecret: z.string().trim().min(8).max(100).optional().nullable(),
});
