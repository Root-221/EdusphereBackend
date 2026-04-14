import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';

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
      })),
    };
  }

  async getChildTimetable(userId: string, childId: string, tenant: ITenant | null) {
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

    const annualTimetable = await client.annualTimetable.findFirst({
      where: {
        academicYearId: academicYear.id,
        classId: classId,
        status: 'active',
      },
      include: {
        entries: {
          where: {
            OR: [
              { semesterId: null },
              { semesterId: semester.id },
            ],
            status: 'SCHEDULED',
          },
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
          },
          orderBy: [
            { dayOfWeek: 'asc' },
            { startTime: 'asc' },
          ],
        },
      },
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
      },
      semester: {
        id: semester.id,
        name: semester.name,
      },
      class: {
        id: schoolClass?.id ?? '',
        name: schoolClass?.name ?? '',
        level: schoolClass?.level?.name ?? '',
      },
      entries: annualTimetable?.entries || [],
    };
  }
}