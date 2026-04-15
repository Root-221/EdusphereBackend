import { Module } from '@nestjs/common';
import { EmailModule } from '@common/email/email.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentListener } from './listeners/enrollment.listener';

@Module({
  imports: [EmailModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentListener],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
