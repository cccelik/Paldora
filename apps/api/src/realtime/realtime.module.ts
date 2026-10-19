import { Module } from '@nestjs/common';
import { RealtimeBus } from './realtime-bus.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeStreamService } from './realtime-stream.service.js';

/** The per-person event stream and the bus other modules publish to. */
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeBus, RealtimeStreamService],
  exports: [RealtimeBus],
})
export class RealtimeModule {}
