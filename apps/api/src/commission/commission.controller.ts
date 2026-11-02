import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Auth, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CommissionService } from './commission.service';
import {
  commissionQuerySchema,
  manualAdjustmentSchema,
  recordPayoutSchema,
} from './commission.schemas';

@Controller('commission')
export class CommissionController {
  constructor(private svc: CommissionService) {}

  @RequirePermission('commission.view')
  @Get('summary')
  getSummary(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query() q?: any
  ) {
    return this.svc.getCommissionSummary(ctx, actor, q);
  }

  @RequirePermission('commission.view')
  @Get('worker/:workerId')
  getWorkerHistory(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Query() q?: any
  ) {
    return this.svc.getWorkerHistory(ctx, actor, workerId, q);
  }

  @RequirePermission('commission.manage')
  @Post('payout')
  recordPayout(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(recordPayoutSchema)) dto: any
  ) {
    return this.svc.recordPayout(ctx, dto);
  }

  @RequirePermission('commission.manage')
  @Post('adjust')
  adjustCommission(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(manualAdjustmentSchema)) dto: any
  ) {
    return this.svc.adjustCommission(ctx, dto);
  }
}
