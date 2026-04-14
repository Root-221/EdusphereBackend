import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { CourseStatusValues } from '../school-admin/academic/academic.dto';

import { TimetableGateway } from '@modules/realtime/timetable.gateway';

@Injectable()
export class TeacherService {
  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly timetableGateway: TimetableGateway,
  ) {}

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
      orderBy: { startDate: 'desc' },
    });
    if (active) return active.id;
    const latest = await client.semester.findFirst({
      where: { schoolId, academicYearId },
      orderBy: { startDate: 'desc' },
    });
    return latest?.id ?? null;
  }

  private async ensureWeeklyInstancesForWeek(client: any, schoolId: string, startOfWeek: Date): Promise<void> {
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const annualEntries = await client.annualTimetableEntry.findMany({
      where: {
        schoolId,
        dateStart: { lte: endOfWeek },
        dateEnd: { gte: startOfWeek },
      },
    });

    const daysMap: Record<string, number> = {
      'Lundi': 0,
      'Mardi': 1,
      'Mercredi': 2,
      'Jeudi': 3,
      'Vendredi': 4,
      'Samedi': 5,
      'Dimanche': 6,
    };

    for (const entry of annualEntries) {
      const existingInstance = await client.weeklyCourseInstance.findUnique({
        where: {
          annualTimetableEntryId_weekStartDate: {
            annualTimetableEntryId: entry.id,
            weekStartDate: startOfWeek,
          },
        },
      });

      if (!existingInstance) {
        const dayIndex = daysMap[entry.dayOfWeek] ?? 1;
        const instanceDate = new Date(startOfWeek);
        instanceDate.setDate(startOfWeek.getDate() + dayIndex);

        await client.weeklyCourseInstance.create({
          data: {
            schoolId,
            annualTimetableEntryId: entry.id,
            weekStartDate: startOfWeek,
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            date: instanceDate,
            status: CourseStatusValues.SCHEDULED,
            roomId: entry.roomId,
          },
        });
      }
    }
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

    let startOfWeek: Date;
    if (query.weekStartDate) {
      startOfWeek = new Date(query.weekStartDate);
      startOfWeek.setHours(0, 0, 0, 0);
    } else {
      const now = new Date();
      startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);
    }

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    await this.ensureWeeklyInstancesForWeek(client, schoolId, startOfWeek);

    const allInstances = await client.weeklyCourseInstance.findMany({
      where: {
        schoolId,
        weekStartDate: startOfWeek,
      },
      include: {
        annualTimetableEntry: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    let instances = allInstances.filter((i: any) => i.annualTimetableEntry?.teacherId === teacherId);

    if (query.classId && query.classId !== 'all') {
      instances = instances.filter((i: any) => i.annualTimetableEntry?.classId === query.classId);
    }

    const fullInstances = await client.weeklyCourseInstance.findMany({
      where: {
        id: { in: instances.map((i: any) => i.id) },
      },
      include: {
        annualTimetableEntry: {
          include: {
            subject: true,
            class: { include: { level: true, academicYear: true } },
            room: { include: { building: true } },
            semester: true,
            annualTimetable: { include: { academicYear: true } },
          },
        },
        room: { include: { building: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return fullInstances.map((instance: any) => ({
      id: instance.id,
      dayOfWeek: instance.dayOfWeek,
      startTime: instance.startTime,
      endTime: instance.endTime,
      dateStart: instance.annualTimetableEntry?.dateStart,
      dateEnd: instance.annualTimetableEntry?.dateEnd,
      date: instance.date,
      status: instance.status || 'SCHEDULED',
      cancelledAt: instance.cancelledAt ? instance.cancelledAt.toISOString() : null,
      cancellationReason: instance.cancellationReason ?? null,
      subject: {
        id: instance.annualTimetableEntry?.subject?.id ?? '',
        name: instance.annualTimetableEntry?.subject?.name ?? '',
      },
      teacherId: instance.annualTimetableEntry?.teacherId ?? teacherId,
      class: {
        id: instance.annualTimetableEntry?.class?.id ?? '',
        name: instance.annualTimetableEntry?.class?.name ?? '',
        level: instance.annualTimetableEntry?.class?.level?.name ?? '',
      },
      room: instance.room
        ? {
            id: instance.room.id,
            name: instance.room.name,
            buildingName: instance.room.building?.name ?? '',
          }
        : null,
      semesterId: instance.annualTimetableEntry?.semesterId ?? '',
      semesterName: instance.annualTimetableEntry?.semester?.name ?? '',
      academicYearId: instance.annualTimetableEntry?.annualTimetable?.academicYearId ?? instance.annualTimetableEntry?.class?.academicYearId ?? '',
      academicYearName: instance.annualTimetableEntry?.annualTimetable?.academicYear?.name ?? instance.annualTimetableEntry?.class?.academicYear?.name ?? '',
    }));
  }

  async cancelCourse(
    tenant: ITenant | null,
    teacherId: string,
    courseId: string,
    dto: { reason?: string },
  ): Promise<any> {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const instance = await client.weeklyCourseInstance.findFirst({
      where: { 
        id: courseId, 
        schoolId,
        annualTimetableEntry: { teacherId },
      },
      include: {
        annualTimetableEntry: true,
      },
    });

    if (!instance) {
      throw new NotFoundException('Cours introuvable ou vous n\'êtes pas autorisé à annuler ce cours.');
    }

    if (instance.status === CourseStatusValues.CANCELLED) {
      throw new BadRequestException('Ce cours est déjà annulé.');
    }

    if (instance.status === CourseStatusValues.COMPLETED) {
      throw new BadRequestException('Impossible d\'annuler un cours déjà terminé.');
    }

    const updated = await client.weeklyCourseInstance.update({
      where: { id: courseId },
      data: {
        status: CourseStatusValues.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
    });

    this.timetableGateway.notifyTimetableUpdate(schoolId);

    return {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
      cancellationReason: updated.cancellationReason,
    };
  }
}
