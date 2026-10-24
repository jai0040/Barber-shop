import { Module } from '@nestjs/common';
import { CustomersController, MyCustomerController } from './customers.controller';
import { CustomersService } from './customers.service';
@Module({ controllers: [CustomersController, MyCustomerController], providers: [CustomersService] })
export class CustomersModule {}
