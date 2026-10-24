import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PublicServicesController, ServicesController } from './services.controller';

@Module({
  controllers: [ServicesController, PublicServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
