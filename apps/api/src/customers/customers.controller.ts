import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Authenticated, Auth, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from './customers.schemas';

@Controller('customers')
export class CustomersController {
  constructor(private svc: CustomersService) {}

  @RequirePermission('customers.view')
  @Get()
  list(@Auth() ctx: AuthContext, @Perms() p: Effective, @Query(new ZodValidationPipe(customerQuerySchema)) q: any) {
    return this.svc.list(ctx, p, q);
  }

  @Authenticated()
  @Get('me/profile')
  myProfile(@Auth() ctx: AuthContext) {
    return this.svc.myProfile(ctx);
  }

  @RequirePermission('customers.view')
  @Get(':id')
  get(@Auth() ctx: AuthContext, @Perms() p: Effective, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(ctx, p, id);
  }

  @RequirePermission('customers.create')
  @Post()
  create(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createCustomerSchema)) dto: any) {
    return this.svc.create(ctx, dto);
  }

  @RequirePermission('customers.update')
  @Patch(':id')
  update(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) dto: any
  ) {
    return this.svc.update(ctx, id, dto);
  }

  @RequirePermission('customers.delete')
  @Delete(':id')
  @HttpCode(200)
  delete(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.delete(ctx, id);
  }
}
