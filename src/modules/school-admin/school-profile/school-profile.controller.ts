import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentTenant } from '@common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { ITenant } from '@common/interfaces/tenant.interface';
import { UserRole } from '@prisma/client';
import { SchoolProfileService } from './school-profile.service';

@ApiTags('School Admin - École')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour le profil école.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school-admin')
export class SchoolProfileController {
  constructor(private readonly schoolProfileService: SchoolProfileService) {}

  @Get('school')
  @ApiOperation({ summary: 'Obtenir le profil de l’école courante' })
  @ApiOkResponse({ description: 'Profil école récupéré avec succès' })
  async getCurrentSchool(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.schoolProfileService.getCurrentSchool(tenant);
    return { data };
  }
}
