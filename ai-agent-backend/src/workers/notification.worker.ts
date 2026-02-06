import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { NotificationJobData } from '../config/queue';
import { DatabaseService } from '../services/database.service';
import { TwilioService } from '../services/twilio.service';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };
const db = new DatabaseService();
const twilioService = new TwilioService();

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { type, conversationId, dealershipId, recipient, metadata } = job.data;

  logger.info('Processing notification', { type, conversationId, recipient, attempt: job.attemptsMade + 1 });

  const dealership = await db.getDealership(dealershipId);

  switch (type) {
    case 'escalation': {
      // Notify the sales manager via SMS
      const managerPhone = dealership?.manager_phone;
      if (managerPhone) {
        try {
          await twilioService.sendSMS(
            managerPhone,
            `[Shiftly Alert] Conversation ${conversationId.slice(0, 8)} has been escalated. Customer needs human assistance.`
          );
          logger.info('Escalation SMS sent to manager', { managerPhone, conversationId });
        } catch (error: any) {
          logger.warn('Failed to send escalation SMS', { error: error.message });
        }
      } else {
        logger.info('No manager phone configured, logging escalation notification', {
          dealershipId,
          conversationId,
        });
      }

      // TODO: Send email notification when email service is configured
      logger.info('Would send escalation email', { conversationId, dealershipId });

      await db.logInteraction(conversationId, 'escalation_notified', true, {
        dealership_id: dealershipId,
        manager_notified: !!managerPhone,
      });
      break;
    }

    case 'booking_confirmed': {
      // Send confirmation SMS to customer
      try {
        await twilioService.sendSMS(
          recipient,
          `Your test drive has been requested! A team member from ${dealership?.name || 'our dealership'} will confirm your appointment shortly.`
        );
        logger.info('Booking confirmation SMS sent', { recipient, conversationId });
      } catch (error: any) {
        logger.warn('Failed to send booking confirmation SMS', { error: error.message });
      }

      // TODO: Send email confirmation when email service is configured
      logger.info('Would send booking confirmation email', {
        conversationId,
        recipient,
        vehicle: metadata?.vehicleInterest,
      });

      await db.logInteraction(conversationId, 'booking_notification_sent', true, {
        dealership_id: dealershipId,
        recipient,
        metadata,
      });
      break;
    }

    case 'high_score_lead': {
      // Notify sales team about hot lead
      const managerPhone = dealership?.manager_phone;
      if (managerPhone) {
        try {
          await twilioService.sendSMS(
            managerPhone,
            `[Shiftly] Hot lead! Score: ${metadata?.qualificationScore}. Customer ${recipient} is highly interested. Check dashboard for details.`
          );
          logger.info('High score lead SMS sent', { managerPhone, conversationId });
        } catch (error: any) {
          logger.warn('Failed to send high score lead SMS', { error: error.message });
        }
      }

      await db.logInteraction(conversationId, 'high_score_notified', true, {
        dealership_id: dealershipId,
        qualification_score: metadata?.qualificationScore,
      });
      break;
    }

    default:
      logger.warn('Unknown notification type', { type });
  }
}

const worker = new Worker('notifications', processNotification, {
  connection,
  concurrency: 10,
  limiter: { max: 20, duration: 1000 },
});

worker.on('completed', (job) => {
  logger.info('Notification job completed', { jobId: job.id, type: job.data.type });
});

worker.on('failed', (job, err) => {
  logger.error('Notification job failed', {
    jobId: job?.id,
    type: job?.data.type,
    error: err.message,
    attempts: job?.attemptsMade,
  });
});

logger.info('Notification worker started');

export { worker };
