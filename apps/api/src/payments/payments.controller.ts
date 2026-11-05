import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentGatewayService } from './payments.service';
import {
  createRazorpayOrderSchema,
  updateGatewayCredentialsSchema,
  verifyRazorpayPaymentSchema,
} from './payments.schemas';

@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentGatewayService) {}

  @RequirePermission('payments.record')
  @Post('razorpay/create-order')
  createOrder(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(createRazorpayOrderSchema)) dto: any
  ) {
    return this.svc.createOrder(ctx, dto);
  }

  @RequirePermission('payments.record')
  @Post('razorpay/verify')
  verifyPayment(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(verifyRazorpayPaymentSchema)) dto: any
  ) {
    return this.svc.verifyPayment(ctx, dto);
  }

  @RequirePermission('settings.manage')
  @Get('credentials')
  getCredentials(@Auth() ctx: AuthContext) {
    return this.svc.getCredentialsStatus(ctx);
  }

  @RequirePermission('settings.manage')
  @Patch('credentials')
  updateCredentials(
    @Auth() ctx: AuthContext,
    @Body(new ZodValidationPipe(updateGatewayCredentialsSchema)) dto: any
  ) {
    return this.svc.updateCredentials(ctx, dto);
  }

  @Public()
  @Post('razorpay/webhook')
  @HttpCode(200)
  webhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature?: string
  ) {
    return this.svc.handleWebhook(body, signature);
  }
}
