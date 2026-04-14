import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CourseSchedulerService } from './course-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [CourseSchedulerService],
  exports: [CourseSchedulerService],
})
export class CourseSchedulerModule {}
