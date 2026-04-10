import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentTenant } from '@common/decorators/current-tenant.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { ITenant } from '@common/interfaces/tenant.interface';
import { UserRole } from '@prisma/client';
import {
  CreateEnrollmentDto,
  CreateEnrollmentPeriodDto,
  CreateReEnrollmentDto,
  EnrollmentPeriodTypeValues,
  ListEnrollmentsQueryDto,
  SetActiveEnrollmentPeriodDto,
  UpdateEnrollmentPeriodDto,
} from './enrollment.dto';
import { EnrollmentService } from './enrollment.service';

@ApiTags('School Admin - Inscriptions')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les inscriptions.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school-admin')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get('periods')
  @ApiOperation({ summary: 'Lister les périodes d’inscription' })
  @ApiQuery({ name: 'type', required: false, enum: EnrollmentPeriodTypeValues })
  @ApiOkResponse({ description: 'Périodes listées avec succès' })
  async listPeriods(
    @CurrentTenant() tenant: ITenant | null,
    @Query('type') type?: string,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.listPeriods(tenant, type);
    return { data };
  }

  @Get('periods/active')
  @ApiOperation({ summary: 'Lister les périodes actives' })
  @ApiOkResponse({ description: 'Périodes actives listées avec succès' })
  async listActivePeriods(@CurrentTenant() tenant: ITenant | null, @Req() req?: Request) {
    const data = await this.enrollmentService.listActivePeriods(tenant);
    return { data };
  }

  @Post('periods')
  @ApiOperation({ summary: 'Créer une période d’inscription' })
  @ApiBody({ type: CreateEnrollmentPeriodDto })
  @ApiCreatedResponse({ description: 'Période créée avec succès' })
  async createPeriod(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateEnrollmentPeriodDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.createPeriod(tenant, dto);
    return { data };
  }

  @Patch('periods/:id')
  @ApiOperation({ summary: 'Modifier une période d’inscription' })
  @ApiParam({ name: 'id', description: 'Identifiant de la période' })
  @ApiBody({ type: UpdateEnrollmentPeriodDto })
  async updatePeriod(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateEnrollmentPeriodDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.updatePeriod(tenant, id, dto);
    return { data };
  }

  @Delete('periods/:id')
  @ApiOperation({ summary: 'Supprimer une période d’inscription' })
  @ApiParam({ name: 'id', description: 'Identifiant de la période' })
  async deletePeriod(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.deletePeriod(tenant, id);
    return { data };
  }

  @Patch('periods/set-active')
  @ApiOperation({ summary: 'Définir une période comme active' })
  @ApiBody({ type: SetActiveEnrollmentPeriodDto })
  async setActivePeriod(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: SetActiveEnrollmentPeriodDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.setActivePeriod(tenant, dto);
    return { data };
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Lister les inscriptions' })
  @ApiOkResponse({ description: 'Inscriptions listées avec succès' })
  async listEnrollments(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListEnrollmentsQueryDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.listEnrollments(tenant, query);
    return { data };
  }

  @Get('enrollments/latest/:matricule')
  @ApiOperation({ summary: 'Obtenir la dernière inscription par matricule' })
  @ApiParam({ name: 'matricule', description: 'Matricule de l’élève' })
  @ApiOkResponse({ description: 'Dernière inscription récupérée avec succès' })
  async findLatestEnrollmentByMatricule(
    @CurrentTenant() tenant: ITenant | null,
    @Param('matricule') matricule: string,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.findLatestEnrollmentByMatricule(tenant, matricule);
    return { data };
  }

  @Post('enrollments')
  @ApiOperation({ summary: 'Créer une inscription' })
  @ApiBody({ type: CreateEnrollmentDto })
  @ApiCreatedResponse({ description: 'Inscription créée avec succès' })
  async createEnrollment(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateEnrollmentDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.createEnrollment(tenant, dto);
    return { data };
  }

  @Post('reenrollments')
  @ApiOperation({ summary: 'Créer une réinscription' })
  @ApiBody({ type: CreateReEnrollmentDto })
  @ApiCreatedResponse({ description: 'Réinscription créée avec succès' })
  async createReEnrollment(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateReEnrollmentDto,
    @Req() req?: Request,
  ) {
    const data = await this.enrollmentService.createReEnrollment(tenant, dto);
    return { data };
  }
}
