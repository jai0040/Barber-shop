import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Auth, Perms, RequirePermission } from '../common/decorators';
import { AuthContext, Effective } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AttendanceService } from './attendance.service';
import {
  attendanceQuerySchema,
  clockInSchema,
  clockOutSchema,
  generatePayrollSchema,
  payPayrollSettlementSchema,
  recordAttendanceSchema,
  requestAdvanceSchema,
  reviewAdvanceSchema,
  updateWorkerSalaryConfigSchema,
} from './attendance.schemas';

@Controller('attendance')
export class AttendanceController {
  constructor(private svc: AttendanceService) {}

  @RequirePermission('attendance.view')
  @Get('today')
  getTodayStatus(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query('workerId') workerId?: string
  ) {
    return this.svc.getTodayStatus(ctx, actor, workerId);
  }

  @RequirePermission('attendance.view')
  @Post('clock-in')
  clockIn(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Body(new ZodValidationPipe(clockInSchema)) dto: any
  ) {
    return this.svc.clockIn(ctx, actor, dto);
  }

  @RequirePermission('attendance.view')
  @Post('clock-out')
  clockOut(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Body(new ZodValidationPipe(clockOutSchema)) dto: any
  ) {
    return this.svc.clockOut(ctx, actor, dto);
  }

  @RequirePermission('attendance.view')
  @Get('records')
  listAttendance(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) query: any
  ) {
    return this.svc.listAttendance(ctx, actor, query);
  }

  @RequirePermission('attendance.manage')
  @Post('record')
  recordAttendance(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(recordAttendanceSchema)) dto: any
  ) {
    return this.svc.recordAttendance(ctx, dto);
  }

  // --- Salary Advances ---

  @RequirePermission('salary.view')
  @Post('advances/request')
  requestAdvance(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Body(new ZodValidationPipe(requestAdvanceSchema)) dto: any
  ) {
    return this.svc.requestAdvance(ctx, actor, dto);
  }

  @RequirePermission('salary.view')
  @Get('advances')
  listAdvances(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query('workerId') workerId?: string,
    @Query('status') status?: string
  ) {
    return this.svc.listAdvances(ctx, actor, { workerId, status });
  }

  @RequirePermission('salary.manage')
  @Post('advances/:id/review')
  reviewAdvance(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewAdvanceSchema)) dto: any
  ) {
    return this.svc.reviewAdvance(ctx, id, dto);
  }

  @RequirePermission('salary.manage')
  @Put('worker/:workerId/salary')
  updateWorkerSalary(
    @Auth() ctx: AuthContext,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body(new ZodValidationPipe(updateWorkerSalaryConfigSchema)) dto: any
  ) {
    return this.svc.updateWorkerSalary(ctx, workerId, dto.baseSalaryPaise);
  }

  // --- Monthly Payroll Settlements ---

  @RequirePermission('salary.manage')
  @Get('payroll/preview')
  previewPayroll(
    @Auth() ctx: AuthContext,
    @Query('workerId', ParseUUIDPipe) workerId: string,
    @Query('periodMonth', ParseIntPipe) periodMonth: number,
    @Query('periodYear', ParseIntPipe) periodYear: number
  ) {
    return this.svc.previewPayroll(ctx, workerId, periodMonth, periodYear);
  }

  @RequirePermission('salary.manage')
  @Post('payroll/generate')
  generatePayroll(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(generatePayrollSchema)) dto: any
  ) {
    return this.svc.generatePayroll(ctx, dto);
  }

  @RequirePermission('salary.view')
  @Get('payroll/settlements')
  listPayrollSettlements(
    @Auth() ctx: AuthContext,
    @Perms() actor: Effective,
    @Query('workerId') workerId?: string,
    @Query('periodYear') periodYear?: string,
    @Query('periodMonth') periodMonth?: string
  ) {
    return this.svc.listPayrollSettlements(ctx, actor, {
      workerId,
      periodYear: periodYear ? parseInt(periodYear, 10) : undefined,
      periodMonth: periodMonth ? parseInt(periodMonth, 10) : undefined,
    });
  }

  @RequirePermission('salary.manage')
  @Post('payroll/:id/pay')
  payPayrollSettlement(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(payPayrollSettlementSchema)) dto: any
  ) {
    return this.svc.payPayrollSettlement(ctx, id, dto);
  }
}
