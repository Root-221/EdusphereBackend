import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/tenant-client';
import { ITenant } from '@common/interfaces/tenant.interface';

@Injectable()
export class TenantDatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantDatabaseService.name);
  private readonly clients = new Map<string, PrismaClient>();

  async getClientForTenant(tenant: ITenant): Promise<PrismaClient> {
    if (!tenant.databaseUrl || tenant.databaseUrl.trim() === '') {
      throw new ServiceUnavailableException(`Tenant ${tenant.slug} is missing databaseUrl`);
    }

    const cacheKey = `${tenant.slug}:${tenant.databaseUrl}`;
    if (this.clients.has(cacheKey)) {
      return this.clients.get(cacheKey)!;
    }

    this.logger.log(`Creating Prisma client for tenant ${tenant.slug}`);

    const client = new PrismaClient({
      datasources: {
        db: {
          url: tenant.databaseUrl,
        },
      },
    });

    try {
      await client.$connect();
    } catch (error) {
      await client.$disconnect().catch(() => undefined);
      throw new ServiceUnavailableException(
        `La base de données du tenant ${tenant.slug} est temporairement indisponible.`,
      );
    }
    this.clients.set(cacheKey, client);
    return client;
  }

  async onModuleDestroy() {
    const disconnects = Array.from(this.clients.values()).map((client) =>
      client.$disconnect(),
    );
    await Promise.all(disconnects);
  }
}
