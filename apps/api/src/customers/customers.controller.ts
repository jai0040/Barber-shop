import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Auth, CustomerOnly, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { CustomersService } from './customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipsService } from '../memberships/memberships.service';
import { createCustomerSchema, listCustomersSchema, selfUpdateSchema, updateCustomerSchema } from './customers.schemas';

const ID = () => Param('id', ParseUUIDPipe);

@Controller('customers')
export class CustomersController {
  constructor(private svc: CustomersService) {}
  @RequirePermission('customers.view') @Get()
  list(@Auth() ctx: AuthContext, @Perms() p: Effective, @Query(new ZodValidationPipe(listCustomersSchema)) q: any) { return this.svc.list(ctx, p, q); }
  @RequirePermission('customers.create') @Post()
  create(@Auth() ctx: AuthContext, @Perms() p: Effective, @Body(new ZodValidationPipe(createCustomerSchema)) dto: any) { return this.svc.create(ctx, p, dto); }
  @RequirePermission('customers.view') @Get(':id') get(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.get(ctx, p, id); }
  @RequirePermission('customers.update') @Patch(':id')
  update(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string, @Body(new ZodValidationPipe(updateCustomerSchema)) dto: any) { return this.svc.update(ctx, p, id, dto); }
  @RequirePermission('customers.delete') @Delete(':id') @HttpCode(200) archive(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.archive(ctx, p, id); }
  @RequirePermission('customers.delete') @Post(':id/restore') @HttpCode(200) restore(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.restore(ctx, p, id); }
  @RequirePermission('customers.update') @Post(':id/link/approve') @HttpCode(200) approve(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.resolveLink(ctx, p, id, true); }
  @RequirePermission('customers.update') @Post(':id/link/reject') @HttpCode(200) reject(@Auth() ctx: AuthContext, @Perms() p: Effective, @ID() id: string) { return this.svc.resolveLink(ctx, p, id, false); }
}

/** A customer account acting for itself inside one shop. */
@CustomerOnly()
@Controller('me/shops/:slug')
export class MyCustomerController {
  constructor(
    private svc: CustomersService,
    private loyalty: LoyaltyService,
    private memberships: MembershipsService
  ) {}

  @Get('profile') profile(@Auth() ctx: AuthContext, @Param('slug', new ZodValidationPipe(slugParam)) slug: string) { return this.svc.myProfile(ctx, slug); }
  @Post('join') @HttpCode(200) join(@Auth() ctx: AuthContext, @Param('slug', new ZodValidationPipe(slugParam)) slug: string) { return this.svc.join(ctx, slug); }
  @Patch('profile')
  update(@Auth() ctx: AuthContext, @Param('slug', new ZodValidationPipe(slugParam)) slug: string, @Body(new ZodValidationPipe(selfUpdateSchema)) dto: any) { return this.svc.updateMyProfile(ctx, slug, dto); }

  @Get('loyalty')
  async myLoyalty(@Auth() ctx: AuthContext, @Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    const shopId = await this.svc.shopBySlug(slug);
    const custId = await this.svc.myCustomerId(ctx, shopId);
    if (!custId) return null;
    return this.loyalty.getCustomerSummary(shopId, custId);
  }

  @Get('membership')
  async myMembership(@Auth() ctx: AuthContext, @Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    const shopId = await this.svc.shopBySlug(slug);
    const custId = await this.svc.myCustomerId(ctx, shopId);
    if (!custId) return null;
    return this.memberships.getActiveCustomerMembership(shopId, custId);
  }
}
