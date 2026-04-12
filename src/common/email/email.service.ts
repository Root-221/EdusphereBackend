import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface EmailPayload {
  to: Array<{ email: string; name?: string }>;
  subject: string;
  html: string;
  text?: string;
}

interface EmailSendResult {
  success: boolean;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly mode: 'console' | 'smtp';
  private transporter?: nodemailer.Transporter;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(private readonly config: ConfigService) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPortStr = this.config.get<string>('SMTP_PORT');
    const smtpUser = this.config.get<string>('SMTP_USERNAME');
    const smtpPass = this.config.get<string>('SMTP_PASSWORD');
    const smtpPort = smtpPortStr ? parseInt(smtpPortStr, 10) : 587;

    if (smtpHost && smtpUser && smtpPass) {
      this.mode = 'smtp';
      this.fromName = this.config.get<string>('MAIL_FROM_NAME') ?? 'EduSphere';
      this.fromEmail = smtpUser;

      try {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          connectionTimeout: this.getTimeout('SMTP_CONNECTION_TIMEOUT', 10000),
          timeout: this.getTimeout('SMTP_TIMEOUT', 10000),
          socketTimeout: this.getTimeout('SMTP_WRITE_TIMEOUT', 10000),
          tls: {
            rejectUnauthorized: false,
          },
        });
        this.logger.log('SMTP transporter initialized successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to initialize SMTP transporter: ${message}`);
        this.mode = 'console';
        this.transporter = undefined;
      }
    } else {
      this.mode = 'console';
      this.fromName = this.config.get<string>('MAIL_FROM_NAME') ?? 'EduSphere';
      this.fromEmail = 'noreply@edusphere.com';
    }
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    if (this.mode === 'console' || !this.transporter) {
      this.logger.debug('Email (console mode):', {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: payload.to.map((to) => to.email).join(', '),
        subject: payload.subject,
      });
      return { success: true };
    }

    try {
      const mailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: payload.to.map((to) => to.email).join(', '),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${payload.to.map((to) => to.email).join(', ')}`);
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Email send failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendTenantAdminInvitation(params: {
    to: string;
    firstName?: string;
    schoolName: string;
    tenantSlug: string;
    login: string;
    password: string;
  }): Promise<EmailSendResult> {
    const tenantUrl = this.buildTenantUrl(params.tenantSlug);
    const subject = `${params.schoolName} • Accès EduSphere`;
    const html = `
      <p>Bonjour ${params.firstName ?? 'Administrateur'},</p>
      <p>Votre compte EduSphere pour <strong>${params.schoolName}</strong> vient d'être créé.</p>
      <ul>
        <li><strong>URL :</strong> <a href="${tenantUrl}">${tenantUrl}</a></li>
        <li><strong>Login :</strong> ${params.login}</li>
        <li><strong>Mot de passe temporaire :</strong> ${params.password}</li>
      </ul>
      <p>Pour des raisons de sécurité, changez votre mot de passe après la première connexion.</p>
      <p>À bientôt,<br/>L'équipe EduSphere</p>
    `;
    const text = `Bonjour ${params.firstName ?? 'Administrateur'},

Votre compte EduSphere pour ${params.schoolName} vient d'être créé.

URL : ${tenantUrl}
Login : ${params.login}
Mot de passe temporaire : ${params.password}

Pour des raisons de sécurité, changez votre mot de passe après la première connexion.

À bientôt,
L'équipe EduSphere`;

    return await this.send({
      to: [{ email: params.to, name: params.firstName }],
      subject,
      html,
      text,
    });
  }

  async sendEnrollmentCredentials(params: {
    to: string;
    firstName?: string;
    schoolName: string;
    tenantSlug: string;
    accountLabel: string;
    login: string;
    password: string;
    matricule: string;
    enrollmentNumber: string;
    receiptNumber: string;
    amount: number;
    academicYear: string;
    semester: string;
    className: string;
  }): Promise<EmailSendResult> {
    const tenantUrl = this.buildTenantUrl(params.tenantSlug);
    const subject = `${params.schoolName} • Compte ${params.accountLabel}`;
    const html = `
      <p>Bonjour ${params.firstName ?? 'Utilisateur'},</p>
      <p>Votre compte ${params.accountLabel} a été créé pour <strong>${params.schoolName}</strong>.</p>
      <ul>
        <li><strong>URL :</strong> <a href="${tenantUrl}">${tenantUrl}</a></li>
        <li><strong>Login :</strong> ${params.login}</li>
        <li><strong>Mot de passe temporaire :</strong> ${params.password}</li>
        <li><strong>Matricule :</strong> ${params.matricule}</li>
        <li><strong>Inscription :</strong> ${params.enrollmentNumber}</li>
        <li><strong>Reçu :</strong> ${params.receiptNumber}</li>
        <li><strong>Montant payé :</strong> ${params.amount.toLocaleString()} CFA</li>
        <li><strong>Année :</strong> ${params.academicYear}</li>
        <li><strong>Semestre :</strong> ${params.semester}</li>
        <li><strong>Classe :</strong> ${params.className}</li>
      </ul>
      <p>Pour des raisons de sécurité, changez votre mot de passe après la première connexion.</p>
      <p>À bientôt,<br/>L'équipe EduSphere</p>
    `;
    const text = `Bonjour ${params.firstName ?? 'Utilisateur'},

Votre compte ${params.accountLabel} a été créé pour ${params.schoolName}.

URL : ${tenantUrl}
Login : ${params.login}
Mot de passe temporaire : ${params.password}
Matricule : ${params.matricule}
Inscription : ${params.enrollmentNumber}
Reçu : ${params.receiptNumber}
Montant payé : ${params.amount.toLocaleString()} CFA
Année : ${params.academicYear}
Semestre : ${params.semester}
Classe : ${params.className}

Pour des raisons de sécurité, changez votre mot de passe après la première connexion.

À bientôt,
L'équipe EduSphere`;

    return await this.send({
      to: [{ email: params.to, name: params.firstName }],
      subject,
      html,
      text,
    });
  }

  private getTimeout(key: string, fallback: number): number {
    const rawValue = this.config.get<string>(key);
    if (!rawValue) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private buildTenantUrl(slug: string): string {
    const template = this.config.get<string>('TENANT_BASE_URL_TEMPLATE')?.trim();
    if (template && template.includes('{{slug}}')) {
      return template.replace(/{{slug}}/g, slug);
    }

    const baseDomain = this.config.get<string>('TENANT_BASE_DOMAIN')?.trim();
    const scheme = this.config.get<string>('TENANT_DEFAULT_SCHEME')?.trim() || 'https';
    if (baseDomain) {
      if (baseDomain.includes('{{slug}}')) {
        return baseDomain.replace(/{{slug}}/g, slug);
      }
      return `${scheme}://${slug}.${baseDomain}`;
    }

    return `${scheme}://${slug}.localhost`;
  }
}
