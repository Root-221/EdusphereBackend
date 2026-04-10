import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { RegisterSchoolDto } from '@modules/auth/dto/register-school.dto';
import { SuperAdminService } from './super-admin.service';
import { UpdateSchoolStatusDto } from './dto/update-school-status.dto';
import { UpdateSchoolAdminStatusDto } from './dto/update-school-admin-status.dto';
import { getSuccessMessage } from '@common/utils/messages.util';
import { SuccessMessage } from '@common/enums/success-messages.enum';
import { CloudinaryUploadFile } from '@common/cloudinary/cloudinary.service';
import { Request } from 'express';

@ApiTags('Super Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('schools')
  @ApiOkResponse({ description: 'Liste des écoles gérées par la platforme' })
  async findAll(@Req() req: Request) {
    const schools = await this.service.listSchools();
    return {
      data: schools,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('school-admins')
  @ApiOperation({ summary: 'Liste des administrateurs par école' })
  @ApiOkResponse({ description: 'Administrateurs listés par école' })
  async listAdmins(@Req() req: Request) {
    const admins = await this.service.listSchoolAdmins();
    return {
      data: admins,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Post('schools')
  @ApiBody({ type: RegisterSchoolDto })
  async register(@Body() dto: RegisterSchoolDto, @Req() req: Request) {
    const result = await this.service.createSchool(dto);
    return {
      data: result,
      message: getSuccessMessage(SuccessMessage.REGISTER_SUCCESS),
      _links: {
        self: req.originalUrl,
        login: '/auth/login',
      },
    };
  }

  @Post('uploads/school-logo')
  @ApiOperation({ summary: 'Téléverser le logo d\'une école' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadSchoolLogo(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /^image\/(jpe?g|png|webp|gif|svg\+xml)$/i })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: CloudinaryUploadFile,
    @Req() req: Request,
  ) {
    const logo = await this.service.uploadSchoolLogo(file, this.getBaseUrl(req));
    return {
      data: logo,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  private getBaseUrl(req: Request): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedValue = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const protocol =
      typeof forwardedValue === 'string' && forwardedValue.trim().length > 0
        ? forwardedValue.split(',')[0].trim()
        : req.protocol;
    return `${protocol}://${req.get('host') || 'localhost:3000'}`;
  }

  @Patch('schools/:id/status')
  @ApiParam({ name: 'id', description: 'Identifiant de l\'école' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolStatusDto,
    @Req() req: Request,
  ) {
    const school = await this.service.updateSchoolStatus(id, dto.status);
    return {
      data: school,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Patch('school-admins/:id/status')
  @ApiParam({ name: 'id', description: 'Identifiant de l’administrateur' })
  @ApiOkResponse({ description: 'Mise à jour du statut de l’administrateur' })
  async updateAdminStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolAdminStatusDto,
    @Req() req: Request,
  ) {
    const admin = await this.service.updateSchoolAdminStatus(id, dto.isActive);
    return {
      data: admin,
      _links: {
        self: req.originalUrl,
      },
    };
  }

  @Get('stats')
  @ApiOkResponse({ description: 'Statistiques globales de la plateforme' })
  async stats(@Req() req: Request) {
    const stats = await this.service.getPlatformStats();
    return {
      data: stats,
      _links: {
        self: req.originalUrl,
      },
    };
  }
}
