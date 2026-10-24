import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController, PublicAppointmentsController } from './appointments.controller';

@Module({
  imports: [AvailabilityModule],
  controllers: [AppointmentsController, PublicAppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
