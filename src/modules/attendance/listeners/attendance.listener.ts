import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '@common/email/email.service';

@Injectable()
export class AttendanceListener {
  private readonly logger = new Logger(AttendanceListener.name);

  constructor(private readonly emailService: EmailService) {}

  @OnEvent('attendance.marked')
  async handleAttendanceMarked(payload: any) {
    const { attendance, studentName, subjectName, tenant, studentProfile } = payload;

    // On ne notifie que pour les retards et les absences
    if (attendance.status === 'PRESENT') {
      return;
    }

    this.logger.log(`🔔 Transition de présence détectée : ${studentName} est ${attendance.status} pour ${subjectName}`);

    // Trouver l'email du parent
    const parentEmail = studentProfile?.parentUser?.email || studentProfile?.parentEmail;
    const parentName = studentProfile?.parentName || 'Parent';

    if (!parentEmail) {
      this.logger.warn(`⚠️ Impossible de notifier le parent de ${studentName} : aucun email trouvé.`);
      return;
    }

    try {
      await this.emailService.sendAttendanceNotification({
        to: parentEmail,
        parentName: parentName,
        studentName: studentName,
        courseName: subjectName,
        status: attendance.status,
        arrivalTime: attendance.arrivalTime || attendance.markedAt || new Date(),
        schoolName: tenant?.name || 'EduSphere'
      });
      this.logger.log(`✅ Notification envoyée avec succès à ${parentEmail}`);
    } catch (error) {
      this.logger.error(`❌ Échec de l'envoi de la notification de présence : ${error.message}`);
    }
  }
}
