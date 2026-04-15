import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EnrollmentService } from '../enrollment.service';

@Injectable()
export class EnrollmentListener {
  private readonly logger = new Logger(EnrollmentListener.name);

  constructor(private readonly enrollmentService: EnrollmentService) {}

  @OnEvent('enrollment.created')
  async handleEnrollmentCreatedEvent(payload: any) {
    this.logger.log(`Traitement asynchrone de l'e-mail d'inscription pour ${payload.enrollment.enrollmentNumber}`);
    
    try {
      await this.enrollmentService.sendEnrollmentEmails(payload);
      this.logger.log(`E-mails d'inscription envoyés avec succès pour ${payload.enrollment.enrollmentNumber}`);
    } catch (error) {
      this.logger.error(
        `Échec de l'envoi asynchrone des e-mails pour ${payload.enrollment.enrollmentNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
