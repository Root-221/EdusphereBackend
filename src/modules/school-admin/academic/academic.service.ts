import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { refreshCompletedSemesterAverages } from '../shared/semester-average.util';
import {
  AcademicYearStatus,
  AcademicYearStatusValues,
  AssignClassSubjectsDto,
  AssignSubjectTeachersDto,
  ClassStatusValues,
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
  SemesterStatus,
  SemesterStatusValues,
  LevelStatusValues,
  SubjectStatusValues,
  TimetableStatusValues,
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

const DEFAULT_TIME_SLOTS = [
  { name: '1er créneau', startTime: '08:00', endTime: '09:00' },
  { name: '2ème créneau', startTime: '09:00', endTime: '10:00' },
  { name: '3ème créneau', startTime: '10:00', endTime: '11:00' },
  { name: '4ème créneau', startTime: '11:00', endTime: '12:00' },
  { name: '5ème créneau', startTime: '12:00', endTime: '13:00' },
  { name: '6ème créneau', startTime: '13:30', endTime: '14:30' },
  { name: '7ème créneau', startTime: '14:30', endTime: '15:30' },
  { name: '8ème créneau', startTime: '15:30', endTime: '16:30' },
  { name: '9ème créneau', startTime: '16:30', endTime: '17:30' },
  { name: '10ème créneau', startTime: '17:30', endTime: '18:30' },
];

@Injectable()
export class AcademicService {
  constructor(private readonly tenantDatabaseService: TenantDatabaseService) {}

  async listAcademicYears(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const years = await client.academicYear.findMany({
      where: { schoolId },
      include: {
        semesters: true,
        classes: { include: { students: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return years.map((year: any) => ({
      id: year.id,
      name: year.name,
      status: year.status,
      startDate: this.toDateOnly(year.startDate),
      endDate: this.toDateOnly(year.endDate),
      students: this.countYearStudents(year),
    }));
  }

  async createAcademicYear(tenant: ITenant | null, dto: CreateAcademicYearDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const created = await client.$transaction(async (tx: any) => {
      const year = await tx.academicYear.create({
        data: {
          schoolId,
          name: dto.name.trim(),
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: dto.status ?? AcademicYearStatusValues.draft,
        },
      });

      if (year.status === AcademicYearStatusValues.active) {
        await this.applyAcademicYearStatusSideEffects(tx, schoolId, year.id, AcademicYearStatusValues.active);
      }

      await refreshCompletedSemesterAverages(tx, schoolId);

      return year;
    });

    return {
      id: created.id,
      name: created.name,
      status: created.status,
      startDate: this.toDateOnly(created.startDate),
      endDate: this.toDateOnly(created.endDate),
      students: 0,
    };
  }

  async updateAcademicYear(
    tenant: ITenant | null,
    id: string,
    dto: UpdateAcademicYearDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.requireAcademicYear(client, schoolId, id);

    const updated = await client.$transaction(async (tx: any) => {
      const year = await tx.academicYear.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
          ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.status !== undefined) {
        await this.applyAcademicYearStatusSideEffects(tx, schoolId, year.id, dto.status);
      }

      await refreshCompletedSemesterAverages(tx, schoolId);

      return year;
    });

    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      startDate: this.toDateOnly(updated.startDate),
      endDate: this.toDateOnly(updated.endDate),
      students: await this.countStudentsForYear(client, schoolId, updated.id),
    };
  }

  async deleteAcademicYear(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireAcademicYear(client, schoolId, id);
    const linkedEnrollments = await client.enrollment.count({
      where: { schoolId, academicYearId: id },
    });

    if (linkedEnrollments > 0) {
      throw new BadRequestException('Impossible de supprimer une année scolaire utilisée par des inscriptions.');
    }

    await client.academicYear.delete({ where: { id } });

    return {
      id: existing.id,
      name: existing.name,
      status: existing.status,
      startDate: this.toDateOnly(existing.startDate),
      endDate: this.toDateOnly(existing.endDate),
      students: await this.countStudentsForYear(client, schoolId, existing.id),
    };
  }

  async listLevels(tenant: ITenant | null, query: ListLevelsQueryDto = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const levels = await client.level.findMany({
      where: {
        schoolId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        _count: {
          select: { classes: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });

    return levels.map((level: any) => this.mapLevel(level));
  }

  async createLevel(tenant: ITenant | null, dto: CreateLevelDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Le nom du niveau est obligatoire.');
    }

    const existingLevel = await client.level.findFirst({
      where: {
        schoolId,
        name,
      },
    });

    if (existingLevel) {
      throw new ConflictException('Un niveau avec ce nom existe déjà.');
    }

    const created = await client.level.create({
      data: {
        schoolId,
        name,
        sortOrder: dto.sortOrder ?? 0,
        description: dto.description?.trim() || null,
        status: dto.status ?? LevelStatusValues.active,
      },
      include: {
        _count: {
          select: { classes: true },
        },
      },
    });

    return this.mapLevel(created);
  }

  async updateLevel(tenant: ITenant | null, id: string, dto: UpdateLevelDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.requireLevel(client, schoolId, id);
    const nextName = dto.name?.trim();

    if (dto.name !== undefined && !nextName) {
      throw new BadRequestException('Le nom du niveau est obligatoire.');
    }

    if (nextName) {
      const duplicateLevel = await client.level.findFirst({
        where: {
          schoolId,
          name: nextName,
          id: { not: id },
        },
      });

      if (duplicateLevel) {
        throw new ConflictException('Un niveau avec ce nom existe déjà.');
      }
    }

    const normalizedName = nextName as string;

    const updated = await client.level.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: normalizedName } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        _count: {
          select: { classes: true },
        },
      },
    });

    return this.mapLevel(updated);
  }

  async deleteLevel(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireLevel(client, schoolId, id);
    const linkedClasses = await client.schoolClass.count({
      where: { schoolId, levelId: id },
    });

    if (linkedClasses > 0) {
      throw new BadRequestException('Impossible de supprimer un niveau utilisé par des classes.');
    }

    await client.level.delete({ where: { id } });

    return this.mapLevel(existing);
  }

  async updateAcademicYearStatus(
    tenant: ITenant | null,
    id: string,
    dto: UpdateAcademicYearStatusDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.requireAcademicYear(client, schoolId, id);

    const updated = await client.$transaction(async (tx: any) => {
      const year = await tx.academicYear.update({
        where: { id },
        data: { status: dto.status },
      });

      await this.applyAcademicYearStatusSideEffects(tx, schoolId, year.id, dto.status);
      await refreshCompletedSemesterAverages(tx, schoolId);

      return year;
    });

    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      startDate: this.toDateOnly(updated.startDate),
      endDate: this.toDateOnly(updated.endDate),
      students: await this.countStudentsForYear(client, schoolId, updated.id),
    };
  }

  async listSemesters(tenant: ITenant | null, query: ListSemestersQueryDto = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId = query.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));
    const semesters = await client.semester.findMany({
      where: {
        schoolId,
        ...(academicYearId ? { academicYearId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { academicYear: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    return semesters.map((semester: any) => ({
      id: semester.id,
      name: semester.name,
      academicYearId: semester.academicYearId,
      academicYear: semester.academicYear?.name ?? '',
      startDate: this.toDateOnly(semester.startDate),
      endDate: this.toDateOnly(semester.endDate),
      status: semester.status,
      average: semester.average ?? null,
    }));
  }

  async createSemester(tenant: ITenant | null, dto: CreateSemesterDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId =
      dto.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));

    if (!academicYearId) {
      throw new BadRequestException('Aucune année scolaire active n’est disponible.');
    }

    await this.requireAcademicYear(client, schoolId, academicYearId);

    const created = await client.$transaction(async (tx: any) => {
      await this.ensureSemesterCapacity(tx, schoolId, academicYearId);

      const semester = await tx.semester.create({
        data: {
          schoolId,
          academicYearId,
          name: dto.name.trim(),
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: dto.status ?? SemesterStatusValues.active,
          average: null,
        },
        include: { academicYear: true },
      });

      if (semester.status === SemesterStatusValues.active) {
        await this.applySemesterActivationSideEffects(tx, schoolId, semester.id, semester.academicYearId);
      }

      await refreshCompletedSemesterAverages(tx, schoolId);

      const refreshed = await tx.semester.findUnique({
        where: { id: semester.id },
        include: { academicYear: true },
      });

      return refreshed ?? semester;
    });

    return {
      id: created.id,
      name: created.name,
      academicYearId: created.academicYearId,
      academicYear: created.academicYear?.name ?? '',
      startDate: this.toDateOnly(created.startDate),
      endDate: this.toDateOnly(created.endDate),
      status: created.status,
      average: created.average ?? null,
    };
  }

  async updateSemester(tenant: ITenant | null, id: string, dto: UpdateSemesterDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireSemester(client, schoolId, id);

    if (dto.academicYearId !== undefined) {
      await this.requireAcademicYear(client, schoolId, dto.academicYearId);
    }

    const updated = await client.$transaction(async (tx: any) => {
      if (dto.academicYearId !== undefined && dto.academicYearId !== existing.academicYearId) {
        await this.ensureSemesterCapacity(tx, schoolId, dto.academicYearId, id);
      }

      const semester = await tx.semester.update({
        where: { id },
        data: {
          ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
          ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: { academicYear: true },
      });

      if (semester.status === SemesterStatusValues.active) {
        await this.applySemesterActivationSideEffects(tx, schoolId, semester.id, semester.academicYearId);
      }

      await refreshCompletedSemesterAverages(tx, schoolId);

      const refreshed = await tx.semester.findUnique({
        where: { id: semester.id },
        include: { academicYear: true },
      });

      return refreshed ?? semester;
    });

    return {
      id: updated.id,
      name: updated.name,
      academicYearId: updated.academicYearId,
      academicYear: updated.academicYear?.name ?? existing.academicYear?.name ?? '',
      startDate: this.toDateOnly(updated.startDate),
      endDate: this.toDateOnly(updated.endDate),
      status: updated.status,
      average: updated.average ?? null,
    };
  }

  async deleteSemester(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireSemester(client, schoolId, id);
    const linkedEnrollments = await client.enrollment.count({
      where: { schoolId, semesterId: id },
    });

    if (linkedEnrollments > 0) {
      throw new BadRequestException('Impossible de supprimer un semestre utilisé par des inscriptions.');
    }

    await client.semester.delete({ where: { id } });

    return {
      id: existing.id,
      name: existing.name,
      academicYearId: existing.academicYearId,
      academicYear: existing.academicYear?.name ?? '',
      startDate: this.toDateOnly(existing.startDate),
      endDate: this.toDateOnly(existing.endDate),
      status: existing.status,
      average: existing.average ?? null,
    };
  }

  async updateSemesterStatus(
    tenant: ITenant | null,
    id: string,
    dto: UpdateSemesterStatusDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const semester = await this.requireSemester(client, schoolId, id);

    const updated = await client.$transaction(async (tx: any) => {
      const currentSemester = await tx.semester.update({
        where: { id },
        data: { status: dto.status },
        include: { academicYear: true },
      });

      if (currentSemester.status === SemesterStatusValues.active) {
        await this.applySemesterActivationSideEffects(
          tx,
          schoolId,
          currentSemester.id,
          currentSemester.academicYearId,
        );
      }

      await refreshCompletedSemesterAverages(tx, schoolId);

      const refreshed = await tx.semester.findUnique({
        where: { id: currentSemester.id },
        include: { academicYear: true },
      });

      return refreshed ?? currentSemester;
    });

    return {
      id: updated.id,
      name: updated.name,
      academicYearId: updated.academicYearId,
      academicYear: updated.academicYear?.name ?? semester.academicYear?.name ?? '',
      startDate: this.toDateOnly(updated.startDate),
      endDate: this.toDateOnly(updated.endDate),
      status: updated.status,
      average: updated.average ?? null,
    };
  }

  async listClasses(tenant: ITenant | null, query: ListClassesQueryDto = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId = query.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));
    const levelId = query.levelId ?? query.level;
    const classes = await client.schoolClass.findMany({
      where: {
        schoolId,
        ...(academicYearId ? { academicYearId } : {}),
        ...(levelId ? { levelId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        ...this.classInclude(),
        headTeacher: { select: { id: true, firstName: true, lastName: true } },
        students: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return classes.map((schoolClass: any) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      capacity: schoolClass.capacity,
      levelId: schoolClass.levelId ?? '',
      level: this.mapLevel(schoolClass.level),
      teacherId: schoolClass.headTeacherId ?? '',
      teacher: schoolClass.headTeacher
        ? `${schoolClass.headTeacher.firstName} ${schoolClass.headTeacher.lastName}`.trim()
        : '',
      students: schoolClass.students?.length ?? 0,
      subjects: (schoolClass.subjectLinks ?? []).map((link: any) => link.subject?.name).filter(Boolean),
      status: schoolClass.status,
      academicYearId: schoolClass.academicYearId ?? '',
      academicYear: schoolClass.academicYear?.name ?? '',
    }));
  }

  async createClass(tenant: ITenant | null, dto: CreateClassDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId = dto.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));

    if (!academicYearId) {
      throw new BadRequestException('Aucune année scolaire active n’est disponible.');
    }

    await this.requireAcademicYear(client, schoolId, academicYearId);
    const level = await this.requireLevel(client, schoolId, dto.levelId);

    if (dto.teacherId) {
      await this.requireTeacher(client, schoolId, dto.teacherId);
    }

    const created = await client.schoolClass.create({
      data: {
        schoolId,
        academicYearId,
        levelId: level.id,
        name: dto.name.trim(),
        capacity: dto.capacity ?? 40,
        status: dto.status ?? ClassStatusValues.active,
        headTeacherId: dto.teacherId ?? null,
      },
      include: this.classInclude(),
    });

    return this.mapClass(created);
  }

  async updateClass(tenant: ITenant | null, id: string, dto: UpdateClassDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireClass(client, schoolId, id);

    if (dto.teacherId !== undefined) {
      if (dto.teacherId) {
        await this.requireTeacher(client, schoolId, dto.teacherId);
      }
    }

    if (dto.academicYearId !== undefined && dto.academicYearId) {
      await this.requireAcademicYear(client, schoolId, dto.academicYearId);
    }

    if (dto.levelId !== undefined) {
      await this.requireLevel(client, schoolId, dto.levelId);
    }

    const updated = await client.schoolClass.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.teacherId !== undefined ? { headTeacherId: dto.teacherId || null } : {}),
        ...(dto.academicYearId !== undefined ? { academicYearId: dto.academicYearId || null } : {}),
        ...(dto.levelId !== undefined ? { levelId: dto.levelId || null } : {}),
      },
      include: this.classInclude(),
    });

    return this.mapClass(updated, existing);
  }

  async deleteClass(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireClass(client, schoolId, id);
    const linkedEnrollments = await client.enrollment.count({
      where: { schoolId, classId: id },
    });

    if (linkedEnrollments > 0) {
      throw new BadRequestException('Impossible de supprimer une classe utilisée par des inscriptions.');
    }

    await client.schoolClass.delete({ where: { id } });

    return this.mapClass(existing);
  }

  async assignClassSubjects(
    tenant: ITenant | null,
    id: string,
    dto: AssignClassSubjectsDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const schoolClass = await this.requireClass(client, schoolId, id);
    await Promise.all(dto.subjectIds.map((subjectId) => this.requireSubject(client, schoolId, subjectId)));

    await client.classSubject.deleteMany({ where: { schoolId, classId: id } });

    if (dto.subjectIds.length > 0) {
      await client.classSubject.createMany({
        data: dto.subjectIds.map((subjectId) => ({
          schoolId,
          classId: id,
          subjectId,
        })),
        skipDuplicates: true,
      });
    }

    const updated = await client.schoolClass.findUnique({
      where: { id },
      include: this.classInclude(),
    });

    return this.mapClass(updated ?? schoolClass);
  }

  async listSubjects(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const subjects = await client.subject.findMany({
      where: { schoolId },
      include: {
        teacherLinks: {
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return subjects.map((subject: any) => this.mapSubject(subject));
  }

  async createSubject(tenant: ITenant | null, dto: CreateSubjectDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const created = await client.subject.create({
      data: {
        schoolId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        coefficient: dto.coefficient ?? 1,
        hoursPerWeek: dto.hours ?? 1,
        status: dto.status ?? SubjectStatusValues.active,
        description: dto.description?.trim() || null,
      },
      include: {
        teacherLinks: {
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
      },
    });

    return this.mapSubject(created);
  }

  async updateSubject(tenant: ITenant | null, id: string, dto: UpdateSubjectDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireSubject(client, schoolId, id);

    const updated = await client.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.coefficient !== undefined ? { coefficient: dto.coefficient } : {}),
        ...(dto.hours !== undefined ? { hoursPerWeek: dto.hours } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
      include: {
        teacherLinks: {
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
      },
    });

    return this.mapSubject(updated, existing);
  }

  async deleteSubject(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireSubject(client, schoolId, id);

    await client.subject.delete({ where: { id } });

    return this.mapSubject(existing);
  }

  async assignSubjectTeachers(
    tenant: ITenant | null,
    id: string,
    dto: AssignSubjectTeachersDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const subject = await this.requireSubject(client, schoolId, id);
    await Promise.all(dto.teacherIds.map((teacherId) => this.requireTeacher(client, schoolId, teacherId)));

    await client.teacherSubject.deleteMany({ where: { schoolId, subjectId: id } });

    if (dto.teacherIds.length > 0) {
      await client.teacherSubject.createMany({
        data: dto.teacherIds.map((teacherId) => ({
          schoolId,
          teacherId,
          subjectId: id,
        })),
        skipDuplicates: true,
      });
    }

    const updated = await client.subject.findUnique({
      where: { id },
      include: {
        teacherLinks: {
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
      },
    });

    return this.mapSubject(updated ?? subject);
  }

  async listTimeSlots(tenant: ITenant | null): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.ensureDefaultTimeSlots(client, schoolId);

    const slots = await client.timeSlot.findMany({
      where: { schoolId },
      orderBy: { startTime: 'asc' },
    });

    return slots.map((slot: any) => ({
      id: slot.id,
      name: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  async createTimeSlot(tenant: ITenant | null, dto: CreateTimeSlotDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const created = await client.timeSlot.create({
      data: {
        schoolId,
        name: dto.name.trim(),
        startTime: dto.startTime.trim(),
        endTime: dto.endTime.trim(),
      },
    });

    return {
      id: created.id,
      name: created.name,
      startTime: created.startTime,
      endTime: created.endTime,
    };
  }

  async updateTimeSlot(tenant: ITenant | null, id: string, dto: UpdateTimeSlotDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.requireTimeSlot(client, schoolId, id);

    const updated = await client.timeSlot.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime.trim() } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime.trim() } : {}),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      startTime: updated.startTime,
      endTime: updated.endTime,
    };
  }

  async deleteTimeSlot(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireTimeSlot(client, schoolId, id);

    await client.timeSlot.delete({ where: { id } });

    return {
      id: existing.id,
      name: existing.name,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };
  }

  async listTimetables(tenant: ITenant | null, query: ListTimetablesQueryDto = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId =
      query.academicYearId ??
      (query.semesterId
        ? (await this.requireSemester(client, schoolId, query.semesterId)).academicYearId
        : await this.getDefaultAcademicYearId(client, schoolId));
    const semesterId =
      query.semesterId ?? (await this.getDefaultSemesterId(client, schoolId, academicYearId ?? undefined));
    const timetables = await client.timetable.findMany({
      where: {
        schoolId,
        ...(academicYearId ? { academicYearId } : {}),
        ...(semesterId ? { semesterId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        academicYear: true,
        semester: { include: { academicYear: true } },
        class: {
          include: this.classInclude(),
        },
        entries: {
          include: {
            timeSlot: true,
            subject: true,
            teacher: {
              include: {
                teacherProfile: {
                  include: { primarySubject: true },
                },
              },
            },
            class: {
              include: this.classInclude(),
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return timetables.map((timetable: any) => this.mapTimetable(timetable));
  }

  async getTimetable(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const timetable = await client.timetable.findFirst({
      where: { id, schoolId },
      include: {
        academicYear: true,
        semester: { include: { academicYear: true } },
        class: {
          include: this.classInclude(),
        },
        entries: {
          include: {
            timeSlot: true,
            subject: true,
            teacher: {
              include: {
                teacherProfile: {
                  include: { primarySubject: true },
                },
              },
            },
            class: {
              include: this.classInclude(),
            },
          },
        },
      },
    });

    if (!timetable) {
      throw new NotFoundException('Emploi du temps introuvable');
    }

    return this.mapTimetable(timetable);
  }

  async listTimetableOptions(tenant: ITenant | null): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.ensureDefaultTimeSlots(client, schoolId);
    const currentAcademicYearId = await this.getDefaultAcademicYearId(client, schoolId);
    const currentSemesterId = await this.getDefaultSemesterId(client, schoolId, currentAcademicYearId ?? undefined);

    const [academicYears, semesters, classes, subjects, teachers, timeSlots] = await Promise.all([
      client.academicYear.findMany({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
      }),
      client.semester.findMany({
        where: { schoolId },
        include: { academicYear: true },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      }),
      client.schoolClass.findMany({
        where: { schoolId },
        include: this.classInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      client.subject.findMany({
        where: { schoolId },
        include: {
          teacherLinks: {
            include: {
              teacher: {
                include: { user: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      client.user.findMany({
        where: { role: 'TEACHER' },
        include: {
          teacherProfile: {
            include: {
              primarySubject: true,
              subjectLinks: { include: { subject: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      client.timeSlot.findMany({
        where: { schoolId },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    return {
      currentAcademicYearId,
      currentSemesterId,
      academicYears: academicYears.map((year: any) => ({
        id: year.id,
        name: year.name,
        status: year.status,
      })),
      semesters: semesters.map((semester: any) => ({
        id: semester.id,
        name: semester.name,
        academicYearId: semester.academicYearId,
        academicYear: semester.academicYear?.name ?? '',
        status: semester.status,
      })),
      classes: classes.map((schoolClass: any) => this.mapClass(schoolClass)),
      subjects: subjects.map((subject: any) => this.mapSubject(subject)),
      teachers: teachers.map((teacher: any) => this.mapTeacher(teacher)),
      timeSlots: timeSlots.map((slot: any) => ({
        id: slot.id,
        name: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    };
  }

  async createTimetable(tenant: ITenant | null, dto: CreateTimetableDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const defaultAcademicYearId = await this.getDefaultAcademicYearId(client, schoolId);
    const semesterId =
      dto.semesterId ??
      (await this.getDefaultSemesterId(
        client,
        schoolId,
        dto.academicYearId ?? defaultAcademicYearId ?? undefined,
      ));

    if (!semesterId) {
      throw new BadRequestException('Aucun semestre en cours disponible pour créer cet emploi du temps.');
    }

    const semester = await this.requireSemester(client, schoolId, semesterId);
    const schoolClass = await this.requireClass(client, schoolId, dto.classId);
    const academicYearId = dto.academicYearId ?? semester.academicYearId;

    await this.requireAcademicYear(client, schoolId, academicYearId);

    if (!schoolClass.levelId) {
      throw new BadRequestException('La classe sélectionnée doit être rattachée à un niveau.');
    }

    if (semester.academicYearId !== academicYearId) {
      throw new BadRequestException('Le semestre doit appartenir à la même année scolaire.');
    }

    if (schoolClass.academicYearId && schoolClass.academicYearId !== academicYearId) {
      throw new BadRequestException('La classe doit appartenir à la même année scolaire.');
    }

    await this.ensureUniqueTimetable(client, schoolId, semester.id, schoolClass.id);

    const created = await client.timetable.create({
      data: {
        schoolId,
        academicYearId,
        semesterId: semester.id,
        classId: schoolClass.id,
        status: dto.status ?? TimetableStatusValues.active,
      },
      include: {
        academicYear: true,
        semester: { include: { academicYear: true } },
        class: {
          include: this.classInclude(),
        },
        entries: {
          include: {
            timeSlot: true,
            subject: true,
            teacher: {
              include: {
                teacherProfile: {
                  include: { primarySubject: true },
                },
              },
            },
            class: {
              include: this.classInclude(),
            },
          },
        },
      },
    });

    return this.mapTimetable(created);
  }

  async updateTimetable(tenant: ITenant | null, id: string, dto: UpdateTimetableDto): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireTimetable(client, schoolId, id);

    const academicYearId = dto.academicYearId ?? existing.academicYearId;
    const semester =
      dto.semesterId !== undefined
        ? await this.requireSemester(client, schoolId, dto.semesterId)
        : existing.semester;
      const schoolClass =
      dto.classId !== undefined
        ? await this.requireClass(client, schoolId, dto.classId)
        : existing.class;

    if (dto.academicYearId !== undefined || dto.semesterId !== undefined || dto.classId !== undefined) {
      await this.requireAcademicYear(client, schoolId, academicYearId);

      if (semester.academicYearId !== academicYearId) {
        throw new BadRequestException('Le semestre doit appartenir à la même année scolaire.');
      }

      if (schoolClass.academicYearId && schoolClass.academicYearId !== academicYearId) {
        throw new BadRequestException('La classe doit appartenir à la même année scolaire.');
      }

      if (!schoolClass.levelId) {
        throw new BadRequestException('La classe sélectionnée doit être rattachée à un niveau.');
      }

      await this.ensureUniqueTimetable(client, schoolId, semester.id, schoolClass.id, id);
    }

    const updated = await client.timetable.update({
      where: { id },
      data: {
        ...(dto.academicYearId !== undefined ? { academicYearId } : {}),
        ...(dto.semesterId !== undefined ? { semesterId: semester.id } : {}),
        ...(dto.classId !== undefined ? { classId: schoolClass.id } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        academicYear: true,
        semester: { include: { academicYear: true } },
        class: {
          include: this.classInclude(),
        },
        entries: {
          include: {
            timeSlot: true,
            subject: true,
            teacher: {
              include: {
                teacherProfile: {
                  include: { primarySubject: true },
                },
              },
            },
            class: {
              include: this.classInclude(),
            },
          },
        },
      },
    });

    return this.mapTimetable(updated);
  }

  async deleteTimetable(tenant: ITenant | null, id: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const existing = await this.requireTimetable(client, schoolId, id);

    await client.timetable.delete({ where: { id } });

    return this.mapTimetable(existing);
  }

  async duplicateTimetable(
    tenant: ITenant | null,
    id: string,
    dto: DuplicateTimetableDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const source = await this.requireTimetable(client, schoolId, id);
    const targetSemester = await this.requireSemester(client, schoolId, dto.targetSemesterId);
    if (source.class.academicYearId && source.class.academicYearId !== targetSemester.academicYearId) {
      throw new BadRequestException('La classe source doit appartenir à la même année scolaire que le semestre cible.');
    }
    await this.ensureUniqueTimetable(client, schoolId, targetSemester.id, source.classId);

    const created = await client.$transaction(async (tx: any) => {
      const timetable = await tx.timetable.create({
        data: {
          schoolId,
          academicYearId: targetSemester.academicYearId,
          semesterId: targetSemester.id,
          classId: source.classId,
          status: TimetableStatusValues.active,
        },
        include: {
          academicYear: true,
          semester: { include: { academicYear: true } },
          class: {
            include: this.classInclude(),
          },
          entries: true,
        },
      });

      if (source.entries.length > 0) {
        await tx.timetableEntry.createMany({
          data: source.entries.map((entry: any) => ({
            schoolId,
            timetableId: timetable.id,
            day: entry.day,
            timeSlotId: entry.timeSlotId,
            subjectId: entry.subjectId,
            teacherId: entry.teacherId,
            classId: entry.classId,
            room: entry.room ?? null,
          })),
        });
      }

      return tx.timetable.findUnique({
        where: { id: timetable.id },
        include: {
          academicYear: true,
          semester: { include: { academicYear: true } },
          class: {
            include: this.classInclude(),
          },
          entries: {
            include: {
              timeSlot: true,
              subject: true,
              teacher: {
                include: {
                  teacherProfile: {
                    include: { primarySubject: true },
                  },
                },
              },
              class: {
                include: this.classInclude(),
              },
            },
          },
        },
      });
    });

    return this.mapTimetable(created);
  }

  async createTimetableEntry(
    tenant: ITenant | null,
    timetableId: string,
    dto: CreateTimetableEntryDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const timetable = await this.requireTimetable(client, schoolId, timetableId);
    const classId = dto.classId ?? timetable.classId;

    await this.requireTimeSlot(client, schoolId, dto.timeSlotId);
    await this.requireSubject(client, schoolId, dto.subjectId);
    await this.requireTeacher(client, schoolId, dto.teacherId);
    const schoolClass = await this.requireClass(client, schoolId, classId);
    if (!schoolClass.levelId) {
      throw new BadRequestException('La classe sélectionnée doit être rattachée à un niveau.');
    }
    const room = this.normalizeRoomLabel(dto.room);
    await this.assertNoTimetableConflict(
      client,
      schoolId,
      timetable.id,
      dto.day,
      dto.timeSlotId,
      dto.teacherId,
      classId,
      room,
    );

    const created = await client.timetableEntry.create({
      data: {
        schoolId,
        timetableId,
        day: dto.day.trim(),
        timeSlotId: dto.timeSlotId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId,
        classId,
        room,
      },
      include: {
        timeSlot: true,
        subject: true,
        teacher: {
          include: {
            teacherProfile: {
              include: { primarySubject: true },
            },
          },
        },
        class: {
          include: this.classInclude(),
        },
      },
    });

    return this.mapTimetableEntry(created);
  }

  async updateTimetableEntry(
    tenant: ITenant | null,
    timetableId: string,
    entryId: string,
    dto: UpdateTimetableEntryDto,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const timetable = await this.requireTimetable(client, schoolId, timetableId);
    const existing = await this.requireTimetableEntry(client, schoolId, entryId, timetable.id);

    const classId = dto.classId ?? existing.classId;
    const day = dto.day ?? existing.day;
    const timeSlotId = dto.timeSlotId ?? existing.timeSlotId;
    const teacherId = dto.teacherId ?? existing.teacherId;
    const subjectId = dto.subjectId ?? existing.subjectId;

    if (dto.timeSlotId !== undefined) {
      await this.requireTimeSlot(client, schoolId, dto.timeSlotId);
    }
    if (dto.subjectId !== undefined) {
      await this.requireSubject(client, schoolId, dto.subjectId);
    }
    if (dto.teacherId !== undefined) {
      await this.requireTeacher(client, schoolId, dto.teacherId);
    }
    if (dto.classId !== undefined) {
      const classToValidate = await this.requireClass(client, schoolId, dto.classId);
      if (!classToValidate.levelId) {
        throw new BadRequestException('La classe sélectionnée doit être rattachée à un niveau.');
      }
    }

    const room = dto.room !== undefined ? this.normalizeRoomLabel(dto.room) : this.normalizeRoomLabel(existing.room);

    await this.assertNoTimetableConflict(
      client,
      schoolId,
      timetable.id,
      day,
      timeSlotId,
      teacherId,
      classId,
      room,
      existing.id,
    );

    const updated = await client.timetableEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.day !== undefined ? { day: dto.day.trim() } : {}),
        ...(dto.timeSlotId !== undefined ? { timeSlotId: dto.timeSlotId } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.room !== undefined ? { room } : {}),
      },
      include: {
        timeSlot: true,
        subject: true,
        teacher: {
          include: {
            teacherProfile: {
              include: { primarySubject: true },
            },
          },
        },
        class: {
          include: this.classInclude(),
        },
      },
    });

    return this.mapTimetableEntry(updated);
  }

  async deleteTimetableEntry(
    tenant: ITenant | null,
    timetableId: string,
    entryId: string,
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    await this.requireTimetableEntry(client, schoolId, entryId, timetableId);

    const deleted = await client.timetableEntry.delete({ where: { id: entryId } });
    return {
      id: deleted.id,
      timetableId: deleted.timetableId,
    };
  }

  private async getClient(tenant: ITenant | null): Promise<any> {
    const resolvedTenant = this.requireTenant(tenant);
    return this.tenantDatabaseService.getClientForTenant(resolvedTenant);
  }

  private requireTenant(tenant: ITenant | null): ITenant {
    if (!tenant) {
      throw new BadRequestException('Le tenant de l’école est requis pour accéder à ce module.');
    }
    return tenant;
  }

  private classInclude(): any {
    return {
      level: true,
      headTeacher: true,
      students: true,
      subjectLinks: { include: { subject: true } },
      academicYear: true,
    };
  }

  private async requireAcademicYear(client: any, schoolId: string, id: string): Promise<any> {
    const year = await client.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) {
      throw new NotFoundException('Année scolaire introuvable');
    }
    return year;
  }

  private async requireSemester(client: any, schoolId: string, id: string): Promise<any> {
    const semester = await client.semester.findFirst({
      where: { id, schoolId },
      include: { academicYear: true },
    });
    if (!semester) {
      throw new NotFoundException('Semestre introuvable');
    }
    return semester;
  }

  private async ensureSemesterCapacity(
    client: any,
    schoolId: string,
    academicYearId: string,
    excludeSemesterId?: string,
  ): Promise<void> {
    const semesterCount = await client.semester.count({
      where: {
        schoolId,
        academicYearId,
        ...(excludeSemesterId ? { id: { not: excludeSemesterId } } : {}),
      },
    });

    if (semesterCount >= 2) {
      throw new BadRequestException('Une année scolaire ne peut contenir que deux semestres.');
    }
  }

  private async requireLevel(client: any, schoolId: string, id: string): Promise<any> {
    const level = await client.level.findFirst({
      where: { id, schoolId },
      include: {
        _count: {
          select: { classes: true },
        },
      },
    });
    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }
    return level;
  }

  private async requireClass(client: any, schoolId: string, id: string): Promise<any> {
    const schoolClass = await client.schoolClass.findFirst({
      where: { id, schoolId },
      include: this.classInclude(),
    });
    if (!schoolClass) {
      throw new NotFoundException('Classe introuvable');
    }
    return schoolClass;
  }

  private async requireSubject(client: any, schoolId: string, id: string): Promise<any> {
    const subject = await client.subject.findFirst({
      where: { id, schoolId },
      include: {
        teacherLinks: {
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
      },
    });
    if (!subject) {
      throw new NotFoundException('Matière introuvable');
    }
    return subject;
  }

  private async requireTimeSlot(client: any, schoolId: string, id: string): Promise<any> {
    const slot = await client.timeSlot.findFirst({ where: { id, schoolId } });
    if (!slot) {
      throw new NotFoundException('Créneau horaire introuvable');
    }
    return slot;
  }

  private async requireTeacher(client: any, schoolId: string, id: string): Promise<any> {
    const teacher = await client.user.findFirst({
      where: { id, role: 'TEACHER' },
      include: {
        teacherProfile: {
          include: {
            primarySubject: true,
            subjectLinks: { include: { subject: true } },
          },
        },
      },
    });
    if (!teacher) {
      throw new NotFoundException('Enseignant introuvable');
    }
    return teacher;
  }

  private async requireTimetable(client: any, schoolId: string, id: string): Promise<any> {
    const timetable = await client.timetable.findFirst({
      where: { id, schoolId },
      include: {
        academicYear: true,
        semester: { include: { academicYear: true } },
        class: {
          include: this.classInclude(),
        },
        entries: {
          include: {
            timeSlot: true,
            subject: true,
            teacher: {
              include: {
                teacherProfile: {
                  include: { primarySubject: true },
                },
              },
            },
            class: {
              include: this.classInclude(),
            },
          },
        },
      },
    });

    if (!timetable) {
      throw new NotFoundException('Emploi du temps introuvable');
    }

    return timetable;
  }

  private async requireTimetableEntry(
    client: any,
    schoolId: string,
    id: string,
    timetableId: string,
  ): Promise<any> {
    const entry = await client.timetableEntry.findFirst({
      where: { id, schoolId, timetableId },
      include: {
        timeSlot: true,
        subject: true,
        teacher: {
          include: {
            teacherProfile: {
              include: { primarySubject: true },
            },
          },
        },
        class: {
          include: this.classInclude(),
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Créneau de cours introuvable');
    }

    return entry;
  }

  private async ensureUniqueTimetable(
    client: any,
    schoolId: string,
    semesterId: string,
    classId: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await client.timetable.findFirst({
      where: {
        schoolId,
        semesterId,
        classId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Un emploi du temps existe déjà pour cette classe et ce semestre.');
    }
  }

  private async applyAcademicYearStatusSideEffects(
    client: any,
    schoolId: string,
    yearId: string,
    status: AcademicYearStatus,
  ): Promise<void> {
    if (status === AcademicYearStatusValues.active) {
      const activeSemesterInYear = await client.semester.findFirst({
        where: { schoolId, academicYearId: yearId, status: SemesterStatusValues.active },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });

      await client.academicYear.updateMany({
        where: { schoolId, id: { not: yearId }, status: AcademicYearStatusValues.active },
        data: { status: AcademicYearStatusValues.completed },
      });

      await client.semester.updateMany({
        where: activeSemesterInYear
          ? {
              schoolId,
              status: SemesterStatusValues.active,
              id: { not: activeSemesterInYear.id },
            }
          : {
              schoolId,
              status: SemesterStatusValues.active,
            },
        data: { status: SemesterStatusValues.completed },
      });
      return;
    }

    await client.semester.updateMany({
      where: {
        schoolId,
        academicYearId: yearId,
        status: SemesterStatusValues.active,
      },
      data: { status: SemesterStatusValues.completed },
    });
  }

  private async applySemesterActivationSideEffects(
    client: any,
    schoolId: string,
    semesterId: string,
    academicYearId: string,
  ): Promise<void> {
    await client.academicYear.updateMany({
      where: { schoolId, id: { not: academicYearId }, status: AcademicYearStatusValues.active },
      data: { status: AcademicYearStatusValues.completed },
    });

    await client.academicYear.update({
      where: { id: academicYearId },
      data: { status: AcademicYearStatusValues.active },
    });

    await client.semester.updateMany({
      where: {
        schoolId,
        status: SemesterStatusValues.active,
        id: { not: semesterId },
      },
      data: { status: SemesterStatusValues.completed },
    });
  }

  private async getDefaultSemesterId(
    client: any,
    schoolId: string,
    academicYearId?: string,
  ): Promise<string | null> {
    if (academicYearId) {
      const active = await client.semester.findFirst({
        where: { schoolId, academicYearId, status: SemesterStatusValues.active },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });
      if (active) {
        return active.id;
      }

      const currentYearSemester = await client.semester.findFirst({
        where: { schoolId, academicYearId },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });

      if (currentYearSemester) {
        return currentYearSemester.id;
      }
    }

    const active = await client.semester.findFirst({
      where: { schoolId, status: SemesterStatusValues.active },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (active) {
      return active.id;
    }

    const latest = await client.semester.findFirst({
      where: { schoolId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });

    return latest?.id ?? null;
  }

  private async assertNoTimetableConflict(
    client: any,
    schoolId: string,
    timetableId: string,
    day: string,
    timeSlotId: string,
    teacherId: string,
    classId: string,
    room?: string | null,
    excludeEntryId?: string,
  ): Promise<void> {
    const baseWhere = {
      schoolId,
      day,
      timeSlotId,
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    };

    const conflict = await client.timetableEntry.findFirst({
      where: {
        ...baseWhere,
        OR: [{ teacherId }, { classId }],
      },
      include: {
        timeSlot: true,
        teacher: { include: { teacherProfile: true } },
        class: {
          include: this.classInclude(),
        },
      },
    });

    if (!conflict) {
      const normalizedRoom = this.normalizeRoomLabel(room);
      if (!normalizedRoom) {
        return;
      }

      const roomConflict = await client.timetableEntry.findFirst({
        where: {
          ...baseWhere,
          room: { equals: normalizedRoom, mode: 'insensitive' },
        },
        include: {
          timeSlot: true,
        },
      });

      if (!roomConflict) {
        return;
      }

      throw new BadRequestException(
        `La salle ${roomConflict.room} est déjà occupée le ${roomConflict.day} de ${roomConflict.timeSlot.startTime} à ${roomConflict.timeSlot.endTime}.`,
      );
    }

    const conflictLabel =
      conflict.teacherId === teacherId
        ? `Le professeur est déjà affecté le ${conflict.day} de ${conflict.timeSlot.startTime} à ${conflict.timeSlot.endTime}.`
        : `La classe est déjà occupée le ${conflict.day} de ${conflict.timeSlot.startTime} à ${conflict.timeSlot.endTime}.`;
    throw new BadRequestException(conflictLabel);
  }

  private normalizeRoomLabel(room?: string | null): string | null {
    const normalized = room?.trim().replace(/\s+/g, ' ');
    return normalized ? normalized : null;
  }

  private async getDefaultAcademicYearId(client: any, schoolId: string): Promise<string | null> {
    const active = await client.academicYear.findFirst({
      where: { schoolId, status: AcademicYearStatusValues.active },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    if (active) {
      return active.id;
    }

    const first = await client.academicYear.findFirst({
      where: { schoolId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });

    return first?.id ?? null;
  }

  private async ensureDefaultTimeSlots(client: any, schoolId: string): Promise<void> {
    const existing = await client.timeSlot.count({ where: { schoolId } });
    if (existing > 0) {
      return;
    }

    await client.timeSlot.createMany({
      data: DEFAULT_TIME_SLOTS.map((slot) => ({
        schoolId,
        ...slot,
      })),
      skipDuplicates: true,
    });
  }

  private countYearStudents(year: any): number {
    if (!year?.classes?.length) {
      return 0;
    }

    return year.classes.reduce((sum: number, schoolClass: any) => sum + (schoolClass.students?.length ?? 0), 0);
  }

  private mapLevel(level: any, fallback?: any): any {
    const current = level ?? fallback;
    if (!current) {
      return null;
    }

    return {
      id: current.id,
      name: current.name,
      description: current.description ?? '',
      sortOrder: current.sortOrder ?? 0,
      status: current.status,
      classes: current._count?.classes ?? fallback?._count?.classes ?? 0,
    };
  }

  private async countStudentsForYear(client: any, schoolId: string, yearId: string): Promise<number> {
    return client.studentProfile.count({
      where: {
        schoolId,
        OR: [
          { academicYearId: yearId },
          { class: { academicYearId: yearId } },
        ],
      },
    });
  }

  private mapClass(schoolClass: any, fallback?: any): any {
    const subjectLinks = schoolClass?.subjectLinks ?? fallback?.subjectLinks ?? [];
    const students = schoolClass?.students ?? fallback?.students ?? [];
    const headTeacher = schoolClass?.headTeacher ?? fallback?.headTeacher;
    return {
      id: schoolClass.id,
      name: schoolClass.name,
      capacity: schoolClass.capacity,
      levelId: schoolClass.levelId ?? fallback?.levelId ?? '',
      level: this.mapLevel(schoolClass.level, fallback?.level),
      teacherId: schoolClass.headTeacherId ?? fallback?.headTeacherId ?? '',
      teacher: headTeacher
        ? `${headTeacher.firstName} ${headTeacher.lastName}`.trim()
        : '',
      students: students.length,
      subjects: subjectLinks.map((link: any) => link.subject?.name).filter(Boolean),
      subjectIds: subjectLinks.map((link: any) => link.subjectId).filter(Boolean),
      status: schoolClass.status,
      academicYearId: schoolClass.academicYearId ?? fallback?.academicYearId ?? '',
      academicYear: schoolClass.academicYear?.name ?? fallback?.academicYear?.name ?? '',
    };
  }

  private mapSubject(subject: any, fallback?: any): any {
    const teacherLinks = subject?.teacherLinks ?? fallback?.teacherLinks ?? [];
    const resolveTeacherName = (link: any): string => {
      const teacherUser = link?.teacher?.user ?? link?.teacher?.teacherProfile?.user ?? link?.teacher ?? null;
      if (!teacherUser) {
        return '';
      }

      const firstName = teacherUser.firstName ?? '';
      const lastName = teacherUser.lastName ?? '';
      return `${firstName} ${lastName}`.trim();
    };

    return {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      teachers: teacherLinks.length,
      hours: subject.hoursPerWeek,
      coefficient: subject.coefficient,
      teacherIds: teacherLinks.map((link: any) => link.teacherId),
      teacherNames: teacherLinks.map(resolveTeacherName).filter(Boolean),
      status: subject.status,
      description: subject.description ?? '',
    };
  }

  private mapTeacher(user: any): any {
    const teacherProfile = user.teacherProfile;
    const subjectLinks = teacherProfile?.subjectLinks ?? [];
    const primarySubject = teacherProfile?.primarySubject;
    const fallbackSubject = subjectLinks[0]?.subject;
    const subject = primarySubject ?? fallbackSubject;

    return {
      id: user.id,
      firstName: user.firstName,
      name: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      subject: subject?.name ?? '',
      subjectId: subject?.id ?? teacherProfile?.primarySubjectId ?? subjectLinks[0]?.subjectId ?? '',
      status: user.isActive ? 'active' : 'inactive',
    };
  }

  private mapStudent(user: any): any {
    const studentProfile = user.studentProfile;
    return {
      id: user.id,
      firstName: user.firstName,
      name: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      classId: studentProfile?.classId ?? '',
      class: studentProfile?.class?.name ?? '',
      status: user.isActive ? 'active' : 'inactive',
      average: studentProfile?.average ?? 0,
      enrollmentYear: studentProfile?.enrollmentYear ?? '',
      parentName: studentProfile?.parentName ?? '',
      parentPhone: studentProfile?.parentPhone ?? '',
      academicYearId: studentProfile?.academicYearId ?? '',
      dateOfBirth: studentProfile?.dateOfBirth ? this.toDateOnly(studentProfile.dateOfBirth) : '',
      gender: studentProfile?.gender ?? '',
      address: studentProfile?.address ?? '',
      qrCode: studentProfile?.qrCode ?? '',
    };
  }

  private mapParent(user: any): any {
    const parentProfile = user.parentProfile;
    return {
      id: user.id,
      firstName: user.firstName,
      name: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      children: parentProfile?.childrenCount ?? 0,
      childClassId: parentProfile?.primaryClassId ?? '',
      childClass: parentProfile?.primaryClass?.name ?? '',
      profession: parentProfile?.profession ?? '',
      status: user.isActive ? 'active' : 'inactive',
    };
  }

  private mapStaff(staff: any): any {
    return {
      id: staff.id,
      firstName: staff.firstName,
      name: staff.lastName,
      email: staff.email,
      phone: staff.phone ?? '',
      roleId: staff.roleKey,
      role: this.getStaffRoleLabel(staff.roleKey),
      department: staff.department ?? '',
      status: staff.isActive ? 'active' : 'inactive',
      hireDate: staff.hireDate ? this.toDateOnly(staff.hireDate) : '',
    };
  }

  private mapTimetable(timetable: any): any {
    return {
      id: timetable.id,
      academicYearId: timetable.academicYearId,
      academicYear: {
        id: timetable.academicYear?.id ?? '',
        name: timetable.academicYear?.name ?? '',
        status: timetable.academicYear?.status ?? '',
        startDate: this.toDateOnly(timetable.academicYear?.startDate),
        endDate: this.toDateOnly(timetable.academicYear?.endDate),
      },
      semesterId: timetable.semesterId,
      semester: {
        id: timetable.semester?.id ?? '',
        name: timetable.semester?.name ?? '',
        academicYearId: timetable.semester?.academicYearId ?? '',
        academicYearName: timetable.semester?.academicYear?.name ?? timetable.academicYear?.name ?? '',
        startDate: this.toDateOnly(timetable.semester?.startDate),
        endDate: this.toDateOnly(timetable.semester?.endDate),
        status: timetable.semester?.status ?? '',
        average: timetable.semester?.average ?? null,
      },
      classId: timetable.classId,
      class: this.mapClass(timetable.class),
      status: timetable.status,
      entries: (timetable.entries ?? [])
        .map((entry: any) => this.mapTimetableEntry(entry))
        .sort((a: any, b: any) => {
          const dayOrder = this.getDayOrder(a.day) - this.getDayOrder(b.day);
          if (dayOrder !== 0) {
            return dayOrder;
          }
          return a.timeSlot.startTime.localeCompare(b.timeSlot.startTime);
        }),
      createdAt: this.toIso(timetable.createdAt),
      updatedAt: this.toIso(timetable.updatedAt),
    };
  }

  private mapTimetableEntry(entry: any): any {
    const teacher = entry.teacher ? this.mapTeacher(entry.teacher) : null;
    return {
      id: entry.id,
      timetableId: entry.timetableId,
      day: entry.day,
      timeSlotId: entry.timeSlotId,
      timeSlot: {
        id: entry.timeSlot?.id ?? '',
        name: entry.timeSlot?.name ?? '',
        startTime: entry.timeSlot?.startTime ?? '',
        endTime: entry.timeSlot?.endTime ?? '',
      },
      subjectId: entry.subjectId,
      subject: {
        id: entry.subject?.id ?? '',
        name: entry.subject?.name ?? '',
        coefficient: entry.subject?.coefficient ?? 0,
      },
      teacherId: entry.teacherId,
      teacher: teacher
        ? {
            id: teacher.id,
            firstName: teacher.firstName,
            name: teacher.name,
            email: teacher.email,
            subject: teacher.subject,
            subjectId: teacher.subjectId,
          }
        : null,
      classId: entry.classId,
      class: {
        id: entry.class?.id ?? '',
        name: entry.class?.name ?? '',
        capacity: entry.class?.capacity ?? 0,
        levelId: entry.class?.levelId ?? '',
        level: this.mapLevel(entry.class?.level),
      },
      room: entry.room ?? '',
    };
  }

  private getDayOrder(day: string): number {
    const normalized = day.trim().toLowerCase();
    const order = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const index = order.indexOf(normalized);
    return index === -1 ? order.length : index;
  }

  private getStaffRoleLabel(roleKey: string): string {
    const labels: Record<string, string> = {
      secretary: 'Secrétaire',
      accountant: 'Comptable',
      librarian: 'Bibliothécaire',
      it_support: 'Support IT',
      pedagogical_counselor: 'Conseiller pédagogique',
      administrative_assistant: 'Assistant administratif',
      studies_director: 'Directeur des études',
      bursar: 'Intendant',
    };

    return labels[roleKey] ?? roleKey;
  }

  private toIso(value?: Date | string | null): string {
    if (!value) {
      return '';
    }
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toDateOnly(value?: Date | string | null): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 10);
  }
}
