import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface EmailAddress {
  email: string;
  name?: string;
}

interface EmailPayload {
  to: EmailAddress[];
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly mode: 'console' | 'twilio';
  private readonly client?: AxiosInstance;
  private readonly from: EmailAddress;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('TWILIO_SENDGRID_API_KEY');
    this.mode = apiKey ? 'twilio' : 'console';
    this.from = this.parseAddress(
      this.config.get<string>('TWILIO_EMAIL_FROM') ?? 'EduSphere <noreply@edusphere.com>',
    );

    if (this.mode === 'twilio') {
      this.client = axios.create({
        baseURL: 'https://api.sendgrid.com/v3',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
    }
  }

  async send(payload: EmailPayload) {
    if (this.mode === 'console') {
      this.logger.debug('Email (console mode):', {
        from: this.from,
        ...payload,
      });
      return;
    }

    if (!this.client) {
      throw new Error('Twilio email client is not initialized');
    }

    await this.client.post('/mail/send', {
      personalizations: [{ to: payload.to }],
      from: this.from,
      subject: payload.subject,
      content: [
        { type: 'text/html', value: payload.html },
        ...(payload.text ? [{ type: 'text/plain', value: payload.text }] : []),
      ],
    });
  }

  async sendTenantAdminInvitation(params: {
    to: string;
    firstName?: string;
    schoolName: string;
    tenantSlug: string;
    login: string;
    password: string;
  }) {
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

Changez votre mot de passe après la première connexion.

À bientôt,
L'équipe EduSphere`;

    await this.send({
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
  }) {
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

Changez votre mot de passe après la première connexion.

À bientôt,
L'équipe EduSphere`;

    await this.send({
      to: [{ email: params.to, name: params.firstName }],
      subject,
      html,
      text,
    });
  }

  private parseAddress(value: string): EmailAddress {
    const match = value.match(/^(.*)<(.+@.+)>$/);
    if (match) {
      return { name: match[1].trim(), email: match[2].trim() };
    }
    return { email: value.trim() };
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
