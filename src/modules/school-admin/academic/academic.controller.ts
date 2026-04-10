import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiConflictResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiQuery,
  ApiOperation,
  ApiParam,
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
  AssignClassSubjectsDto,
  AssignSubjectTeachersDto,
  CreateAcademicYearDto,
  CreateClassDto,
  CreateLevelDto,
  CreateSemesterDto,
  CreateSubjectDto,
  CreateTimeSlotDto,
  CreateTimetableDto,
  CreateTimetableEntryDto,
  DuplicateTimetableDto,
  ListClassesQueryDto,
  ListLevelsQueryDto,
  ListSemestersQueryDto,
  ListTimetablesQueryDto,
  LevelStatusValues,
  UpdateAcademicYearDto,
  UpdateAcademicYearStatusDto,
  UpdateClassDto,
  UpdateLevelDto,
  UpdateSemesterDto,
  UpdateSemesterStatusDto,
  UpdateSubjectDto,
  UpdateTimeSlotDto,
  UpdateTimetableDto,
  UpdateTimetableEntryDto,
} from './academic.dto';
import { AcademicService } from './academic.service';

@ApiTags('School Admin - Académique')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les routes académiques.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school-admin')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('academic-years')
  @ApiOperation({ summary: 'Lister les années scolaires' })
  @ApiOkResponse({ description: 'Années scolaires listées avec succès' })
  async listAcademicYears(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.academicService.listAcademicYears(tenant);
    return { data };
  }

  @Post('academic-years')
  @ApiOperation({ summary: 'Créer une année scolaire' })
  @ApiBody({ type: CreateAcademicYearDto })
  @ApiCreatedResponse({ description: 'Année scolaire créée avec succès' })
  async createAcademicYear(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateAcademicYearDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createAcademicYear(tenant, dto);
    return { data };
  }

  @Patch('academic-years/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l année scolaire' })
  @ApiBody({ type: UpdateAcademicYearDto })
  async updateAcademicYear(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateAcademicYear(tenant, id, dto);
    return { data };
  }

  @Patch('academic-years/:id/status')
  @ApiParam({ name: 'id', description: 'Identifiant de l année scolaire' })
  @ApiBody({ type: UpdateAcademicYearStatusDto })
  async updateAcademicYearStatus(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearStatusDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateAcademicYearStatus(tenant, id, dto);
    return { data };
  }

  @Delete('academic-years/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l année scolaire' })
  async deleteAcademicYear(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteAcademicYear(tenant, id);
    return { data };
  }

  @Get('levels')
  @ApiOperation({ summary: 'Lister les niveaux' })
  @ApiOkResponse({ description: 'Liste des niveaux' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: LevelStatusValues,
    description: 'Filtrer par statut',
  })
  async listLevels(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListLevelsQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.listLevels(tenant, query);
    return { data };
  }

  @Post('levels')
  @ApiBody({ type: CreateLevelDto })
  @ApiOperation({ summary: 'Créer un niveau' })
  @ApiCreatedResponse({ description: 'Niveau créé avec succès' })
  @ApiConflictResponse({ description: 'Un niveau avec ce nom existe déjà' })
  async createLevel(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateLevelDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createLevel(tenant, dto);
    return { data };
  }

  @Patch('levels/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du niveau' })
  @ApiBody({ type: UpdateLevelDto })
  @ApiOperation({ summary: 'Modifier un niveau' })
  @ApiOkResponse({ description: 'Niveau modifié avec succès' })
  @ApiConflictResponse({ description: 'Un niveau avec ce nom existe déjà' })
  @ApiNotFoundResponse({ description: 'Niveau introuvable' })
  async updateLevel(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateLevelDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateLevel(tenant, id, dto);
    return { data };
  }

  @Delete('levels/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du niveau' })
  @ApiOperation({ summary: 'Supprimer un niveau' })
  @ApiOkResponse({ description: 'Niveau supprimé avec succès' })
  @ApiNotFoundResponse({ description: 'Niveau introuvable' })
  async deleteLevel(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteLevel(tenant, id);
    return { data };
  }

  @Get('semesters')
  @ApiOperation({ summary: 'Lister les semestres' })
  @ApiQuery({ name: 'academicYearId', required: false, description: 'Filtrer les semestres par année scolaire' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'completed', 'locked'],
    description: 'Filtrer par statut',
  })
  async listSemesters(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListSemestersQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.listSemesters(tenant, query);
    return { data };
  }

  @Post('semesters')
  @ApiBody({ type: CreateSemesterDto })
  async createSemester(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateSemesterDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createSemester(tenant, dto);
    return { data };
  }

  @Patch('semesters/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du semestre' })
  @ApiBody({ type: UpdateSemesterDto })
  async updateSemester(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateSemesterDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateSemester(tenant, id, dto);
    return { data };
  }

  @Patch('semesters/:id/status')
  @ApiParam({ name: 'id', description: 'Identifiant du semestre' })
  @ApiBody({ type: UpdateSemesterStatusDto })
  async updateSemesterStatus(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateSemesterStatusDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateSemesterStatus(tenant, id, dto);
    return { data };
  }

  @Delete('semesters/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du semestre' })
  async deleteSemester(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteSemester(tenant, id);
    return { data };
  }

  @Get('classes')
  @ApiOperation({ summary: 'Lister les classes' })
  @ApiQuery({ name: 'academicYearId', required: false, description: 'Filtrer les classes par année scolaire' })
  @ApiQuery({ name: 'level', required: false, description: 'Filtrer les classes par niveau' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'archived'],
    description: 'Filtrer par statut',
  })
  async listClasses(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListClassesQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.listClasses(tenant, query);
    return { data };
  }

  @Post('classes')
  @ApiBody({ type: CreateClassDto })
  async createClass(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateClassDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createClass(tenant, dto);
    return { data };
  }

  @Patch('classes/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de la classe' })
  @ApiBody({ type: UpdateClassDto })
  async updateClass(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateClass(tenant, id, dto);
    return { data };
  }

  @Delete('classes/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de la classe' })
  async deleteClass(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteClass(tenant, id);
    return { data };
  }

  @Post('classes/:id/subjects')
  @ApiParam({ name: 'id', description: 'Identifiant de la classe' })
  @ApiBody({ type: AssignClassSubjectsDto })
  async assignClassSubjects(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: AssignClassSubjectsDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.assignClassSubjects(tenant, id, dto);
    return { data };
  }

  @Get('subjects')
  @ApiOperation({ summary: 'Lister les matières' })
  async listSubjects(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.academicService.listSubjects(tenant);
    return { data };
  }

  @Post('subjects')
  @ApiBody({ type: CreateSubjectDto })
  async createSubject(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateSubjectDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createSubject(tenant, dto);
    return { data };
  }

  @Patch('subjects/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de la matière' })
  @ApiBody({ type: UpdateSubjectDto })
  async updateSubject(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateSubject(tenant, id, dto);
    return { data };
  }

  @Delete('subjects/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de la matière' })
  async deleteSubject(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteSubject(tenant, id);
    return { data };
  }

  @Post('subjects/:id/teachers')
  @ApiParam({ name: 'id', description: 'Identifiant de la matière' })
  @ApiBody({ type: AssignSubjectTeachersDto })
  async assignSubjectTeachers(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: AssignSubjectTeachersDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.assignSubjectTeachers(tenant, id, dto);
    return { data };
  }

  @Get('time-slots')
  @ApiOperation({ summary: 'Lister les créneaux horaires' })
  async listTimeSlots(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.academicService.listTimeSlots(tenant);
    return { data };
  }

  @Post('time-slots')
  @ApiBody({ type: CreateTimeSlotDto })
  async createTimeSlot(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateTimeSlotDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createTimeSlot(tenant, dto);
    return { data };
  }

  @Patch('time-slots/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du créneau' })
  @ApiBody({ type: UpdateTimeSlotDto })
  async updateTimeSlot(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateTimeSlotDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateTimeSlot(tenant, id, dto);
    return { data };
  }

  @Delete('time-slots/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du créneau' })
  async deleteTimeSlot(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteTimeSlot(tenant, id);
    return { data };
  }

  @Get('timetables/options')
  @ApiOperation({ summary: 'Options utiles à la création d un emploi du temps' })
  async listTimetableOptions(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.academicService.listTimetableOptions(tenant);
    return { data };
  }

  @Get('timetables')
  @ApiOperation({ summary: 'Lister les emplois du temps' })
  @ApiQuery({ name: 'academicYearId', required: false, description: 'Filtrer les emplois du temps par année' })
  @ApiQuery({ name: 'semesterId', required: false, description: 'Filtrer les emplois du temps par semestre' })
  @ApiQuery({ name: 'classId', required: false, description: 'Filtrer les emplois du temps par classe' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'draft'],
    description: 'Filtrer par statut',
  })
  async listTimetables(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListTimetablesQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.listTimetables(tenant, query);
    return { data };
  }

  @Get('timetables/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  async getTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.getTimetable(tenant, id);
    return { data };
  }

  @Post('timetables')
  @ApiBody({ type: CreateTimetableDto })
  async createTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateTimetableDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createTimetable(tenant, dto);
    return { data };
  }

  @Patch('timetables/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  @ApiBody({ type: UpdateTimetableDto })
  async updateTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateTimetableDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateTimetable(tenant, id, dto);
    return { data };
  }

  @Delete('timetables/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  async deleteTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteTimetable(tenant, id);
    return { data };
  }

  @Post('timetables/:id/duplicate')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps source' })
  @ApiBody({ type: DuplicateTimetableDto })
  async duplicateTimetable(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: DuplicateTimetableDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.duplicateTimetable(tenant, id, dto);
    return { data };
  }

  @Post('timetables/:id/entries')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  @ApiBody({ type: CreateTimetableEntryDto })
  async createTimetableEntry(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: CreateTimetableEntryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.createTimetableEntry(tenant, id, dto);
    return { data };
  }

  @Patch('timetables/:id/entries/:entryId')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  @ApiParam({ name: 'entryId', description: 'Identifiant du créneau de cours' })
  @ApiBody({ type: UpdateTimetableEntryDto })
  async updateTimetableEntry(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateTimetableEntryDto,
    @Req() req: Request,
  ) {
    const data = await this.academicService.updateTimetableEntry(tenant, id, entryId, dto);
    return { data };
  }

  @Delete('timetables/:id/entries/:entryId')
  @ApiParam({ name: 'id', description: 'Identifiant de l emploi du temps' })
  @ApiParam({ name: 'entryId', description: 'Identifiant du créneau de cours' })
  async deleteTimetableEntry(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Req() req: Request,
  ) {
    const data = await this.academicService.deleteTimetableEntry(tenant, id, entryId);
    return { data };
  }
}
