import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ITenant } from '@common/interfaces/tenant.interface';

/**
 * @CurrentTenant() — injecte le tenant (req.school) dans un paramètre de controller.
 *
 * Usage:
 *   async login(@CurrentTenant() tenant: ITenant | null) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ITenant | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.school ?? null;
  },
);
