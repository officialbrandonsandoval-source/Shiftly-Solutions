import sgMail from '@sendgrid/mail';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class SendGridAdapter {
  constructor() {
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
    }
  }

  async sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
      logger.warn('SendGrid not configured, skipping email');
      return;
    }

    try {
      await sgMail.send({
        to,
        from: env.SENDGRID_FROM_EMAIL,
        subject,
        text,
        html: html || text,
      });

      logger.info('Email sent', { to, subject });
    } catch (error: any) {
      logger.error('SendGrid email failed', { to, subject, error: error.message });
      throw error;
    }
  }
}
