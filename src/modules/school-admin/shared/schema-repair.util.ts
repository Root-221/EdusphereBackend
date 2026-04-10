import { ITenant } from '@common/interfaces/tenant.interface';
import { TenantProvisioningService } from '@database/tenant-provisioning.service';

type PrismaKnownRequestErrorLike = {
  code?: unknown;
  meta?: {
    code?: unknown;
    message?: unknown;
  };
};

const isPrismaKnownRequestErrorLike = (error: unknown): error is PrismaKnownRequestErrorLike => {
  return !!error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string';
};

export function isSchemaMismatchError(error: unknown): boolean {
  if (!isPrismaKnownRequestErrorLike(error)) {
    return false;
  }

  if (error.code === 'P2021' || error.code === 'P2022') {
    return true;
  }

  if (error.code === 'P2010') {
    const meta = error.meta;
    const dbCode = typeof meta?.code === 'string' ? meta.code : '';
    const message = typeof meta?.message === 'string' ? meta.message : '';
    return dbCode === '42P01' || /relation .* does not exist/i.test(message) || /table .* does not exist/i.test(message);
  }

  return false;
}

export async function withTenantSchemaRepair<T>(
  tenant: ITenant | null,
  tenantProvisioningService: TenantProvisioningService,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!tenant || !isSchemaMismatchError(error)) {
      throw error;
    }

    await tenantProvisioningService.syncTenantSchema(tenant.databaseUrl, tenant.slug);
    return operation();
  }
}
