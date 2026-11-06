import { Controller, Get, Query } from '@nestjs/common';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @RequirePermission('dashboard.view')
  @Get('dashboard/admin')
  adminDashboard(@Auth() ctx: AuthContext) {
    return this.svc.getAdminDashboard(ctx);
  }

  @RequirePermission('dashboard.view')
  @Get('dashboard/worker')
  workerDashboard(@Auth() ctx: AuthContext) {
    return this.svc.getWorkerDashboard(ctx);
  }

  @RequirePermission('reports.view')
  @Get('analytics')
  analytics(
    @Auth() ctx: AuthContext,
    @Query('type') type: 'sales' | 'workers' | 'customers' | 'inventory' | 'finance' = 'sales',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.svc.getReports(ctx, { type, startDate, endDate });
  }

  @RequirePermission('reports.view')
  @Get('eod')
  endOfDayReconciliation(@Auth() ctx: AuthContext, @Query('date') date?: string) {
    return this.svc.getEndOfDayReconciliation(ctx, date);
  }
}
