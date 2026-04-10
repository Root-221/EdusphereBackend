import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterSchoolDto } from './dto/register-school.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { CurrentTenant } from '@common/decorators/current-tenant.decorator';
import { Public } from '@common/decorators/public.decorator';
import { getSuccessMessage } from '@common/utils/messages.util';
import { SuccessMessage } from '@common/enums/success-messages.enum';
import { ITenant } from '@common/interfaces/tenant.interface';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Connexion utilisateur' })
  @ApiHeader({
    name: 'X-Tenant-Slug',
    required: false,
    example: 'lycee-excellence'
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  @ApiResponse({ status: 403, description: 'Ecole suspendue' })
  @ApiResponse({ status: 404, description: 'Ecole introuvable' })
  async login(
    @Body() loginDto: LoginDto,
    @CurrentTenant() tenant: ITenant | null,
    @Req() req: any,
  ) {
    const ipAddress = Array.isArray(req.ip) ? req.ip[0] : req.ip || 'unknown';
    const result = await this.authService.login(
      loginDto,
      ipAddress,
      tenant,
    );
    return {
      data: result,
      message: getSuccessMessage(SuccessMessage.LOGIN_SUCCESS),
      ...(tenant && { tenant: { slug: tenant.slug, name: tenant.name } }),
      _links: {
        self: req.originalUrl,
        refresh: '/auth/refresh',
        profile: '/auth/me',
        logout: '/auth/logout',
      },
    };
  }

  @Post('register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Inscription nouvelle ecole avec admin' })
  @ApiBody({ type: RegisterSchoolDto })
  @ApiOkResponse({ description: 'Ecole creee avec succes' })
  @ApiResponse({ status: 409, description: 'Slug existe deja' })
  async register(@Body() dto: RegisterSchoolDto, @Req() req: any) {
    const result = await this.authService.registerSchool(dto);
    return {
      data: result,
      message: getSuccessMessage(SuccessMessage.REGISTER_SUCCESS),
      _links: {
        self: req.originalUrl,
        login: '/auth/login',
      },
    };
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rafraichir token d acces' })
  async refresh(@Body('refreshToken') refreshToken: string, @Req() req: any) {
    const result = await this.authService.refreshToken(refreshToken);
    return {
      data: result,
      message: getSuccessMessage(SuccessMessage.REFRESH_SUCCESS),
      _links: {
        self: req.originalUrl,
        profile: '/auth/me',
        logout: '/auth/logout',
      },
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser('sub') userId: string,
    @CurrentTenant() tenant: ITenant | null,
    @Req() req: any,
  ) {
    await this.authService.logout(userId, tenant);
    return {
      data: null,
      message: getSuccessMessage(SuccessMessage.LOGOUT_SUCCESS),
      _links: {
        self: req.originalUrl,
        login: '/auth/login',
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: any, @Req() req: any) {
    return {
      data: user,
      message: getSuccessMessage(SuccessMessage.PROFILE_FETCHED),
      _links: {
        self: req.originalUrl,
        logout: '/auth/logout',
      },
    };
  }
}
