import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipsService } from './memberships.service';
import {
  assignCustomerMembershipSchema,
  createMembershipPlanSchema,
  updateMembershipPlanSchema,
} from './memberships.schemas';

@Controller('memberships')
export class MembershipsController {
  constructor(private svc: MembershipsService) {}

  @RequirePermission('memberships.manage')
  @Post('plans')
  createPlan(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createMembershipPlanSchema)) dto: any) {
    return this.svc.createPlan(ctx, dto);
  }

  @RequirePermission('memberships.manage')
  @Put('plans/:id')
  updatePlan(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMembershipPlanSchema)) dto: any
  ) {
    return this.svc.updatePlan(ctx, id, dto);
  }

  @RequirePermission('memberships.view', 'settings.manage', 'billing.create')
  @Get('plans')
  listPlans(@Auth() ctx: AuthContext, @Query('includeArchived') inc?: string) {
    return this.svc.listPlans(ctx.shopId!, inc === 'true');
  }

  @RequirePermission('memberships.view', 'settings.manage')
  @Get('plans/:id')
  getPlan(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getPlan(ctx.shopId!, id);
  }

  @RequirePermission('memberships.manage', 'billing.create')
  @Post('assign')
  assignMembership(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(assignCustomerMembershipSchema)) dto: any) {
    return this.svc.assignMembershipToCustomer(ctx, dto);
  }

  @RequirePermission('memberships.view', 'billing.create')
  @Get('customer/:customerId/active')
  getActiveMembership(@Auth() ctx: AuthContext, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.svc.getActiveCustomerMembership(ctx.shopId!, customerId);
  }

  @RequirePermission('memberships.view')
  @Get('customer/:customerId')
  listCustomerMemberships(@Auth() ctx: AuthContext, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.svc.listCustomerMemberships(ctx.shopId!, customerId);
  }

  @Public()
  @Get('public/:slug/plans')
  async listPublicPlans(@Param('slug') slug: string) {
    return this.svc.listPublicPlans(slug);
  }
}
