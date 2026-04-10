import { Module } from '@nestjs/common';
import { InfrastructureController } from './infrastructure.controller';
import { InfrastructureService } from './infrastructure.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';

@Module({
  controllers: [InfrastructureController],
  providers: [InfrastructureService, JwtAuthGuard, RolesGuard],
})
export class InfrastructureModule {}
