import { Module } from '@nestjs/common';
import { CustomersController, MyCustomerController } from './customers.controller';
import { CustomersService } from './customers.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [LoyaltyModule, MembershipsModule],
  controllers: [CustomersController, MyCustomerController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
