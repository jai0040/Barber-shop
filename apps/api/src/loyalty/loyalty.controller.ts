import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Auth, Perms } from '../common/decorators';
import { RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LoyaltyService } from './loyalty.service';
import { adjustLoyaltyPointsSchema, updateLoyaltySettingsSchema } from './loyalty.schemas';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private svc: LoyaltyService) {}

  @RequirePermission('loyalty.view', 'settings.manage', 'billing.create')
  @Get('settings')
  getSettings(@Auth() ctx: AuthContext) {
    return this.svc.getSettings(ctx.shopId!);
  }

  @RequirePermission('loyalty.manage', 'settings.manage')
  @Put('settings')
  updateSettings(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(updateLoyaltySettingsSchema)) dto: any) {
    return this.svc.updateSettings(ctx, dto);
  }

  @RequirePermission('loyalty.view', 'customers.view', 'billing.create')
  @Get('customer/:customerId')
  getCustomerSummary(@Auth() ctx: AuthContext, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.svc.getCustomerSummary(ctx.shopId!, customerId);
  }

  @RequirePermission('loyalty.manage')
  @Post('adjust')
  adjustPoints(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(adjustLoyaltyPointsSchema)) dto: any) {
    return this.svc.adjustPoints(ctx, dto);
  }
}
