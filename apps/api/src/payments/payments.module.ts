import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentGatewayService } from './payments.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [BillingModule],
  controllers: [PaymentsController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentsModule {}
