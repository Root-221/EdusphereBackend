import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@database/prisma.service';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { CourseStatusValues } from '../academic/academic.dto';

@Injectable()
export class CourseSchedulerService {
  private readonly logger = new Logger(CourseSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDatabaseService: TenantDatabaseService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCourseStatusUpdates() {
    try {
      await this.updateAnnualTimetableCourseStatus();
    } catch (error) {
      this.logger.error('Error updating annual timetable course status', error);
    }
  }

  private async updateAnnualTimetableCourseStatus() {
    const schools = await this.prisma.school.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, slug: true, databaseUrl: true },
    });

    for (const school of schools) {
      if (!school.databaseUrl) continue;

      try {
        const tenant: ITenant = {
          id: school.id,
          slug: school.slug,
          name: school.slug,
          status: 'ACTIVE',
          plan: 'free',
          databaseUrl: school.databaseUrl,
        };
        await this.processSchoolCourses(tenant);
      } catch (error) {
        this.logger.error(`Error processing school ${school.id}`, error);
      }
    }
  }

  private async processSchoolCourses(tenant: ITenant) {
    const client = await this.tenantDatabaseService.getClientForTenant(tenant);
    if (!client) return;

    try {
      const now = new Date();
      const currentDayOfWeek = this.getDayOfWeek(now);
      const currentTime = this.formatTime(now);

      await client.$transaction(async (tx: any) => {
        await tx.annualTimetableEntry.updateMany({
          where: {
            schoolId: tenant.id,
            dateStart: { lte: now },
            dateEnd: { gte: now },
            dayOfWeek: currentDayOfWeek,
            status: CourseStatusValues.SCHEDULED,
            startTime: { lte: currentTime },
            endTime: { gt: currentTime },
          },
          data: {
            status: CourseStatusValues.IN_PROGRESS,
          },
        });

        await tx.annualTimetableEntry.updateMany({
          where: {
            schoolId: tenant.id,
            dateStart: { lte: now },
            dateEnd: { gte: now },
            dayOfWeek: currentDayOfWeek,
            status: CourseStatusValues.IN_PROGRESS,
            endTime: { lte: currentTime },
          },
          data: {
            status: CourseStatusValues.COMPLETED,
          },
        });

        await tx.annualTimetableEntry.updateMany({
          where: {
            schoolId: tenant.id,
            OR: [
              { dateStart: { gt: now } },
              { dateEnd: { lt: now } },
              { dayOfWeek: { not: currentDayOfWeek } },
            ],
            status: {
              in: [CourseStatusValues.IN_PROGRESS, CourseStatusValues.COMPLETED],
            },
          },
          data: {
            status: CourseStatusValues.SCHEDULED,
          },
        });
      });
    } catch (error: any) {
      if (error.code === 'P2025' || error.message?.includes('does not exist')) {
        this.logger.debug(`Schema not yet migrated for school ${tenant.id}, skipping`);
        return;
      }
      throw error;
    }
  }

  private getDayOfWeek(date: Date): string {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[date.getDay()];
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
