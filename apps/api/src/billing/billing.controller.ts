import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Auth, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BillingService } from './billing.service';
import { createInvoiceSchema, invoiceQuerySchema, recordPaymentSchema } from './billing.schemas';

@Controller('billing')
export class BillingController {
  constructor(private svc: BillingService) {}

  @RequirePermission('billing.view')
  @Get('invoices')
  list(@Auth() ctx: AuthContext, @Query(new ZodValidationPipe(invoiceQuerySchema)) q: any) {
    return this.svc.list(ctx, q);
  }

  @RequirePermission('billing.view')
  @Get('invoices/:id')
  get(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(ctx, id);
  }

  @RequirePermission('billing.create')
  @Post('invoices')
  createInvoice(@Auth() ctx: AuthContext, @Body(new ZodValidationPipe(createInvoiceSchema)) dto: any) {
    return this.svc.createInvoice(ctx, dto);
  }

  @RequirePermission('payments.record')
  @Post('invoices/:id/pay')
  pay(
    @Auth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) dto: any
  ) {
    return this.svc.recordPayment(ctx, id, dto);
  }

  @RequirePermission('billing.void')
  @Post('invoices/:id/void')
  voidInvoice(@Auth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.voidInvoice(ctx, id);
  }
}
