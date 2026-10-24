import { z } from 'zod';

export const invoiceItemSchema = z.object({
  type: z.enum(['service', 'product']),
  itemId: z.string().uuid().optional().nullable(),
  itemName: z.string().trim().min(1),
  quantity: z.number().int().min(1).default(1),
  unitPricePaise: z.number().int().min(0),
});

export const createInvoiceSchema = z.object({
  appointmentId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  workerId: z.string().uuid().optional().nullable(),
  discountPaise: z.number().int().min(0).default(0),
  items: z.array(invoiceItemSchema).min(1, 'Invoice must have at least one line item'),
});

export const recordPaymentSchema = z.object({
  method: z.enum(['cash', 'upi_qr']),
  amountPaise: z.number().int().min(1, 'Payment amount must be greater than 0'),
  transactionReference: z.string().trim().max(100).optional().nullable(),
});

export const invoiceQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  workerId: z.string().uuid().optional(),
  paymentStatus: z.enum(['pending', 'paid', 'void']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
