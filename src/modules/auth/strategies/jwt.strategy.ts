import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { JwtPayload } from '../auth.service';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private tenantDatabaseService: TenantDatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    let tenant: ITenant | null = null;
    let prismaClient: any = this.prisma;

    if (payload.schoolId) {
      const school = await this.prisma.school.findUnique({
        where: { id: payload.schoolId },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          plan: true,
          databaseUrl: true,
        },
      });

      if (!school) {
        throw new UnauthorizedException('Tenant introuvable');
      }

      if (school.status !== 'ACTIVE') {
        throw new UnauthorizedException('Tenant inactif');
      }

      tenant = school as ITenant;
      prismaClient = await this.tenantDatabaseService.getClientForTenant(tenant);
    }

    const user = await prismaClient.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé');
    }

    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: payload.schoolId ?? null,
    };
  }
}
