import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth, Public, RequirePermission } from '../common/decorators';
import { AuthContext } from '../common/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { slugParam } from '../shops/shops.schemas';
import { PaymentGatewayService } from './payments.service';
import {
  createPublicRazorpayOrderSchema,
  createRazorpayOrderSchema,
  updateGatewayCredentialsSchema,
  verifyPublicRazorpayPaymentSchema,
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

  @Public()
  @Post('public/:slug/razorpay/create-order')
  createPublicOrder(
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string,
    @Body(new ZodValidationPipe(createPublicRazorpayOrderSchema)) dto: any
  ) {
    return this.svc.createPublicOrder(slug, dto);
  }

  @Public()
  @Post('public/:slug/razorpay/verify')
  verifyPublicPayment(
    @Param('slug', new ZodValidationPipe(slugParam)) slug: string,
    @Body(new ZodValidationPipe(verifyPublicRazorpayPaymentSchema)) dto: any
  ) {
    return this.svc.verifyPublicPayment(slug, dto);
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
