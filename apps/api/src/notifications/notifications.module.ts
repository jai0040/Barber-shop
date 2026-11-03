import { Module } from '@nestjs/common';
import { NotificationsController, CustomerNotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [NotificationsController, CustomerNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
