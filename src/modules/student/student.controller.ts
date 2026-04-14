import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
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
import { StudentService } from './student.service';

@ApiTags('Student')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les routes élève.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Récupérer le profil de l\'élève' })
  async getProfile(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
  ) {
    const data = await this.studentService.getStudentProfile(userId, tenant);
    return { data };
  }

  @Get('timetable')
  @ApiOperation({ summary: 'Récupérer l\'emploi du temps de l\'élève' })
  @ApiQuery({ name: 'weekStartDate', required: false, description: 'Date de début de semaine (YYYY-MM-DD)' })
  async getTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Query('weekStartDate') weekStartDate?: string,
  ) {
    const data = await this.studentService.getStudentTimetable(userId, tenant, weekStartDate);
    return { data };
  }
}