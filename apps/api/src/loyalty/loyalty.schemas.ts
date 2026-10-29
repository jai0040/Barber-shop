import { z } from 'zod';

export const updateLoyaltySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  earnPerRupeePaise: z.number().int().positive().optional(),
  pointValuePaise: z.number().int().positive().optional(),
  minRedeemPoints: z.number().int().min(0).optional(),
  maxDiscountPercentage: z.number().int().min(1).max(100).optional(),
});

export const adjustLoyaltyPointsSchema = z.object({
  customerId: z.string().uuid(),
  pointsDelta: z.number().int().refine((val) => val !== 0, { message: 'pointsDelta cannot be 0' }),
  type: z.enum(['manual_adjustment', 'welcome_bonus', 'membership_bonus', 'reversal']).default('manual_adjustment'),
  notes: z.string().max(500).optional(),
});

export const redeemLoyaltyPointsSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number().int().positive(),
  invoiceId: z.string().uuid().optional(),
});
