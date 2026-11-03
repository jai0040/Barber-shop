import { z } from 'zod';

export const createReviewSchema = z.object({
  shopId: z.string().uuid().optional(),
  slug: z.string().optional(),
  appointmentId: z.string().uuid().optional(),
  workerId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  rating: z.number().int().min(1, 'Rating must be between 1 and 5 stars').max(5),
  barberRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
});

export const replyReviewSchema = z.object({
  ownerReply: z.string().trim().min(2, 'Reply must be at least 2 characters').max(1000),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(['published', 'hidden', 'flagged']),
});

export const reviewsQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  status: z.enum(['published', 'hidden', 'flagged']).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
