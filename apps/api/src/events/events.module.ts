import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { RealtimeEventsService } from './events.service';

@Global()
@Module({
  controllers: [EventsController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class EventsModule {}
