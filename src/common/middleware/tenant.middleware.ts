import {
  Injectable,
  NestMiddleware,
  HttpException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { ErrorCode } from '@common/enums/error-codes.enum';
import { getErrorMessage } from '@common/utils/messages.util';
import { ITenant } from '@common/interfaces/tenant.interface';

/**
 * TenantMiddleware — résout le tenant depuis le header X-Tenant-Slug
 *
 * Cas possibles :
 *  - Aucun header → req.school = null  (contexte SUPER_ADMIN ou route publique)
 *  - Slug inconnu  → 404 TENANT_NOT_FOUND
 *  - École SUSPENDED/PENDING → 403 TENANT_SUSPENDED
 *  - École ACTIVE   → req.school = { id, slug, name, status, plan }
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request & { school?: ITenant | null }, res: Response, next: NextFunction) {
    try {
      const slug = req.headers['x-tenant-slug'] as string | undefined;

      // Pas de header → contexte sans tenant (SUPER_ADMIN)
      if (!slug || slug.trim() === '') {
        req.school = null;
        const hostnameSlug = this.extractSlugFromHostname(req.hostname);
        if (!hostnameSlug) {
          return next();
        }
        await this.attachTenant(hostnameSlug, req);
        return next();
      }

      const normalizedSlug = slug.trim().toLowerCase();
      await this.attachTenant(normalizedSlug, req);
      return next();
    } catch (error) {
      this.sendErrorResponse(res, error);
    }
  }

  private async attachTenant(
    normalizedSlug: string,
    req: Request & { school?: ITenant | null },
  ) {
    const slug = normalizedSlug;
    let school: ITenant | null;
    try {
      school = await this.prisma.school.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          plan: true,
          databaseUrl: true,
        },
      });
    } catch (error) {
      throw new ServiceUnavailableException('La base centrale est temporairement indisponible.');
    }

    if (!school) {
      throw new NotFoundException({
        code: ErrorCode.TENANT_NOT_FOUND,
        message: getErrorMessage(ErrorCode.TENANT_NOT_FOUND),
      });
    }

    if (school.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: ErrorCode.TENANT_SUSPENDED,
        message: getErrorMessage(ErrorCode.TENANT_SUSPENDED),
      });
    }

    // Attache le tenant à la requête HTTP
    req.school = school as ITenant;
  }

  private sendErrorResponse(res: Response, error: unknown): void {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const response = error.getResponse();
      const payload = typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : {};

      const code = typeof payload.code === 'string'
        ? payload.code
        : 'INTERNAL_ERROR';

      const message = typeof payload.message === 'string'
        ? payload.message
        : typeof response === 'string'
          ? response
          : error.message;

      const details = Array.isArray(payload.details)
        ? payload.details.filter((detail): detail is string => typeof detail === 'string')
        : [];

      res.status(status).json({
        error: {
          code,
          message,
          details,
        },
        _links: {
          documentation: '/api/docs#errors',
        },
      });
      return;
    }

    res.status(503).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'La base centrale est temporairement indisponible.',
        details: [],
      },
      _links: {
        documentation: '/api/docs#errors',
      },
    });
  }

  private extractSlugFromHostname(hostname?: string): string | null {
    if (!hostname) return null;
    const baseDomain = this.config.get<string>('TENANT_BASE_DOMAIN')?.trim().toLowerCase();
    const normalizedHostname = hostname.split(':')[0].toLowerCase();
    if (!baseDomain || !baseDomain.length) {
      return null;
    }
    if (normalizedHostname === baseDomain) {
      return null;
    }
    if (!normalizedHostname.endsWith(baseDomain)) {
      return null;
    }
    const slugPart = normalizedHostname.slice(0, normalizedHostname.length - baseDomain.length);
    const cleaned = slugPart.replace(/\.$/, '').replace(/^\./, '');
    return cleaned.length > 0 ? cleaned : null;
  }
}
