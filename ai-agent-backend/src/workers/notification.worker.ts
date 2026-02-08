import { Worker } from 'bullmq';
import { connection } from '../config/queue';
import { TwilioService } from '../services/twilio.service';
import { SendGridAdapter } from '../services/email/sendgrid.adapter';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

const twilio = new TwilioService();
const email = new SendGridAdapter();
const db = new DatabaseService();

export const notificationWorker = new Worker(
  'notification',
  async (job) => {
    const { type, to, subject, message, conversationId } = job.data;

    try {
      if (type === 'sms') {
        await twilio.sendSMS(to, message);
      } else if (type === 'email') {
        await email.sendEmail(to, subject || 'Shiftly Notification', message);
      }

      if (conversationId) {
        await db.logInteraction(conversationId, `notification_${type}`, true, { to });
      }

      logger.info('Notification sent', { type, to });
    } catch (error: any) {
      logger.error('Notification failed', { type, to, error: error.message });
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);
