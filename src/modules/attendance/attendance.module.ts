import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceSchedulerService } from './attendance-scheduler.service';
import { PrismaModule } from '@database/prisma.module';
import { EmailModule } from '@common/email/email.module';
import { AttendanceListener } from './listeners/attendance.listener';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'fallback-secret-change-me',
        signOptions: { expiresIn: '1m' },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceSchedulerService, AttendanceListener],
  exports: [AttendanceService],
})
export class AttendanceModule {}
