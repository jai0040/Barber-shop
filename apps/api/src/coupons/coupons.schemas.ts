import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(2, 'Coupon code must be at least 2 characters')
    .max(30, 'Coupon code must be at most 30 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code may only contain letters, numbers, hyphens, and underscores')
    .transform((v) => v.toUpperCase()),
  description: z.string().max(255).optional(),
  discountType: z.enum(['percentage', 'flat']),
  discountValue: z.number().int().positive('Discount value must be positive'),
  maxDiscountPaise: z.number().int().positive('Max discount must be positive').optional().nullable(),
  minOrderPaise: z.number().int().nonnegative('Minimum order amount must be non-negative').default(0),
  applicableTo: z.enum(['all', 'services', 'products']).default('all'),
  maxRedemptionsTotal: z.number().int().positive().optional().nullable(),
  maxRedemptionsPerCustomer: z.number().int().positive().default(1),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.discountType === 'percentage') {
      return data.discountValue >= 1 && data.discountValue <= 100;
    }
    return true;
  },
  { message: 'Percentage discount must be between 1 and 100', path: ['discountValue'] }
);

export const updateCouponSchema = z.object({
  description: z.string().max(255).optional(),
  discountType: z.enum(['percentage', 'flat']).optional(),
  discountValue: z.number().int().positive().optional(),
  maxDiscountPaise: z.number().int().positive().optional().nullable(),
  minOrderPaise: z.number().int().nonnegative().optional(),
  applicableTo: z.enum(['all', 'services', 'products']).optional(),
  maxRedemptionsTotal: z.number().int().positive().optional().nullable(),
  maxRedemptionsPerCustomer: z.number().int().positive().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1).trim().transform((v) => v.toUpperCase()),
  customerId: z.string().uuid().optional().nullable(),
  subtotalPaise: z.number().int().nonnegative(),
  servicesTotalPaise: z.number().int().nonnegative().default(0),
  productsTotalPaise: z.number().int().nonnegative().default(0),
});

export type CreateCouponDto = z.infer<typeof createCouponSchema>;
export type UpdateCouponDto = z.infer<typeof updateCouponSchema>;
export type ValidateCouponDto = z.infer<typeof validateCouponSchema>;
