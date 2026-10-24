import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { ServicesService } from './services.service';
import { createCategorySchema, createServiceSchema, updateCategorySchema, updateServiceSchema } from './services.schemas';

@Controller('services')
export class ServicesController {
  constructor(private svc: ServicesService) {}

  // ==================== CATEGORIES ====================

  @RequirePermission('services.view', 'services.create', 'services.update')
  @Get('categories')
  listCategories(@Auth() ctx: AuthContext) {
    return this.svc.listCategories(ctx);
  }

  @RequirePermission('services.create')
  @Post('categories')
  createCategory(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createCategorySchema)) dto: any) {
    return this.svc.createCategory(ctx, dto);
  }

  @RequirePermission('services.update')
  @Patch('categories/:id')
  updateCategory(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: any
  ) {
    return this.svc.updateCategory(ctx, id, dto);
  }

  @RequirePermission('services.delete')
  @Delete('categories/:id')
  @HttpCode(200)
  deleteCategory(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteCategory(ctx, id);
  }

  // ==================== SERVICES ====================

  @RequirePermission('services.view')
  @Get()
  listServices(
    @Auth() ctx: AuthContext,
    @Query('categoryId') categoryId?: string,
    @Query('activeOnly') activeOnly?: string
  ) {
    return this.svc.listServices(ctx, {
      categoryId,
      activeOnly: activeOnly === 'true',
    });
  }

  @RequirePermission('services.view')
  @Get(':id')
  getService(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getService(ctx, id);
  }

  @RequirePermission('services.create')
  @Post()
  createService(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createServiceSchema)) dto: any) {
    return this.svc.createService(ctx, dto);
  }

  @RequirePermission('services.update')
  @Patch(':id')
  updateService(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: any
  ) {
    return this.svc.updateService(ctx, id, dto);
  }

  @RequirePermission('services.delete')
  @Delete(':id')
  @HttpCode(200)
  deleteService(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteService(ctx, id);
  }
}

@Public()
@Controller('services/public')
export class PublicServicesController {
  constructor(private svc: ServicesService) {}

  @Get(':slug')
  publicList(@Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    return this.svc.publicList(slug);
  }
}
