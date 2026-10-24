import { z } from 'zod';

export const createProductCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(80),
  displayOrder: z.number().int().optional(),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, 'Product name is required').max(100),
  sku: z.string().trim().min(2, 'SKU is required').max(50),
  sellingPricePaise: z.number().int().min(0, 'Selling price must be non-negative'),
  costPricePaise: z.number().int().min(0, 'Cost price must be non-negative').default(0),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  supplierName: z.string().trim().max(100).optional().nullable(),
});

export const updateProductSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(100).optional(),
  sku: z.string().trim().min(2).max(50).optional(),
  sellingPricePaise: z.number().int().min(0).optional(),
  costPricePaise: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  supplierName: z.string().trim().max(100).optional().nullable(),
  status: z.enum(['active', 'disabled']).optional(),
});

export const stockInSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitCostPaise: z.number().int().min(0).optional(),
  supplierName: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  recordExpense: z.boolean().default(false),
  expenseCategoryId: z.string().uuid().optional(),
});

export const stockAdjustSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(['damage', 'wastage', 'adjustment']),
  quantityDelta: z.number().int(), // positive for positive adjustment, negative for damage/loss
  notes: z.string().trim().min(2, 'Reason/notes required for stock adjustment').max(500),
});
