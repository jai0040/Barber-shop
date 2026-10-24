import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FinanceService } from './finance.service';
import { createExpenseSchema, expenseQuerySchema, summaryQuerySchema } from './finance.schemas';

@Controller('finance')
export class FinanceController {
  constructor(private svc: FinanceService) {}

  @RequirePermission('income.view', 'expenses.view', 'reports.view')
  @Get('summary')
  getSummary(@Auth() ctx: AuthContext, @Query(new ZodValidationPipe(summaryQuerySchema)) q: any) {
    return this.svc.getSummary(ctx, q);
  }

  @RequirePermission('expenses.view', 'expenses.create')
  @Get('categories')
  listCategories(@Auth() ctx: AuthContext) {
    return this.svc.listCategories(ctx);
  }

  @RequirePermission('expenses.view')
  @Get('expenses')
  listExpenses(@Auth() ctx: AuthContext, @Query(new ZodValidationPipe(expenseQuerySchema)) q: any) {
    return this.svc.listExpenses(ctx, q);
  }

  @RequirePermission('expenses.create')
  @Post('expenses')
  createExpense(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createExpenseSchema)) dto: any) {
    return this.svc.createExpense(ctx, dto);
  }

  @RequirePermission('expenses.delete')
  @Delete('expenses/:id')
  @HttpCode(200)
  deleteExpense(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteExpense(ctx, id);
  }
}
