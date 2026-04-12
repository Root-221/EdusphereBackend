import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@common/enums/error-codes.enum';
import { getErrorMessage } from '@common/utils/messages.util';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthRepository, CreateSchoolWithAdminDto } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterSchoolDto } from './dto/register-school.dto';
import { UserRole } from '@prisma/client';
import { ITenant } from '@common/interfaces/tenant.interface';
import { EmailService } from '@common/email/email.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    schoolId: string | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private authRepository: AuthRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  /**
   * Connexion utilisateur avec résolution multi-tenant.
   *
   * @param loginDto   - { email, password }
   * @param ipAddress  - Adresse IP de la requête (pour la session)
   * @param tenant     - Tenant résolu depuis le sous-domaine (null = SUPER_ADMIN)
   */
async login(loginDto: LoginDto, ipAddress: string, tenant: ITenant | null): Promise<AuthResponse> {
    console.log('🔍 [LOGIN] Email:', loginDto.email, 'Tenant:', tenant?.slug ?? 'global', 'IP:', ipAddress);

    const user = await this.authRepository.findUserByEmail(
      loginDto.email,
      tenant,
    );
    console.log('👤 [LOGIN] User found:', !!user ? user.role : 'null');

    if (!user || !(await bcrypt.compare(loginDto.password, user.passwordHash))) {
      console.log('❌ [LOGIN] Auth failed - invalid credentials');
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: getErrorMessage(ErrorCode.AUTH_INVALID_CREDENTIALS),
      });
    }
    console.log('✅ [LOGIN] Password OK, role:', user.role);

    if (!tenant && user.role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: getErrorMessage(ErrorCode.AUTH_INVALID_CREDENTIALS),
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: ErrorCode.AUTH_ACCOUNT_INACTIVE,
        message: getErrorMessage(ErrorCode.AUTH_ACCOUNT_INACTIVE),
      });
    }

    console.log('🔑 [LOGIN] Generating JWT tokens...');
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: tenant?.id ?? null,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    console.log('📱 [LOGIN] Creating session...');
    await this.authRepository.createSession({
      userId: user.id,
      token: accessToken,
      refreshToken,
      expiresAt,
      ipAddress,
    }, tenant);
    console.log('✅ [LOGIN] Session created, login SUCCESS');

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        schoolId: tenant?.id ?? null,
      },
    };
  }

  /**
   * Inscription d'une nouvelle école avec son administrateur.
   * Vérifie le slug et l'email école avant de provisionner le tenant.
   */
  async registerSchool(dto: RegisterSchoolDto): Promise<{ school: any; admin: any }> {
    // Vérifie que le slug n'est pas déjà pris
    const existingSchool = await this.authRepository.findSchoolBySlug(dto.slug);
    if (existingSchool) {
      throw new ConflictException({
        code: ErrorCode.SCHOOL_SLUG_EXISTS,
        message: getErrorMessage(ErrorCode.SCHOOL_SLUG_EXISTS),
      });
    }

    const adminTempPassword =
      this.configService.get<string>('TENANT_ADMIN_TEMP_PASSWORD') ??
      'Password123!';
    const hashedPassword = await bcrypt.hash(adminTempPassword, 12);
    const adminEmail = dto.email ?? dto.contactEmail;

    if (!adminEmail) {
      throw new ConflictException({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'L\'email de contact de l\'école est obligatoire.',
      });
    }

    const existingSchoolByEmail = await this.authRepository.findSchoolByEmail(adminEmail);
    if (existingSchoolByEmail) {
      throw new ConflictException({
        code: ErrorCode.SCHOOL_EMAIL_EXISTS,
        message: getErrorMessage(ErrorCode.SCHOOL_EMAIL_EXISTS),
      });
    }

    const result = await this.authRepository.createSchoolWithAdmin({
      ...dto,
      adminEmail,
      adminPasswordHash: hashedPassword,
    });

    try {
      const emailResult = await this.emailService.sendTenantAdminInvitation({
        to: adminEmail,
        firstName: dto.adminFirstName,
        schoolName: dto.name,
        tenantSlug: dto.slug,
        login: adminEmail,
        password: adminTempPassword,
      });

      if (emailResult.success) {
        this.logger.log(`School admin invitation email queued for ${adminEmail}`);
      } else {
        this.logger.warn(
          `School created, but the invitation email could not be sent to ${adminEmail}: ${emailResult.error ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `School created, but email delivery threw an unexpected error for ${adminEmail}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return result;
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch (error) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        message: getErrorMessage(ErrorCode.AUTH_INVALID_REFRESH_TOKEN),
      });
    }

    const tenant = payload.schoolId
      ? await this.authRepository.findSchoolById(payload.schoolId)
      : null;

    if (payload.schoolId && !tenant) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        message: getErrorMessage(ErrorCode.AUTH_INVALID_REFRESH_TOKEN),
      });
    }

    const session = await this.authRepository.findSessionByRefreshToken(refreshToken, tenant);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        message: getErrorMessage(ErrorCode.AUTH_INVALID_REFRESH_TOKEN),
      });
    }

    const user = await this.authRepository.findUserById(session.userId, tenant);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_USER_NOT_FOUND,
        message: getErrorMessage(ErrorCode.AUTH_USER_NOT_FOUND),
      });
    }

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: tenant?.id ?? null,
    };

    const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '15m' });
    const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.authRepository.deleteSessionById(session.id, tenant);
    await this.authRepository.createSession({
      userId: user.id,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt,
      ipAddress: session.ipAddress ?? undefined,
    }, tenant);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          schoolId: tenant?.id ?? null,
        },
      };
  }

  async logout(userId: string, tenant: ITenant | null): Promise<void> {
    await this.authRepository.deleteUserSessions(userId, tenant);
  }
}
