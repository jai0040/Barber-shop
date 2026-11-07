import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const publicBookSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  phone: z.string().trim().min(8, 'Phone number is required'),
  email: z.string().trim().email().toLowerCase().optional().nullable(),
  date: z.string().regex(dateRegex, 'Date must be formatted as YYYY-MM-DD'),
  startTime: z.string().regex(timeRegex, 'Start time must be formatted as HH:mm'),
  serviceIds: z.array(z.string().uuid()).min(1, 'Select at least one service'),
  workerId: z.string().optional().nullable(), // uuid or 'any' or null
  notes: z.string().trim().max(500).optional().nullable(),
  couponCode: z.string().trim().max(30).optional().nullable(),
});

export const createWalkInSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().trim().min(2).max(80).optional(),
  customerPhone: z.string().trim().min(8).optional(),
  date: z.string().regex(dateRegex).optional(),
  startTime: z.string().regex(timeRegex).optional(),
  serviceIds: z.array(z.string().uuid()).min(1, 'Select at least one service'),
  workerId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum([
    'booked',
    'confirmed',
    'checked_in',
    'in_service',
    'completed',
    'cancelled',
    'no_show',
    'rescheduled',
  ]),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const assignWorkerSchema = z.object({
  workerId: z.string().uuid('Worker ID must be a valid UUID'),
});

export const addServiceSchema = z.object({
  serviceId: z.string().uuid('Service ID must be a valid UUID'),
});

export const appointmentQuerySchema = z.object({
  date: z.string().regex(dateRegex).optional(),
  workerId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const rescheduleMyAppointmentSchema = z.object({
  date: z.string().regex(dateRegex, 'Date must be formatted as YYYY-MM-DD'),
  startTime: z.string().regex(timeRegex, 'Start time must be formatted as HH:mm'),
  workerId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type RescheduleMyAppointmentDto = z.infer<typeof rescheduleMyAppointmentSchema>;
