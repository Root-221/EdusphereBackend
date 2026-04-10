import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthService } from '@modules/auth/auth.service';
import { AuthRepository } from '@modules/auth/auth.repository';
import { RegisterSchoolDto } from '@modules/auth/dto/register-school.dto';
import { Prisma, School, SchoolStatus, UserRole } from '@prisma/client';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { SchoolType } from '@common/constants/school-types';
import { CloudinaryService, CloudinaryUploadFile } from '@common/cloudinary/cloudinary.service';
import {
  PlatformStatsDto,
  PlatformSchoolSummary,
  NormalizedSchoolStatus,
  NormalizedSchoolType,
  PlatformActivity,
} from './dto/platform-stats.dto';

export interface SchoolAdminSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  status: 'active' | 'inactive';
  schoolId: string;
  schoolName: string;
  slug: string;
  createdAt: Date;
  isActive: boolean;
}

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);
  constructor(
    private readonly authService: AuthService,
    private readonly authRepository: AuthRepository,
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  listSchools() {
    return this.authRepository.listSchools();
  }

  createSchool(dto: RegisterSchoolDto) {
    return this.authService.registerSchool(dto);
  }

  async uploadSchoolLogo(file: CloudinaryUploadFile, baseUrl?: string): Promise<{ url: string }> {
    const url = await this.cloudinaryService.uploadSchoolLogo(file, baseUrl);
    return { url };
  }

  updateSchoolStatus(id: string, status: SchoolStatus) {
    return this.authRepository.updateSchoolStatus(id, status);
  }

  async listSchoolAdmins(): Promise<SchoolAdminSummary[]> {
    const schools = await this.authRepository.listSchools();
    const admins: SchoolAdminSummary[] = [];

    for (const school of schools) {
      if (!school.databaseUrl) {
        this.logger.warn(`Skipping school ${school.slug} because it has no databaseUrl`);
        continue;
      }

      const tenant: ITenant = {
        id: school.id,
        slug: school.slug,
        name: school.name,
        status: school.status,
        plan: school.plan,
        databaseUrl: school.databaseUrl,
      };

      try {
        const client = await this.tenantDatabaseService.getClientForTenant(tenant);
        const tenantAdmins = await client.user.findMany({
          where: { role: 'SCHOOL_ADMIN' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        tenantAdmins.forEach((admin) => {
          admins.push({
            id: admin.id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            phone: admin.phone,
            role: admin.role,
            status: admin.isActive ? 'active' : 'inactive',
            schoolId: school.id,
            schoolName: school.name,
            slug: school.slug,
            createdAt: admin.createdAt,
            isActive: admin.isActive,
          });
        });
      } catch (error) {
        this.logger.warn(`Unable to load admins for school ${school.slug}`, error as Error);
      }
    }

    return admins;
  }

  async updateSchoolAdminStatus(adminId: string, isActive: boolean): Promise<SchoolAdminSummary> {
    const schools = await this.authRepository.listSchools();
    for (const school of schools) {
      if (!school.databaseUrl) continue;

      const tenant: ITenant = {
        id: school.id,
        slug: school.slug,
        name: school.name,
        status: school.status,
        plan: school.plan,
        databaseUrl: school.databaseUrl,
      };

      try {
        const client = await this.tenantDatabaseService.getClientForTenant(tenant);
        const updatedAdmin = await client.user.update({
          where: { id: adminId },
          data: { isActive },
        });

        return {
          id: updatedAdmin.id,
          email: updatedAdmin.email,
          firstName: updatedAdmin.firstName,
          lastName: updatedAdmin.lastName,
          phone: updatedAdmin.phone,
          role: updatedAdmin.role,
          status: updatedAdmin.isActive ? 'active' : 'inactive',
          schoolId: school.id,
          schoolName: school.name,
          slug: school.slug,
          createdAt: updatedAdmin.createdAt,
          isActive: updatedAdmin.isActive,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          continue;
        }
        this.logger.warn(`Unable to update admin ${adminId} for school ${school.slug}`, error as Error);
      }
    }

    throw new NotFoundException('Administrateur introuvable');
  }

  async getPlatformStats(): Promise<PlatformStatsDto> {
    const schools = await this.authRepository.listSchools();
    const typeBuckets: NormalizedSchoolType[] = [
      'public',
      'private',
      'college',
      'lycee',
      'university',
      'institute',
      'coranic',
    ];
    const planBuckets: Array<'free' | 'basic' | 'premium' | 'enterprise'> = [
      'free',
      'basic',
      'premium',
      'enterprise',
    ];

    const typeCounts: Record<NormalizedSchoolType, number> = typeBuckets.reduce(
      (acc, type) => ({ ...acc, [type]: 0 }),
      {} as Record<NormalizedSchoolType, number>,
    );
    const planCounts: Record<'free' | 'basic' | 'premium' | 'enterprise', number> = {
      free: 0,
      basic: 0,
      premium: 0,
      enterprise: 0,
    };
    const statusCounts: Record<'active' | 'suspended' | 'pending', number> = {
      active: 0,
      suspended: 0,
      pending: 0,
    };

    let totalStudents = 0;
    let totalTeachers = 0;
    let totalAdmins = 0;
    let monthlyRevenue = 0;

    for (const school of schools) {
      const normalizedType = this.normalizeType(school.type);
      typeCounts[normalizedType] = (typeCounts[normalizedType] ?? 0) + 1;

      const normalizedPlan = this.normalizePlan(school.plan);
      planCounts[normalizedPlan] += 1;
      monthlyRevenue += this.planPricing[normalizedPlan];

      const normalizedStatus = this.normalizeStatus(school.status);
      statusCounts[normalizedStatus] += 1;

      const tenantCounts = await this.countTenantUsers(school);
      totalStudents += tenantCounts.students;
      totalTeachers += tenantCounts.teachers;
      totalAdmins += tenantCounts.admins;
    }

    const recentSchools = this.buildRecentSchools(schools);

    const stats: PlatformStatsDto = {
      totalSchools: schools.length,
      activeSchools: statusCounts.active,
      suspendedSchools: statusCounts.suspended,
      pendingSchools: statusCounts.pending,
      totalStudents,
      totalTeachers,
      totalAdmins,
      totalUsers: totalStudents + totalTeachers + totalAdmins,
      monthlyRevenue,
      schoolsByType: typeCounts,
      schoolsByPlan: planCounts,
      recentSchools,
      recentActivity: recentSchools.map((school) => ({
        id: `activity-${school.id}`,
        action:
          school.status === 'active'
            ? 'Nouvelle école activée'
            : school.status === 'suspended'
            ? 'Nouvelle école suspendue'
            : 'Nouvelle école en attente',
        school: school.name,
        time: this.formatRelativeTime(new Date(school.createdAt)),
      })),
    };

    return stats;
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const minute = 60_000;
    const hour = minute * 60;
    const day = hour * 24;

    if (diffMs < minute) {
      return 'À l’instant';
    }
    if (diffMs < hour) {
      return `Il y a ${Math.round(diffMs / minute)} min`;
    }
    if (diffMs < day) {
      return `Il y a ${Math.round(diffMs / hour)} h`;
    }
    return `Il y a ${Math.round(diffMs / day)} j`;
  }

  private buildRecentSchools(schools: School[]): PlatformSchoolSummary[] {
    return [...schools]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((school) => ({
        id: school.id,
        name: school.name,
        type: this.normalizeType(school.type),
        status: this.normalizeStatus(school.status),
        plan: this.normalizePlan(school.plan),
        email: school.email,
        slug: school.slug,
        createdAt: school.createdAt.toISOString(),
      }));
  }

  private normalizePlan(plan?: string | null): 'free' | 'basic' | 'premium' | 'enterprise' {
    const lower = plan?.toLowerCase();
    const allowed: Array<'free' | 'basic' | 'premium' | 'enterprise'> = ['free', 'basic', 'premium', 'enterprise'];
    return allowed.includes(lower as any) ? (lower as 'free' | 'basic' | 'premium' | 'enterprise') : 'free';
  }

  private normalizeType(type: SchoolType): NormalizedSchoolType {
    const lower = type.toLowerCase() as NormalizedSchoolType;
    const allowed: NormalizedSchoolType[] = [
      'public',
      'private',
      'college',
      'lycee',
      'university',
      'institute',
      'coranic',
    ];
    return allowed.includes(lower) ? lower : 'private';
  }

  private normalizeStatus(status: SchoolStatus): NormalizedSchoolStatus {
    const lower = status.toLowerCase() as NormalizedSchoolStatus;
    const allowed: NormalizedSchoolStatus[] = ['active', 'suspended', 'pending'];
    return allowed.includes(lower) ? lower : 'pending';
  }

  private readonly planPricing: Record<'free' | 'basic' | 'premium' | 'enterprise', number> = {
    free: 0,
    basic: 25000,
    premium: 50000,
    enterprise: 75000,
  };

  private async countTenantUsers(
    school: School,
  ): Promise<{ students: number; teachers: number; admins: number }> {
    if (!school.databaseUrl) {
      return { students: 0, teachers: 0, admins: 0 };
    }

    const tenant: ITenant = {
      id: school.id,
      slug: school.slug,
      name: school.name,
      status: school.status,
      plan: school.plan,
      databaseUrl: school.databaseUrl,
    };

    try {
      const client = await this.tenantDatabaseService.getClientForTenant(tenant);
      const [students, teachers, admins] = await Promise.all([
        client.user.count({ where: { role: UserRole.STUDENT } }),
        client.user.count({ where: { role: UserRole.TEACHER } }),
        client.user.count({ where: { role: UserRole.SCHOOL_ADMIN } }),
      ]);
      return { students, teachers, admins };
    } catch (error) {
      this.logger.warn(`Unable to count users for school ${school.slug}`, error as Error);
      return { students: 0, teachers: 0, admins: 0 };
    }
  }
}
