import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

@Injectable()
export class TenantProvisioningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantProvisioningService.name);
  private readonly adminClient: PrismaClient;
  private readonly schemaPath: string;
  private readonly nameTemplate: string;
  private readonly urlTemplate?: string;
  private readonly provisioning = new Map<string, Promise<string>>();

  constructor(private readonly config: ConfigService) {
    const adminUrl = this.config.get<string>('DATABASE_ADMIN_URL') ?? this.config.get<string>('DATABASE_URL');
    if (!adminUrl) {
      throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be defined to provision tenant schemas');
    }

    this.adminClient = new PrismaClient({
      datasources: {
        db: {
          url: adminUrl,
        },
      },
    });

    const rawSchemaPath =
      this.config.get<string>('PRISMA_TENANT_SCHEMA_PATH') ??
      this.config.get<string>('PRISMA_SCHEMA_PATH') ??
      'prisma/tenant/schema.prisma';
    this.schemaPath = this.resolveSchemaPath(rawSchemaPath);
    this.nameTemplate = this.config.get<string>('TENANT_DB_NAME_TEMPLATE') ?? 'edusphere_%s';
    const rawUrlTemplate = this.config.get<string>('TENANT_DB_URL_TEMPLATE')?.trim() ?? '';
    if (rawUrlTemplate.length > 0) {
      this.urlTemplate = rawUrlTemplate;
    }
  }

  async onModuleInit() {
    await this.adminClient.$connect();
  }

  async onModuleDestroy() {
    await this.adminClient.$disconnect();
  }

  async ensureTenantDatabase(slug: string): Promise<string> {
    const normalizedSlug = this.normalizeSlug(slug);
    if (!normalizedSlug) {
      throw new Error('Tenant slug must contain at least one alphanumeric character');
    }

    if (this.provisioning.has(normalizedSlug)) {
      return this.provisioning.get(normalizedSlug)!;
    }

    const promise = this.createAndMigrate(normalizedSlug);
    this.provisioning.set(normalizedSlug, promise);

    try {
      return await promise;
    } finally {
      this.provisioning.delete(normalizedSlug);
    }
  }

  async syncTenantSchema(databaseUrl: string, label = 'tenant'): Promise<void> {
    if (!databaseUrl || databaseUrl.trim() === '') {
      throw new Error('Tenant databaseUrl must be provided to sync schema');
    }

    await this.pushTenantSchema(label, databaseUrl);
  }

  private normalizeSlug(slug: string): string {
    return slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private resolveSchemaPath(rawSchemaPath: string): string {
    const candidatePaths = path.isAbsolute(rawSchemaPath)
      ? [rawSchemaPath]
      : [
          path.resolve(process.cwd(), rawSchemaPath),
          path.resolve(__dirname, '../../prisma/tenant/schema.prisma'),
        ];

    const existingPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (existingPath) {
      return existingPath;
    }

    return candidatePaths[0];
  }

  private getWorkingDirectory(): string {
    return path.resolve(path.dirname(this.schemaPath), '..', '..');
  }

  private buildDatabaseName(slug: string): string {
    if (this.nameTemplate.includes('%s')) {
      return this.nameTemplate.replace(/%s/g, slug);
    }
    return `${this.nameTemplate}_${slug}`;
  }

  private buildDatabaseUrl(dbName: string, slug: string): string {
    if (this.urlTemplate) {
      return this.urlTemplate.replace(/%s/g, dbName).replace(/{{slug}}/g, slug);
    }

    const baseUrl = this.config.get<string>('DATABASE_ADMIN_URL') ?? this.config.get<string>('DATABASE_URL');
    if (!baseUrl) {
      throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set to build tenant URLs');
    }

    const url = new URL(baseUrl);
    url.pathname = `/${dbName}`;
    return url.toString();
  }

  private async createAndMigrate(slug: string): Promise<string> {
    const dbName = this.buildDatabaseName(slug);
    const dbUrl = this.buildDatabaseUrl(dbName, slug);

    if (!(await this.databaseExists(dbName))) {
      this.logger.log(`Creating tenant database ${dbName}`);
      await this.adminClient.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      this.logger.log(`Waiting for Neon propagation...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      this.logger.log(`Tenant database ${dbName} already exists`);
    }

    await this.pushTenantSchemaWithRetry(dbName, dbUrl);
    return dbUrl;
  }

  private async pushTenantSchemaWithRetry(label: string, dbUrl: string, maxRetries = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.pushTenantSchema(label, dbUrl);
        return;
      } catch (error) {
        const errorMsg = (error as Error).message ?? '';
        const isRetryable =
          errorMsg.includes("Can't reach database server") ||
          errorMsg.includes("does not exist") ||
          errorMsg.includes("P1001");

        if (attempt === maxRetries || !isRetryable) {
          throw error;
        }
        this.logger.warn(`Retry ${attempt}/${maxRetries} for ${label}: ${errorMsg}`);
        await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
      }
    }
  }

  private async databaseExists(dbName: string): Promise<boolean> {
    const rows = await this.adminClient.$queryRaw<{ datname: string }[]>(
      Prisma.sql`SELECT datname FROM pg_database WHERE datname = ${dbName}`,
    );
    return rows.length > 0;
  }

  private async pushTenantSchema(label: string, databaseUrl: string): Promise<void> {
    this.logger.log(`Applying migrations for tenant ${label}`);
    try {
      const prismaBinary = this.resolvePrismaBinary();

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          prismaBinary,
          [
            'db',
            'push',
            '--schema',
            this.schemaPath,
            '--accept-data-loss',
          ],
          {
            cwd: this.getWorkingDirectory(),
            env: {
              ...process.env,
              DATABASE_URL: databaseUrl,
            },
            stdio: 'inherit',
            windowsHide: true,
          },
        );

        const timeoutMs = 120_000;
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(
            new ServiceUnavailableException(
              `La synchronisation du schéma du tenant ${label} a pris trop de temps.`,
            ),
          );
        }, timeoutMs);

        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        child.on('exit', (code, signal) => {
          clearTimeout(timeout);

          if (code === 0) {
            resolve();
            return;
          }

          const exitReason = signal ? `signal ${signal}` : `status ${code ?? 'unknown'}`;
          reject(new Error(`prisma db push exited with ${exitReason}`));
        });
      });
    } catch (error) {
      this.logger.error(`Unable to apply schema for ${label}`, error as Error);
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        `Impossible de synchroniser le schéma du tenant ${label}.`,
      );
    }
  }

  private resolvePrismaBinary(): string {
    const localBinary = path.resolve(this.getWorkingDirectory(), 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
    if (existsSync(localBinary)) {
      return localBinary;
    }

    return 'prisma';
  }
}
