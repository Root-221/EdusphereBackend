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
  ApiOkResponse,
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
  CreateParentDto,
  CreateStaffDto,
  CreateStudentDto,
  CreateTeacherDto,
  ListStudentsQueryDto,
  UpdateParentDto,
  UpdateStaffDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('School Admin - Utilisateurs')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Slug',
  required: false,
  description: 'Résolution du tenant scolaire pour les utilisateurs.',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school-admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('teachers')
  @ApiOperation({ summary: 'Lister les enseignants' })
  @ApiOkResponse({ description: 'Liste des enseignants' })
  async listTeachers(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.usersService.listTeachers(tenant);
    return { data };
  }

  @Post('teachers')
  @ApiBody({ type: CreateTeacherDto })
  @ApiCreatedResponse({ description: 'Enseignant créé avec succès' })
  async createTeacher(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateTeacherDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.createTeacher(tenant, dto);
    return { data };
  }

  @Patch('teachers/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l enseignant' })
  @ApiBody({ type: UpdateTeacherDto })
  async updateTeacher(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.updateTeacher(tenant, id, dto);
    return { data };
  }

  @Delete('teachers/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l enseignant' })
  async deleteTeacher(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.usersService.deleteTeacher(tenant, id);
    return { data };
  }

  @Get('students')
  @ApiOperation({ summary: 'Lister les élèves' })
  @ApiOkResponse({ description: 'Liste des élèves' })
  async listStudents(
    @CurrentTenant() tenant: ITenant | null,
    @Query() query: ListStudentsQueryDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.listStudents(tenant, query);
    return { data };
  }

  @Get('students/:matricule')
  @ApiOperation({ summary: 'Trouver un élève par matricule' })
  @ApiParam({ name: 'matricule', description: 'Matricule de l élève' })
  @ApiOkResponse({ description: 'Élève trouvé' })
  async findStudentByMatricule(
    @CurrentTenant() tenant: ITenant | null,
    @Param('matricule') matricule: string,
    @Req() req: Request,
  ) {
    const data = await this.usersService.findStudentByMatricule(tenant, matricule);
    return { data };
  }

  @Post('students')
  @ApiBody({ type: CreateStudentDto })
  @ApiCreatedResponse({ description: 'Élève créé avec succès' })
  async createStudent(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateStudentDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.createStudent(tenant, dto);
    return { data };
  }

  @Patch('students/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l élève' })
  @ApiBody({ type: UpdateStudentDto })
  async updateStudent(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.updateStudent(tenant, id, dto);
    return { data };
  }

  @Delete('students/:id')
  @ApiParam({ name: 'id', description: 'Identifiant de l élève' })
  async deleteStudent(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.usersService.deleteStudent(tenant, id);
    return { data };
  }

  @Get('parents')
  @ApiOperation({ summary: 'Lister les parents' })
  @ApiOkResponse({ description: 'Liste des parents' })
  async listParents(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.usersService.listParents(tenant);
    return { data };
  }

  @Post('parents')
  @ApiBody({ type: CreateParentDto })
  @ApiCreatedResponse({ description: 'Parent créé avec succès' })
  async createParent(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateParentDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.createParent(tenant, dto);
    return { data };
  }

  @Patch('parents/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du parent' })
  @ApiBody({ type: UpdateParentDto })
  async updateParent(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateParentDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.updateParent(tenant, id, dto);
    return { data };
  }

  @Delete('parents/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du parent' })
  async deleteParent(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.usersService.deleteParent(tenant, id);
    return { data };
  }

  @Get('staff')
  @ApiOperation({ summary: 'Lister le personnel administratif' })
  @ApiOkResponse({ description: 'Liste du personnel administratif' })
  async listStaff(@CurrentTenant() tenant: ITenant | null, @Req() req: Request) {
    const data = await this.usersService.listStaff(tenant);
    return { data };
  }

  @Post('staff')
  @ApiBody({ type: CreateStaffDto })
  @ApiCreatedResponse({ description: 'Membre du personnel créé avec succès' })
  async createStaff(
    @CurrentTenant() tenant: ITenant | null,
    @Body() dto: CreateStaffDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.createStaff(tenant, dto);
    return { data };
  }

  @Patch('staff/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du membre du personnel' })
  @ApiBody({ type: UpdateStaffDto })
  async updateStaff(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: Request,
  ) {
    const data = await this.usersService.updateStaff(tenant, id, dto);
    return { data };
  }

  @Delete('staff/:id')
  @ApiParam({ name: 'id', description: 'Identifiant du membre du personnel' })
  async deleteStaff(
    @CurrentTenant() tenant: ITenant | null,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const data = await this.usersService.deleteStaff(tenant, id);
    return { data };
  }
}
