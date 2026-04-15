import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { getStartOfWeek, parseWeekStart, getDateFromDayName } from '@common/utils/date-utils';

@Injectable()
export class ParentService {
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

  async getParentProfile(userId: string, tenant: ITenant | null) {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const parent = await client.user.findUnique({
      where: { id: userId },
      include: {
        parentProfile: {
          include: {
            primaryClass: {
              include: {
                level: true,
              },
            },
          },
        },
      },
    });

    if (!parent || !parent.parentProfile) {
      throw new NotFoundException('Profil parent non trouvé');
    }

    const children = await client.studentProfile.findMany({
      where: {
        parentUserId: userId,
        schoolId,
      },
      include: {
        user: true,
        class: {
          include: {
            level: true,
          },
        },
      },
    });

    return {
      user: {
        id: parent.id,
        email: parent.email,
        firstName: parent.firstName,
        lastName: parent.lastName,
        avatar: parent.avatar,
        phone: parent.phone,
      },
      profile: {
        id: parent.parentProfile.id,
        profession: parent.parentProfile.profession,
        childrenCount: children.length,
      },
      children: children.map(child => ({
        id: child.id,
        firstName: child.user.firstName,
        lastName: child.user.lastName,
        average: child.average,
        gender: child.gender,
        class: child.class ? {
          id: child.class.id,
          name: child.class.name,
          level: child.class.level?.name,
        } : null,
        matricule: child.matricule,
        dateOfBirth: child.dateOfBirth,
        address: child.address,
      })),
    };
  }

  async getChildTimetable(userId: string, childId: string, tenant: ITenant | null, weekStartDate?: string) {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const child = await client.studentProfile.findFirst({
      where: {
        id: childId,
        parentUserId: userId,
        schoolId,
      },
      include: {
        class: true,
      },
    });

    if (!child || !child.classId) {
      throw new NotFoundException('Classe de l\'enfant non trouvée');
    }

    const classId = child.classId;

    const [academicYear, semester] = await Promise.all([
      client.academicYear.findFirst({
        where: { schoolId, status: 'active' },
        orderBy: { startDate: 'desc' },
      }),
      client.semester.findFirst({
        where: { schoolId, status: 'active' },
        orderBy: { startDate: 'desc' },
      }),
    ]);

    if (!academicYear) {
      throw new NotFoundException('Année académique active non trouvée');
    }

    if (!semester) {
      throw new NotFoundException('Semestre actif non trouvé');
    }

    const schoolClass = await client.schoolClass.findUnique({
      where: { id: classId },
      include: {
        level: true,
      },
    });

    const now = new Date();
    let startOfWeek: Date;
    
    if (weekStartDate) {
      startOfWeek = parseWeekStart(weekStartDate);
    } else {
      startOfWeek = getStartOfWeek(now);
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
      child: {
        id: child.id,
        firstName: (child as any).user?.firstName || '',
        lastName: (child as any).user?.lastName || '',
      },
      academicYear: {
        id: academicYear.id,
        name: academicYear.name,
        startDate: academicYear.startDate,
        endDate: academicYear.endDate,
      },
      semester: {
        id: semester.id,
        name: semester.name,
        startDate: semester.startDate,
        endDate: semester.endDate,
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

    for (const entry of annualEntries) {
      const existingInstance = await client.weeklyCourseInstance.findUnique({
        where: {
          annualTimetableEntryId_weekStartDate: {
            annualTimetableEntryId: entry.id,
            weekStartDate: startOfWeek,
          },
        },
      });

      if (existingInstance) {
        const correctDate = getDateFromDayName(startOfWeek, entry.dayOfWeek);
        const existingDateStr = existingInstance.date instanceof Date 
          ? existingInstance.date.toISOString().split('T')[0] 
          : new Date(existingInstance.date).toISOString().split('T')[0];
        const correctDateStr = correctDate.toISOString().split('T')[0];

        if (existingDateStr !== correctDateStr) {
          await client.weeklyCourseInstance.update({
            where: { id: existingInstance.id },
            data: { date: correctDate },
          });
        }
      } else {
        const instanceDate = getDateFromDayName(startOfWeek, entry.dayOfWeek);

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

  async getPayments(userId: string, tenant: ITenant | null) {
    const client = await this.getClient(tenant);
    const schoolId = this.requireTenant(tenant).id;

    const enrollments = await client.enrollment.findMany({
      where: {
        parentUserId: userId,
        schoolId,
      },
      include: {
        studentUser: true,
        class: true,
        academicYear: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return enrollments.map(enrollment => ({
      id: enrollment.id,
      childId: enrollment.studentUserId,
      childName: enrollment.studentUser ? `${enrollment.studentUser.firstName} ${enrollment.studentUser.lastName}` : 'Inconnu',
      title: `Frais d'inscription - ${enrollment.academicYear?.name || 'Année inconnue'}`,
      amount: enrollment.paymentAmount ?? 0,
      status: enrollment.status === 'paid' ? 'paid' : (enrollment.status === 'cancelled' ? 'cancelled' : 'pending'),
      dueDate: enrollment.createdAt ? new Date(enrollment.createdAt).toLocaleDateString('fr-FR') : '',
      paymentDate: enrollment.paymentDate ? new Date(enrollment.paymentDate).toLocaleDateString('fr-FR') : '',
      type: 'schooling',
      receiptNumber: enrollment.receiptNumber,
      method: enrollment.paymentMethod,
    }));
  }
}