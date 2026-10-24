import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ServicesService } from './services.service';
import { categorySchema, categoryUpdateSchema, listSchema, serviceSchema, serviceUpdateSchema } from './catalog.schemas';

// Declared before ServicesController in the module so "/services/categories" is not captured by "/services/:id".
@Controller('services/categories')
export class CategoriesController {
  constructor(private svc: ServicesService) {}
  @RequirePermission('services.view') @Get() list(@Auth() ctx: AuthContext) { return this.svc.listCategories(ctx); }
  @RequirePermission('services.create') @Post() create(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(categorySchema)) dto: any) { return this.svc.createCategory(ctx, dto); }
  @RequirePermission('services.update') @Patch(':id')
  update(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(categoryUpdateSchema)) dto: any) { return this.svc.updateCategory(ctx, id, dto); }
  @RequirePermission('services.delete') @Delete(':id') @HttpCode(200)
  remove(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteCategory(ctx, id); }
}

@Controller('services')
export class ServicesController {
  constructor(private svc: ServicesService) {}
  @RequirePermission('services.view') @Get() list(@Auth() ctx: AuthContext, @Query(new ZodValidationPipe(listSchema)) q: any) { return this.svc.list(ctx, q); }
  @RequirePermission('services.view') @Get(':id') get(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(ctx, id); }
  @RequirePermission('services.create') @Post() create(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(serviceSchema)) dto: any) { return this.svc.create(ctx, dto); }
  @RequirePermission('services.update') @Patch(':id')
  update(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(serviceUpdateSchema)) dto: any) { return this.svc.update(ctx, id, dto); }
  @RequirePermission('services.delete') @Delete(':id') @HttpCode(200) archive(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.svc.archive(ctx, id); }
  @RequirePermission('services.update') @Post(':id/restore') @HttpCode(200) restore(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) { return this.svc.restore(ctx, id); }
}
