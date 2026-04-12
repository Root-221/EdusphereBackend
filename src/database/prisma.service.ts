import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Central database connection established');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Central database is not reachable at bootstrap (${message}). DB-backed routes will fail with a 503 until PostgreSQL is available.`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
