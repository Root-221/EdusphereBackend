import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseService } from './tenant-database.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Global()
@Module({
  providers: [PrismaService, TenantDatabaseService, TenantProvisioningService],
  exports: [PrismaService, TenantDatabaseService, TenantProvisioningService],
})
export class PrismaModule {}
