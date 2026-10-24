import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityController, StaffAvailabilityController } from './availability.controller';

@Module({
  controllers: [PublicAvailabilityController, StaffAvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
