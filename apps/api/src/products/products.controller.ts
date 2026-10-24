import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { ProductsService } from './products.service';
import {
  createProductCategorySchema,
  createProductSchema,
  stockAdjustSchema,
  stockInSchema,
  updateProductSchema,
} from './products.schemas';

@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}

  @RequirePermission('products.view')
  @Get('categories')
  listCategories(@Auth() ctx: AuthContext) {
    return this.svc.listCategories(ctx);
  }

  @RequirePermission('products.create')
  @Post('categories')
  createCategory(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createProductCategorySchema)) dto: any) {
    return this.svc.createCategory(ctx, dto);
  }

  @RequirePermission('products.view')
  @Get()
  listProducts(
    @Auth() ctx: AuthContext,
    @Query('categoryId') categoryId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('lowStockOnly') lowStockOnly?: string
  ) {
    return this.svc.listProducts(ctx, {
      categoryId,
      activeOnly: activeOnly === 'true',
      lowStockOnly: lowStockOnly === 'true',
    });
  }

  @RequirePermission('products.view')
  @Get(':id')
  getProduct(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getProduct(ctx, id);
  }

  @RequirePermission('products.create')
  @Post()
  createProduct(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createProductSchema)) dto: any) {
    return this.svc.createProduct(ctx, dto);
  }

  @RequirePermission('products.update')
  @Patch(':id')
  updateProduct(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: any
  ) {
    return this.svc.updateProduct(ctx, id, dto);
  }
}

@Controller('inventory')
export class InventoryController {
  constructor(private svc: ProductsService) {}

  @RequirePermission('inventory.view')
  @Get('levels')
  getLevels(@Auth() ctx: AuthContext) {
    return this.svc.listProducts(ctx);
  }

  @RequirePermission('inventory.manage')
  @Post('stock-in')
  stockIn(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(stockInSchema)) dto: any) {
    return this.svc.stockIn(ctx, dto);
  }

  @RequirePermission('inventory.manage')
  @Post('adjust')
  adjust(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(stockAdjustSchema)) dto: any) {
    return this.svc.adjustStock(ctx, dto);
  }

  @RequirePermission('inventory.view')
  @Get('transactions/:productId')
  transactions(@Auth() ctx: AuthContext, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.svc.getTransactions(ctx, productId);
  }
}

@Public()
@Controller('products/public')
export class PublicProductsController {
  constructor(private svc: ProductsService) {}

  @Get(':slug')
  publicList(@Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    return this.svc.publicList(slug);
  }
}
