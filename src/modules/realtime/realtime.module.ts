import { Global, Module } from '@nestjs/common';
import { TimetableGateway } from './timetable.gateway';

@Global()
@Module({
  providers: [TimetableGateway],
  exports: [TimetableGateway],
})
export class RealtimeModule {}
