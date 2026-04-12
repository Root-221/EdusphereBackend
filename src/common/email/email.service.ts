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
    matricule: string;
    enrollmentNumber: string;
    receiptNumber: string;
    amount: number;
    academicYear: string;
    semester: string;
    className: string;
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
        { label: 'Mot de passe temporaire', value: params.password },
        { label: 'Matricule', value: params.matricule },
        { label: 'Numéro d’inscription', value: params.enrollmentNumber },
        { label: 'Reçu', value: params.receiptNumber },
        { label: 'Montant payé', value: `${params.amount.toLocaleString('fr-FR')} CFA` },
        { label: 'Année scolaire', value: params.academicYear },
        { label: 'Semestre', value: params.semester },
        { label: 'Classe', value: params.className },
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
    const rowsHtml = params.rows
      .map(
        (row) => `
          <tr>
            <td style="padding:0 0 12px 0;">
              <div style="border:1px solid #e2e8f0; background:#f8fafc; border-radius:16px; padding:14px 16px;">
                <div style="font-size:11px; line-height:1; letter-spacing:0.12em; text-transform:uppercase; color:#64748b; margin-bottom:6px;">
                  ${this.escapeHtml(row.label)}
                </div>
                <div style="font-size:15px; line-height:1.5; color:#0f172a; font-weight:600; word-break:break-word;">
                  ${this.escapeHtml(row.value)}
                </div>
              </div>
            </td>
          </tr>`,
      )
      .join('');

    const html = `
      <div style="margin:0; padding:0; background:#f4f7fb;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; background:#f4f7fb; width:100%;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; max-width:680px; font-family:Arial,Helvetica,sans-serif;">
                <tr>
                  <td style="padding-bottom:14px; text-align:center; color:#64748b; font-size:12px; letter-spacing:0.12em; text-transform:uppercase;">
                    ${this.escapeHtml(params.preheader)}
                  </td>
                </tr>
                <tr>
                  <td style="background:#1d4ed8; background-image:linear-gradient(135deg, #1d4ed8 0%, #2563eb 52%, #0f766e 100%); border-radius:24px 24px 0 0; padding:34px 32px;">
                    <div style="display:inline-block; background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.18); color:#ffffff; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; padding:8px 12px; border-radius:999px;">
                      ${this.escapeHtml(params.banner)}
                    </div>
                    <h1 style="margin:18px 0 10px; font-size:30px; line-height:1.2; color:#ffffff;">
                      ${this.escapeHtml(params.title)}
                    </h1>
                    <p style="margin:0; font-size:16px; line-height:1.7; color:rgba(255,255,255,0.92);">
                      ${this.escapeHtml(params.intro)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; padding:32px;">
                    <p style="margin:0 0 20px; font-size:16px; line-height:1.7; color:#0f172a;">
                      ${this.escapeHtml(params.greeting)}
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse; margin:0 0 8px;">
                      ${rowsHtml}
                    </table>
                    <div style="padding:8px 0 0; text-align:center;">
                      <a href="${this.escapeHtml(params.ctaUrl)}" style="display:inline-block; background:#1d4ed8; color:#ffffff; text-decoration:none; font-size:14px; font-weight:700; padding:14px 24px; border-radius:14px; box-shadow:0 10px 24px rgba(29,78,216,0.22);">
                        ${this.escapeHtml(params.ctaLabel)}
                      </a>
                    </div>
                    <p style="margin:14px 0 0; text-align:center; font-size:12px; line-height:1.6; color:#64748b;">
                      ${this.escapeHtml(`Connexion : ${params.ctaUrl}`)}
                    </p>
                    <div style="margin-top:24px; border-left:4px solid #1d4ed8; background:#eff6ff; padding:14px 16px; border-radius:14px;">
                      <p style="margin:0; font-size:14px; line-height:1.7; color:#1e3a8a;">
                        ${this.escapeHtml(params.note)}
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 24px 24px; padding:20px 32px; text-align:center;">
                    <p style="margin:0; font-size:13px; line-height:1.6; color:#64748b;">
                      L'équipe EduSphere
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
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
