import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';

@Injectable()
export class TeacherService {
  constructor(private readonly tenantDatabaseService: TenantDatabaseService) {}

  private requireTenant(tenant: ITenant | null): ITenant {
    if (!tenant) {
      throw new BadRequestException('Tenant invalide.');
    }
    return tenant;
  }

  private async getClient(tenant: ITenant | null) {
    return this.tenantDatabaseService.getClientForTenant(this.requireTenant(tenant));
  }

  private async getDefaultAcademicYearId(client: any, schoolId: string): Promise<string | null> {
    const active = await client.academicYear.findFirst({
      where: { schoolId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });
    if (active) return active.id;
    const latest = await client.academicYear.findFirst({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
    });
    return latest?.id ?? null;
  }

  private async getDefaultSemesterId(client: any, schoolId: string, academicYearId: string): Promise<string | null> {
    const active = await client.semester.findFirst({
      where: { schoolId, academicYearId, status: 'active' },
      orderBy: { startDate: 'asc' },
    });
    if (active) return active.id;
    const first = await client.semester.findFirst({
      where: { schoolId, academicYearId },
      orderBy: { startDate: 'asc' },
    });
    return first?.id ?? null;
  }

  async getTeacherClassesOptions(tenant: ITenant | null, teacherId: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const defaultAcademicYearId = await this.getDefaultAcademicYearId(client, schoolId);
    const defaultSemesterId = defaultAcademicYearId
      ? await this.getDefaultSemesterId(client, schoolId, defaultAcademicYearId)
      : null;

    const [academicYears, semesters, teacherSubjects, classLinks] = await Promise.all([
      client.academicYear.findMany({
        where: { schoolId },
        orderBy: { startDate: 'desc' },
      }),
      client.semester.findMany({
        where: { schoolId },
        include: { academicYear: true },
        orderBy: [{ academicYearId: 'desc' }, { startDate: 'asc' }],
      }),
      client.teacherSubject.findMany({
        where: { schoolId, teacherId },
        include: { subject: true },
      }),
      client.teacherClass.findMany({
        where: { schoolId, teacherId },
        include: { class: { include: { level: true, academicYear: true } } },
      }),
    ]);

    return {
      currentAcademicYearId: defaultAcademicYearId,
      currentSemesterId: defaultSemesterId,
      academicYears: academicYears.map((year: any) => ({
        id: year.id,
        name: year.name,
        status: year.status,
      })),
      semesters: semesters.map((semester: any) => ({
        id: semester.id,
        name: semester.name,
        academicYearId: semester.academicYearId,
        academicYearName: semester.academicYear?.name ?? '',
        status: semester.status,
        startDate: semester.startDate,
        endDate: semester.endDate,
      })),
      subjects: teacherSubjects
        .map((item: any) => item.subject)
        .filter(Boolean)
        .map((subject: any) => ({
          id: subject.id,
          name: subject.name,
        })),
      classes: classLinks
        .map((link: any) => link.class)
        .filter(Boolean)
        .map((schoolClass: any) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          levelId: schoolClass.levelId ?? '',
          level: schoolClass.level?.name ?? '',
          academicYearId: schoolClass.academicYearId ?? '',
          academicYear: schoolClass.academicYear?.name ?? '',
        })),
    };
  }

  async listTeacherClasses(tenant: ITenant | null, teacherId: string, query: any = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId =
      query.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));

    const teacherSubjects = await client.teacherSubject.findMany({
      where: { schoolId, teacherId },
      include: { subject: true },
    });
    const teacherSubjectIds = new Set(teacherSubjects.map((item: any) => item.subjectId));

    const classLinks = await client.teacherClass.findMany({
      where: { schoolId, teacherId },
      include: {
        class: {
          include: {
            level: true,
            academicYear: true,
            subjectLinks: { include: { subject: true } },
            students: true,
          },
        },
      },
    });

    const classes = classLinks
      .map((link: any) => link.class)
      .filter(Boolean)
      .filter((schoolClass: any) => (academicYearId ? schoolClass.academicYearId === academicYearId : true));

    const semesters = await client.semester.findMany({
      where: {
        schoolId,
        ...(academicYearId ? { academicYearId } : {}),
      },
      orderBy: { startDate: 'asc' },
    });
    const activeSemester = semesters.find((semester: any) => semester.status === 'active') ?? semesters[0];

    const result = classes
      .map((schoolClass: any) => {
        const subjectLinks = schoolClass.subjectLinks ?? [];
        const classSubjectIds = subjectLinks.map((link: any) => link.subjectId);
        const scopedSubjects = subjectLinks
          .filter((link: any) => teacherSubjectIds.has(link.subjectId))
          .map((link: any) => link.subject)
          .filter(Boolean);
        const subjects = scopedSubjects.length > 0
          ? scopedSubjects
          : teacherSubjects.map((item: any) => item.subject).filter(Boolean);

        const students = schoolClass.students ?? [];
        const maleStudents = students.filter((student: any) =>
          String(student.gender ?? '').toLowerCase().startsWith('m'),
        ).length;
        const femaleStudents = students.filter((student: any) =>
          String(student.gender ?? '').toLowerCase().startsWith('f'),
        ).length;
        const average =
          students.length > 0
            ? Math.round((students.reduce((sum: number, student: any) => sum + (student.average ?? 0), 0) / students.length) * 10) / 10
            : 0;

        return {
          id: schoolClass.id,
          name: schoolClass.name,
          level: schoolClass.level?.name ?? '',
          levelId: schoolClass.levelId ?? '',
          academicYearId: schoolClass.academicYearId ?? '',
          academicYear: schoolClass.academicYear?.name ?? '',
          semesterId: activeSemester?.id ?? '',
          semester: activeSemester?.name ?? '',
          students: students.length,
          maleStudents,
          femaleStudents,
          average,
          subjectIds: subjects.map((subject: any) => subject.id),
          subjects: subjects.map((subject: any) => ({ id: subject.id, name: subject.name })),
        };
      })
      .filter((item: any) => (query.subjectId ? item.subjectIds.includes(query.subjectId) : true))
      .filter((item: any) => (query.semesterId ? item.semesterId === query.semesterId : true));

    return result;
  }

  async listTeacherClassStudents(tenant: ITenant | null, teacherId: string, classId: string): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const link = await client.teacherClass.findFirst({ where: { schoolId, teacherId, classId } });
    if (!link) {
      throw new ForbiddenException('Vous n’êtes pas assigné à cette classe.');
    }

    const students = await client.studentProfile.findMany({
      where: { schoolId, classId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return students.map((student: any) => ({
      id: student.id,
      firstName: student.user?.firstName ?? '',
      lastName: student.user?.lastName ?? '',
      email: student.user?.email ?? '',
      average: student.average ?? 0,
      gender: student.gender ?? '',
    }));
  }

  async getTeacherTimetableOptions(tenant: ITenant | null, teacherId: string): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const defaultAcademicYearId = await this.getDefaultAcademicYearId(client, schoolId);
    const defaultSemesterId = defaultAcademicYearId
      ? await this.getDefaultSemesterId(client, schoolId, defaultAcademicYearId)
      : null;

    const [academicYears, semesters, teacherSubjects, classLinks] = await Promise.all([
      client.academicYear.findMany({
        where: { schoolId },
        orderBy: { startDate: 'desc' },
      }),
      client.semester.findMany({
        where: { schoolId },
        include: { academicYear: true },
        orderBy: [{ academicYearId: 'desc' }, { startDate: 'asc' }],
      }),
      client.teacherSubject.findMany({
        where: { schoolId, teacherId },
        include: { subject: true },
      }),
      client.teacherClass.findMany({
        where: { schoolId, teacherId },
        include: { class: { include: { level: true, academicYear: true } } },
      }),
    ]);

    return {
      currentAcademicYearId: defaultAcademicYearId,
      currentSemesterId: defaultSemesterId,
      academicYears: academicYears.map((year: any) => ({
        id: year.id,
        name: year.name,
        status: year.status,
      })),
      semesters: semesters.map((semester: any) => ({
        id: semester.id,
        name: semester.name,
        academicYearId: semester.academicYearId,
        academicYearName: semester.academicYear?.name ?? '',
        status: semester.status,
        startDate: semester.startDate,
        endDate: semester.endDate,
      })),
      subjects: teacherSubjects
        .map((item: any) => item.subject)
        .filter(Boolean)
        .map((subject: any) => ({
          id: subject.id,
          name: subject.name,
        })),
      classes: classLinks
        .map((link: any) => link.class)
        .filter(Boolean)
        .map((schoolClass: any) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          levelId: schoolClass.levelId ?? '',
          level: schoolClass.level?.name ?? '',
          academicYearId: schoolClass.academicYearId ?? '',
          academicYear: schoolClass.academicYear?.name ?? '',
        })),
    };
  }

  async listTeacherTimetableEntries(tenant: ITenant | null, teacherId: string, query: any = {}): Promise<any[]> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;
    const academicYearId =
      query.academicYearId ?? (await this.getDefaultAcademicYearId(client, schoolId));
    const semesterId =
      query.semesterId ??
      (academicYearId ? await this.getDefaultSemesterId(client, schoolId, academicYearId) : null);

    const entries = await client.annualTimetableEntry.findMany({
      where: {
        schoolId,
        teacherId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(semesterId ? { semesterId } : {}),
        ...(academicYearId ? { annualTimetable: { academicYearId } } : {}),
      },
      include: {
        subject: true,
        class: { include: { level: true, academicYear: true } },
        room: { include: { building: true } },
        semester: true,
        annualTimetable: { include: { academicYear: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return entries.map((entry: any) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      dateStart: entry.dateStart,
      dateEnd: entry.dateEnd,
      subject: {
        id: entry.subject?.id ?? '',
        name: entry.subject?.name ?? '',
      },
      class: {
        id: entry.class?.id ?? '',
        name: entry.class?.name ?? '',
        level: entry.class?.level?.name ?? '',
      },
      room: entry.room
        ? {
            id: entry.room.id,
            name: entry.room.name,
            buildingName: entry.room.building?.name ?? '',
          }
        : null,
      semesterId: entry.semesterId ?? '',
      semesterName: entry.semester?.name ?? '',
      academicYearId: entry.annualTimetable?.academicYearId ?? entry.class?.academicYearId ?? '',
      academicYearName: entry.annualTimetable?.academicYear?.name ?? entry.class?.academicYear?.name ?? '',
    }));
  }
}
