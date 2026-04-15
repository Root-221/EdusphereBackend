import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentTenant } from '@common/decorators/current-tenant.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { ITenant } from '@common/interfaces/tenant.interface';
import { UserRole } from '@prisma/client';
import { ParentService } from './parent.service';

@ApiTags('Parent')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les routes parent.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PARENT)
@Controller('parent')
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Récupérer le profil du parent' })
  async getProfile(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    const data = await this.parentService.getParentProfile(userId, tenant);
    return { data };
  }

  @Get('children/:childId/timetable')
  @ApiParam({ name: 'childId', description: 'Identifiant de l\'enfant' })
  @ApiOperation({ summary: 'Récupérer l\'emploi du temps d\'un enfant' })
  async getChildTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') userId: string,
    @Param('childId') childId: string,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    const data = await this.parentService.getChildTimetable(userId, childId, tenant, weekStartDate);
    return { data };
  }

  @Get('payments')
  @ApiOperation({ summary: 'Récupérer l\'historique des paiements du parent' })
  async getPayments(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') userId: string,
  ) {
    const data = await this.parentService.getPayments(userId, tenant);
    return { data };
  }
}