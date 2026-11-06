import { z } from 'zod';

export const listNotificationsSchema = z.object({
  status: z.enum(['unread', 'read', 'delivered', 'failed', 'all']).default('all'),
  channel: z.enum(['in_app', 'whatsapp', 'sms', 'email']).optional(),
  type: z
    .enum([
      'appointment_booked',
      'appointment_confirmed',
      'appointment_assigned',
      'appointment_cancelled',
      'appointment_completed',
      'payment_received',
      'low_stock',
      'salary_advance_requested',
      'review_received',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createNotificationSchema = z.object({
  userId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(200),
  message: z.string().trim().min(2).max(2000),
  type: z.enum([
    'appointment_booked',
    'appointment_confirmed',
    'appointment_assigned',
    'appointment_cancelled',
    'appointment_completed',
    'payment_received',
    'low_stock',
    'salary_advance_requested',
    'review_received',
  ]),
  channel: z.enum(['in_app', 'whatsapp', 'sms', 'email']).default('in_app'),
  customerPhone: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const testWebhookSchema = z.object({
  webhookUrl: z.string().trim().url('Please enter a valid HTTP or HTTPS URL'),
  webhookSecret: z.string().trim().max(128).optional(),
});
