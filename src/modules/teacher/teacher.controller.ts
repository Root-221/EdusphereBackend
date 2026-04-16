import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { TeacherService } from './teacher.service';
import { ListTeacherClassesQueryDto, ListTeacherTimetableQueryDto, CancelTeacherCourseDto } from './teacher.dto';

@ApiTags('Teacher')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les routes professeur.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.STUDENT)
@Controller('teacher')
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get('classes/options')
  @ApiOperation({ summary: 'Options pour les classes du professeur' })
  async getClassesOptions(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.getTeacherClassesOptions(tenant, teacherId);
    return { data };
  }

  @Get('classes')
  @ApiOperation({ summary: 'Lister les classes enseignées' })
  async listClasses(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Query() query: ListTeacherClassesQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.listTeacherClasses(tenant, teacherId, query);
    return { data };
  }

  @Get('classes/:id/students')
  @ApiParam({ name: 'id', description: 'Identifiant de la classe' })
  @ApiOperation({ summary: "Lister les élèves d'une classe du professeur" })
  async listClassStudents(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.listTeacherClassStudents(tenant, teacherId, id);
    return { data };
  }

  @Get('timetable/options')
  @ApiOperation({ summary: "Options pour l'emploi du temps du professeur" })
  async getTimetableOptions(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.getTeacherTimetableOptions(tenant, teacherId);
    return { data };
  }

  @Get('timetable')
  @ApiOperation({ summary: "Lister l'emploi du temps du professeur" })
  async listTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Query() query: ListTeacherTimetableQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.listTeacherTimetableEntries(tenant, teacherId, query);
    return { data };
  }

  @Post('courses/:courseId/cancel')
  @ApiOperation({ summary: 'Annuler un cours' })
  @ApiParam({ name: 'courseId', description: 'Identifiant du cours' })
  async cancelCourse(
    @CurrentTenant() tenant: ITenant | null,
    @CurrentUser('sub') teacherId: string,
    @Param('courseId') courseId: string,
    @Body() dto: CancelTeacherCourseDto,
    @Req() req: Request,
  ) {
    const data = await this.teacherService.cancelCourse(tenant, teacherId, courseId, dto);
    return { data };
  }
}
