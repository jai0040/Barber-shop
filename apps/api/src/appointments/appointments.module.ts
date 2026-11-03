import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController, PublicAppointmentsController } from './appointments.controller';

@Module({
  imports: [AvailabilityModule, NotificationsModule],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
