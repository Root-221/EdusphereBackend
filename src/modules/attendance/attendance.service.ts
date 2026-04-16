import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { TenantDatabaseService } from '@database/tenant-database.service';
import { ITenant } from '@common/interfaces/tenant.interface';
import { JwtService } from '@nestjs/jwt';
import { MarkAttendanceDto, AttendanceMethod, ManualAttendanceDto } from './dto/attendance.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly tenantDatabaseService: TenantDatabaseService,
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getClient(tenant: ITenant | null) {
    if (!tenant) throw new BadRequestException('Tenant invalide.');
    return this.tenantDatabaseService.getClientForTenant(tenant);
  }

  /**
   * Génère un token éphémère pour le QR Code de l'élève
   */
  async generateQrToken(studentId: string) {
    // Expire dans 60 secondes pour éviter les captures d'écran partagées
    return this.jwtService.sign(
      { sub: studentId, type: 'attendance_qr' },
      { expiresIn: '1m' }
    );
  }

  /**
   * Marque la présence via Scan ou Manuel
   */
  async markAttendance(
    tenant: ITenant | null,
    userId: string, // Celui qui marque (Prof ou Délégué)
    userRole: string,
    dto: MarkAttendanceDto
  ) {
    const client = await this.getClient(tenant);
    const schoolId = tenant!.id;

    // 1. Identifier l'élève
    let studentId = dto.studentIdOrToken;
    if (dto.method === AttendanceMethod.QR_CODE) {
      const studentByQr = await client.studentProfile.findFirst({
        where: { qrCode: dto.studentIdOrToken },
        select: { id: true }
      });
      if (!studentByQr) {
        throw new BadRequestException('QR Code invalide ou non reconnu.');
      }
      studentId = studentByQr.id;
    }

    // 2. Vérifier l'existence de l'élève et son appartenance à la classe
    const student = await client.studentProfile.findUnique({
      where: { id: studentId },
      include: { 
        user: true,
        parentUser: true
      }
    });
    if (!student) throw new NotFoundException('Élève non trouvé.');

    // 3. Récupérer l'instance de cours
    const instance = await client.weeklyCourseInstance.findUnique({
      where: { id: dto.courseInstanceId },
      include: {
        annualTimetableEntry: {
          include: {
            subject: true,
            class: true
          }
        },
      }
    });
    if (!instance) throw new NotFoundException('Cours non trouvé.');

    // 4. Vérifier les permissions (Prof du cours ou Délégué de la classe)
    await this.validateMarkerPermissions(client, userId, userRole, instance);

    // 5. Calculer le statut (Logique 15/30 min)
    const status = this.calculateAttendanceStatus(instance.startTime);

    // 6. Enregistrer la présence (Upsert pour permettre de corriger si erreur)
    const attendance = await client.attendance.upsert({
      where: {
        studentId_courseInstanceId: {
          studentId,
          courseInstanceId: dto.courseInstanceId
        }
      },
      update: {
        status,
        markedById: userId,
        method: dto.method,
        arrivalTime: new Date(),
        notes: dto.notes
      },
      create: {
        schoolId,
        studentId,
        courseInstanceId: dto.courseInstanceId,
        status,
        markedById: userId,
        method: dto.method,
        arrivalTime: new Date(),
        notes: dto.notes
      }
    });

    // 7. Émettre un événement pour notifications (Parents, Realtime)
    this.eventEmitter.emit('attendance.marked', {
      attendance,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      className: instance.annualTimetableEntry.class.name,
      subjectName: instance.annualTimetableEntry.subject.name,
      instanceId: instance.id,
      tenant,
      studentProfile: student
    });

    return {
      success: true,
      status,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      arrivalTime: attendance.arrivalTime
    };
  }

  /**
   * Marque la présence via matricule (Recherche manuelle)
   */
  async markManualAttendance(
    tenant: ITenant | null,
    userId: string,
    userRole: string,
    dto: ManualAttendanceDto
  ) {
    const client = await this.getClient(tenant);
    
    const student = await client.studentProfile.findUnique({
      where: { matricule: dto.matricule }
    });
    if (!student) throw new NotFoundException(`Aucun élève avec le matricule ${dto.matricule}`);

    return this.markAttendance(tenant, userId, userRole, {
      courseInstanceId: dto.courseInstanceId,
      studentIdOrToken: student.id,
      method: AttendanceMethod.MANUAL,
      notes: dto.notes
    });
  }

  /**
   * Retourne la liste des élèves d'un cours avec leur statut de présence actuel
   */
  async getCourseAttendanceList(
    tenant: ITenant | null,
    userId: string,
    userRole: string,
    courseInstanceId: string,
  ) {
    const client = await this.getClient(tenant);

    const instance = await client.weeklyCourseInstance.findUnique({
      where: { id: courseInstanceId },
      include: { annualTimetableEntry: true }
    });

    if (!instance) throw new NotFoundException('Cours non trouvé');

    await this.validateMarkerPermissions(
      client,
      userId,
      userRole,
      instance,
    );

    // Récupérer tous les élèves de la classe
    const students = await client.studentProfile.findMany({
      where: { classId: instance.annualTimetableEntry.classId },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
        attendances: {
          where: { courseInstanceId }
        }
      }
    });

    return students.map(s => ({
      id: s.id,
      matricule: s.matricule,
      name: `${s.user.firstName} ${s.user.lastName}`,
      avatar: s.user.avatar,
      status: s.attendances[0]?.status || 'NOT_MARKED',
      arrivalTime: s.attendances[0]?.arrivalTime,
      method: s.attendances[0]?.method,
      notes: s.attendances[0]?.notes ?? null,
    }));
  }

  /**
   * Justifie une absence existante avec un motif
   */
  async justifyAttendance(
    tenant: ITenant | null,
    userId: string,
    userRole: string,
    courseInstanceId: string,
    studentId: string,
    reason: string,
  ) {
    const client = await this.getClient(tenant);
    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      throw new BadRequestException('Le motif de justification est obligatoire.');
    }

    const instance = await client.weeklyCourseInstance.findUnique({
      where: { id: courseInstanceId },
      include: { annualTimetableEntry: true },
    });

    if (!instance) throw new NotFoundException('Cours non trouvé');

    await this.validateMarkerPermissions(
      client,
      userId,
      userRole,
      instance,
    );

    const attendance = await client.attendance.findUnique({
      where: {
        studentId_courseInstanceId: {
          studentId,
          courseInstanceId,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Aucune absence trouvée pour cet élève.');
    }

    const attendanceStatus = attendance.status as string;
    if (attendanceStatus !== 'ABSENT' && attendanceStatus !== 'EXCUSED') {
      throw new BadRequestException('Seule une absence peut être justifiée.');
    }

    const student = await client.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
        parentUser: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Élève non trouvé.');
    }

    const updatedAttendance = await client.attendance.update({
      where: {
        studentId_courseInstanceId: {
          studentId,
          courseInstanceId,
        },
      },
      data: {
        status: 'EXCUSED' as any,
        method: AttendanceMethod.MANUAL,
        markedById: userId,
        notes: cleanedReason,
      },
    });

    return {
      success: true,
      status: 'EXCUSED' as const,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      arrivalTime: updatedAttendance.arrivalTime,
      notes: updatedAttendance.notes,
    };
  }

  /**
   * Nomme ou révoque un délégué de classe
   */
  async toggleClassLeader(tenant: ITenant | null, studentId: string) {
    const client = await this.getClient(tenant);
    
    const student = await client.studentProfile.findFirst({
      where: { userId: studentId }
    });

    if (!student) throw new NotFoundException('Élève non trouvé');

    const updated = await client.studentProfile.update({
      where: { id: studentId },
      data: { isClassLeader: !student.isClassLeader }
    });

    return {
      success: true,
      isClassLeader: updated.isClassLeader,
      message: updated.isClassLeader ? 'Élève nommé délégué' : 'Status de délégué révoqué'
    };
  }

  /**
   * Calcule le statut PRESENT / LATE / ABSENT selon l'heure de début
   */
  private calculateAttendanceStatus(startTime: string): 'PRESENT' | 'LATE' | 'ABSENT' {
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    
    const startDateTime = new Date(now);
    startDateTime.setHours(hours, minutes, 0, 0);

    const diffInMinutes = (now.getTime() - startDateTime.getTime()) / (1000 * 60);

    if (diffInMinutes < 15) return 'PRESENT';
    if (diffInMinutes < 30) return 'LATE';
    return 'ABSENT';
  }

  /**
   * Vérifie si celui qui marque a les droits (Prof du cours ou délégué responsable)
   */
  private async validateMarkerPermissions(client: any, userId: string, role: string, instance: any) {
    if (role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN') return;

    if (role === 'TEACHER') {
      if (instance.annualTimetableEntry.teacherId === userId) return;
      throw new ForbiddenException('Vous n\'êtes pas le professeur assigné à ce cours.');
    }

    if (role === 'STUDENT') {
      const student = await client.studentProfile.findUnique({ where: { userId } });
      if (student?.isClassLeader && student.classId === instance.annualTimetableEntry.classId) return;
      throw new ForbiddenException('Seul le délégué de cette classe peut marquer les présences.');
    }

    throw new ForbiddenException('Permission refusée.');
  }
}
