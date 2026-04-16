import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AttendanceSchedulerService {
  private readonly logger = new Logger(AttendanceSchedulerService.name);
  private readonly centralDb = new PrismaClient();

  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  /**
   * S'exécute toutes les 15 minutes pour marquer les absences automatiques
   */
  @Cron('0 */15 * * * *')
  async handleAutoAbsenteeism() {
    this.logger.log('🕒 Démarrage du job d\'absentéisme automatique...');
    
    // Récupérer tous les tenants actifs
    const schools = await this.centralDb.school.findMany({
      where: { status: 'ACTIVE' }
    });

    for (const school of schools) {
      try {
        await this.processSchoolAbsences(school);
      } catch (error) {
        this.logger.error(`❌ Erreur lors du traitement de l'école ${school.slug}: ${error.message}`);
      }
    }
  }

  private async processSchoolAbsences(school: any) {
    const client = await this.tenantDatabaseService.getClientForTenant(school);
    const now = new Date();
    
    // 1. Trouver les instances de cours qui ont commencé il y a plus de 30 minutes
    const activeInstances = await client.weeklyCourseInstance.findMany({
      where: {
        schoolId: school.id,
        status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        date: {
          lte: now,
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000)
        }
      },
      include: {
        annualTimetableEntry: {
          include: {
            subject: true,
            class: true
          }
        }
      }
    });

    for (const instance of activeInstances) {
      const [hours, minutes] = instance.startTime.split(':').map(Number);
      const startDateTime = new Date(instance.date);
      startDateTime.setHours(hours, minutes, 0, 0);

      const diffInMinutes = (now.getTime() - startDateTime.getTime()) / (1000 * 60);
      
      if (diffInMinutes >= 30) {
        await this.markAbsentStudents(client, school, instance);
      }
    }
  }

  private async markAbsentStudents(client: any, school: any, instance: any) {
    const students = await client.studentProfile.findMany({
      where: { classId: instance.annualTimetableEntry.classId },
      include: {
        user: true,
        parentUser: true,
        attendances: {
          where: { courseInstanceId: instance.id }
        }
      }
    });

    const nonPointedStudents = students.filter(s => s.attendances.length === 0);

    if (nonPointedStudents.length === 0) return;

    this.logger.log(`📝 Marquage de ${nonPointedStudents.length} absents pour le cours ${instance.id}`);

    for (const student of nonPointedStudents) {
      const attendance = await client.attendance.create({
        data: {
          schoolId: school.id,
          studentId: student.id,
          courseInstanceId: instance.id,
          status: 'ABSENT',
          markedById: 'SYSTEM',
          method: 'AUTOMATIC',
          notes: 'Marqué absent automatiquement après 30 minutes.'
        }
      });

      this.eventEmitter.emit('attendance.marked', {
        attendance,
        studentName: `${student.user.firstName} ${student.user.lastName}`,
        className: instance.annualTimetableEntry.class.name,
        subjectName: instance.annualTimetableEntry.subject.name,
        instanceId: instance.id,
        tenant: school,
        studentProfile: student
      });
    }
  }
}
