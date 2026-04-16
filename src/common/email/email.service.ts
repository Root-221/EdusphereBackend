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
    const recipientName = params.firstName?.trim() || 'Administrateur';
    const subject = `${params.schoolName} • Accès administrateur EduSphere`;
    const { html, text } = this.buildStyledCredentialEmail({
      preheader: `Votre espace administrateur ${params.schoolName} est prêt`,
      banner: 'Accès administrateur',
      title: `Bienvenue dans ${params.schoolName}`,
      greeting: `Bonjour ${recipientName},`,
      intro:
        'Votre espace administrateur EduSphere a été créé. Voici les informations à utiliser pour votre première connexion.',
      ctaLabel: 'Ouvrir l’espace administrateur',
      ctaUrl: tenantUrl,
      rows: [
        { label: 'École', value: params.schoolName },
        { label: 'URL de connexion', value: tenantUrl },
        { label: 'Login', value: params.login },
        { label: 'Mot de passe temporaire', value: params.password },
      ],
      note:
        'Pour votre sécurité, changez votre mot de passe dès la première connexion.',
    });

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
    [keys: string]: any; // Allow spreading baseParams without TS error
  }): Promise<EmailSendResult> {
    const tenantUrl = this.buildTenantUrl(params.tenantSlug);
    const recipientName = params.firstName?.trim() || 'Utilisateur';
    const subject = `${params.schoolName} • Compte ${params.accountLabel}`;
    const { html, text } = this.buildStyledCredentialEmail({
      preheader: `Vos accès ${params.accountLabel} pour ${params.schoolName} sont prêts`,
      banner: `Compte ${params.accountLabel}`,
      title: 'Bienvenue sur EduSphere',
      greeting: `Bonjour ${recipientName},`,
      intro:
        `Votre compte ${params.accountLabel} a été créé pour ${params.schoolName}. Vous trouverez ci-dessous les informations de connexion et les détails de votre inscription.`,
      ctaLabel: `Accéder à ${params.schoolName}`,
      ctaUrl: tenantUrl,
      rows: [
        { label: 'École', value: params.schoolName },
        { label: 'URL de connexion', value: tenantUrl },
        { label: 'Login', value: params.login },
        { label: 'Mot de passe', value: params.password },
      ],
      note:
        'Le mot de passe reçu ici est temporaire. La première connexion affichera une demande de changement de mot de passe.',
    });

    return await this.send({
      to: [{ email: params.to, name: params.firstName }],
      subject,
      html,
      text,
    });
  }

  async sendUserInvitation(params: {
    to: string;
    firstName?: string;
    schoolName: string;
    tenantSlug: string;
    login: string;
    password: string;
    accountLabel: string;
  }): Promise<EmailSendResult> {
    const tenantUrl = this.buildTenantUrl(params.tenantSlug);
    const recipientName = params.firstName?.trim() || 'Utilisateur';
    const accountLabel = params.accountLabel?.trim() || 'utilisateur';
    const subject = `${params.schoolName} • Acces ${accountLabel} EduSphere`;
    const { html, text } = this.buildStyledCredentialEmail({
      preheader: `Vos acces ${accountLabel} pour ${params.schoolName} sont prets`,
      banner: `Compte ${accountLabel}`,
      title: 'Bienvenue sur EduSphere',
      greeting: `Bonjour ${recipientName},`,
      intro: `Votre compte ${accountLabel} a ete cree pour ${params.schoolName}. Voici vos informations de connexion.`,
      ctaLabel: 'Se connecter',
      ctaUrl: tenantUrl,
      rows: [
        { label: 'Ecole', value: params.schoolName },
        { label: 'URL de connexion', value: tenantUrl },
        { label: 'Login', value: params.login },
        { label: 'Mot de passe temporaire', value: params.password },
      ],
      note:
        'Le mot de passe recu ici est temporaire. La premiere connexion affichera une demande de changement de mot de passe.',
    });

    return await this.send({
      to: [{ email: params.to, name: params.firstName }],
      subject,
      html,
      text,
    });
  }

  async sendAttendanceNotification(params: {
    to: string;
    parentName: string;
    studentName: string;
    courseName: string;
    status: 'PRESENT' | 'LATE' | 'ABSENT';
    arrivalTime: Date;
    schoolName: string;
  }): Promise<EmailSendResult> {
    const statusLabel = params.status === 'LATE' ? 'en retard' : 'absent';
    const statusColor = params.status === 'LATE' ? '#F59E0B' : '#EF4444';
    const timeStr = params.arrivalTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    const subject = `Notification d'absence/retard • ${params.studentName} • ${params.schoolName}`;
    const { html, text } = this.buildStyledAttendanceEmail({
      studentName: params.studentName,
      courseName: params.courseName,
      statusLabel,
      statusColor,
      time: timeStr,
      schoolName: params.schoolName
    });

    return await this.send({
      to: [{ email: params.to, name: params.parentName }],
      subject,
      html,
      text
    });
  }

  private buildStyledAttendanceEmail(params: any): { html: string; text: string } {
    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <body style="margin:0; padding:0; background-color:#FAFAFA; font-family: sans-serif; color:#111827;">
        <div style="max-width:480px; margin:40px auto; background:#FFFFFF; border-radius:12px; overflow:hidden; border: 1px solid #E5E7EB;">
          <div style="padding:32px; text-align:center;">
            <div style="display:inline-block; padding:8px 16px; background-color:${params.statusColor}20; color:${params.statusColor}; font-size:12px; font-weight:700; text-transform:uppercase; border-radius:9999px; margin-bottom:16px;">
              Alerte Présence
            </div>
            <h2 style="margin:0 0 16px; font-size:20px; color:#111827;">Suivi de présence</h2>
            <p style="font-size:15px; line-height:1.6; color:#4B5563;">
              Nous vous informons que votre enfant, <strong>${params.studentName}</strong>, a été marqué 
              <span style="color:${params.statusColor}; font-weight:700;">${params.statusLabel}</span> 
              pour le cours de <strong>${params.courseName}</strong> à ${params.time}.
            </p>
            <div style="margin-top:24px; padding:16px; background-color:#F9FAFB; border-radius:8px; font-size:13px; color:#6B7280;">
              Cette notification automatique vous est envoyée par <strong>${params.schoolName}</strong> via la plateforme EduSphere.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    const text = `Notification de présence : ${params.studentName} est ${params.statusLabel} pour le cours de ${params.courseName} à ${params.time}. Ecole: ${params.schoolName}`;
    return { html, text };
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

  private buildStyledCredentialEmail(params: {
    preheader: string;
    banner: string;
    title: string;
    greeting: string;
    intro: string;
    ctaLabel: string;
    ctaUrl: string;
    rows: Array<{ label: string; value: string }>;
    note: string;
  }): { html: string; text: string } {
    const loginInfo = params.rows.find((r) => r.label === 'Login')?.value || '';
    const passInfo = params.rows.find((r) => r.label.includes('Mot de passe'))?.value || '';

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.escapeHtml(params.title)}</title>
      </head>
      <body style="margin:0; padding:0; background-color:#FAFAFA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#111827;">
        <div style="max-width:480px; margin:40px auto; background:#FFFFFF; border-radius:12px; overflow:hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <div style="padding:40px 32px; text-align:center;">
            <div style="display:inline-block; padding:8px 16px; background-color:#EFF6FF; color:#2563EB; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; border-radius:9999px; margin-bottom:24px;">
              ${this.escapeHtml(params.banner)}
            </div>
            
            <h1 style="margin:0 0 16px; font-size:24px; font-weight:700; color:#111827; letter-spacing:-0.025em;">
              ${this.escapeHtml(params.title)}
            </h1>
            
            <p style="margin:0 0 32px; font-size:15px; line-height:1.6; color:#4B5563;">
              ${this.escapeHtml(params.intro)}
            </p>

            <div style="background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:24px; text-align:left; margin-bottom:32px;">
              <div style="margin-bottom:16px;">
                <div style="font-size:12px; color:#64748B; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Identifiant</div>
                <div style="font-size:16px; color:#0F172A; font-weight:600;">${this.escapeHtml(loginInfo)}</div>
              </div>
              <div>
                <div style="font-size:12px; color:#64748B; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Mot de passe provisoire</div>
                <div style="font-size:16px; color:#0F172A; font-weight:600; letter-spacing:0.02em;">${this.escapeHtml(passInfo)}</div>
              </div>
            </div>

            <a href="${this.escapeHtml(params.ctaUrl)}" style="display:inline-block; width:100%; padding:14px 24px; background-color:#2563EB; color:#FFFFFF; font-size:15px; font-weight:600; text-decoration:none; border-radius:8px; box-sizing:border-box; text-align:center;">
              ${this.escapeHtml(params.ctaLabel)}
            </a>

            <p style="margin:24px 0 0; font-size:13px; color:#94A3B8; line-height:1.5;">
              ${this.escapeHtml(params.note)}
            </p>
          </div>
        </div>
        <div style="text-align:center; padding:0 32px 40px;">
          <p style="margin:0; font-size:12px; color:#94A3B8;">&copy; EduSphere. Tous droits réservés.</p>
        </div>
      </body>
      </html>
    `;

    const text = [
      params.preheader,
      '',
      params.greeting,
      '',
      params.intro,
      '',
      ...params.rows.map((row) => `${row.label} : ${row.value}`),
      '',
      params.note,
      '',
      `Connexion : ${params.ctaUrl}`,
      '',
      "L'équipe EduSphere",
    ].join('\n');

    return { html, text };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
