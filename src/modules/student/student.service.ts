import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

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
      orderBy: { startDate: 'desc' },
    });
    if (active) return active.id;
    const latest = await client.semester.findFirst({
      where: { schoolId, academicYearId },
      orderBy: { startDate: 'desc' },
    });
    return latest?.id ?? null;
  }

  async getStudentProfile(userId: string, tenant: ITenant | null) {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const student = await client.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: {
          include: {
            class: {
              include: {
                level: true,
              },
            },
          },
        },
      },
    });

    if (!student || !student.studentProfile) {
      throw new NotFoundException('Profil élève non trouvé');
    }

    const profile = student.studentProfile;
    
    const academicYear = await client.academicYear.findFirst({
      where: { schoolId, status: 'active' },
      orderBy: { startDate: 'desc' },
    });

    const semester = academicYear 
      ? await client.semester.findFirst({
          where: { schoolId, academicYearId: academicYear.id, status: 'active' },
          orderBy: { startDate: 'desc' },
        })
      : null;

    const enrollment = await client.enrollment.findFirst({
      where: {
        studentUserId: userId,
        status: { in: ['paid', 'completed'] },
      },
      include: {
        academicYear: true,
        semester: true,
        class: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    return {
      user: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        avatar: student.avatar,
      },
      profile: {
        id: profile.id,
        matricule: profile.matricule,
        qrCode: profile.qrCode,
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        address: profile.address,
        parentName: profile.parentName,
        parentPhone: profile.parentPhone,
        average: profile.average,
      },
      class: profile.class ? {
        id: profile.class.id,
        name: profile.class.name,
        level: profile.class.level?.name,
      } : null,
      academicYear: academicYear ? {
        id: academicYear.id,
        name: academicYear.name,
      } : null,
      semester: semester ? {
        id: semester.id,
        name: semester.name,
      } : null,
      enrollment: enrollment ? {
        id: enrollment.id,
        status: enrollment.status,
        paymentStatus: enrollment.paymentStatus,
      } : null,
    };
  }

  async getStudentTimetable(userId: string, tenant: ITenant | null, weekStartDate?: string) {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    this.logger.log(`getStudentTimetable: userId=${userId}, weekStartDate=${weekStartDate}`);

    const student = await client.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
      },
    });

    if (!student || !student.studentProfile || !student.studentProfile.classId) {
      throw new NotFoundException('Classe non trouvée pour cet élève');
    }

    const classId = student.studentProfile.classId;
    this.logger.log(`Student classId: ${classId}`);

    const academicYearId = await this.getDefaultAcademicYearId(client, schoolId);
    if (!academicYearId) {
      throw new NotFoundException('Année académique active non trouvée');
    }

    const semesterId = await this.getDefaultSemesterId(client, schoolId, academicYearId);
    if (!semesterId) {
      throw new NotFoundException('Semestre actif non trouvé');
    }

    const academicYear = await client.academicYear.findUnique({
      where: { id: academicYearId },
    });

    const semester = await client.semester.findUnique({
      where: { id: semesterId },
    });

    const schoolClass = await client.schoolClass.findUnique({
      where: { id: classId },
      include: {
        level: true,
      },
    });

    const now = new Date();
    let startOfWeek: Date;
    
    if (weekStartDate) {
      startOfWeek = new Date(weekStartDate);
      startOfWeek.setHours(0, 0, 0, 0);
    } else {
      startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);
    }
    
    const weekStartDateStr = startOfWeek.toISOString().split('T')[0];

    await this.ensureWeeklyInstancesForWeek(client, schoolId, weekStartDateStr);

    const instances = await client.weeklyCourseInstance.findMany({
      where: {
        schoolId,
        weekStartDate: startOfWeek,
        annualTimetableEntry: {
          classId: classId,
        },
      },
      include: {
        annualTimetableEntry: {
          include: {
            subject: true,
            teacher: {
              select: { id: true, firstName: true, lastName: true },
            },
            room: {
              include: {
                building: true,
              },
            },
            semester: true,
          },
        },
        room: {
          include: {
            building: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    this.logger.log(`Found ${instances.length} instances for class ${classId} week ${weekStartDateStr}`);

    for (const inst of instances) {
      this.logger.log(`  - ${inst.dayOfWeek} ${inst.date}: ${inst.annualTimetableEntry?.subject?.name} (status: ${inst.status})`);
    }

    const entries = instances
      .filter(instance => instance.annualTimetableEntry)
      .map(instance => {
        const entry = instance.annualTimetableEntry;
        return {
          id: instance.id,
          annualTimetableEntryId: entry.id,
          dayOfWeek: instance.dayOfWeek,
          startTime: instance.startTime,
          endTime: instance.endTime,
          dateStart: entry.dateStart,
          dateEnd: entry.dateEnd,
          date: instance.date,
          status: instance.status,
          cancelledAt: instance.cancelledAt,
          cancellationReason: instance.cancellationReason,
          roomId: instance.roomId,
          room: instance.room,
          subjectId: entry.subjectId,
          subject: entry.subject,
          teacherId: entry.teacherId,
          teacher: entry.teacher,
          classId: entry.classId,
          semesterId: entry.semesterId,
          semester: entry.semester,
        };
      });

    return {
      academicYear: {
        id: academicYear?.id ?? '',
        name: academicYear?.name ?? '',
      },
      semester: {
        id: semester?.id ?? '',
        name: semester?.name ?? '',
      },
      class: {
        id: schoolClass?.id ?? '',
        name: schoolClass?.name ?? '',
        level: schoolClass?.level?.name ?? '',
      },
      entries,
    };
  }

  private async ensureWeeklyInstancesForWeek(client: any, schoolId: string, startOfWeekStr: string): Promise<void> {
    const startOfWeek = new Date(startOfWeekStr);
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
            status: 'SCHEDULED',
            roomId: entry.roomId,
          },
        });
      }
    }
  }
}