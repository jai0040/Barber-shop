import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { CouponsController, PublicCouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [CoreModule],
  controllers: [CouponsController, PublicCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
