import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { AuthModule } from '@modules/auth/auth.module';
import { RolesGuard } from '@common/guards/roles.guard';
import { CloudinaryService } from '@common/cloudinary/cloudinary.service';

@Module({
  imports: [AuthModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, RolesGuard, CloudinaryService],
})
export class SuperAdminModule {}
