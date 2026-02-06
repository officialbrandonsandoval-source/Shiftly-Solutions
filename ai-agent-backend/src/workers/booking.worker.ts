import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { BookingJobData } from '../config/queue';
import { addNotificationJob } from '../config/queue';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };
const db = new DatabaseService();

async function processBooking(job: Job<BookingJobData>): Promise<void> {
  const { conversationId, customerId, dealershipId, vehicleInterest, preferredDate } = job.data;

  logger.info('Processing booking job', {
    conversationId,
    customerId,
    vehicleInterest,
    preferredDate,
    attempt: job.attemptsMade + 1,
  });

  const dealership = await db.getDealership(dealershipId);
  if (!dealership) {
    logger.warn('Dealership not found for booking', { dealershipId });
    return;
  }

  // TODO: Integrate with Google Calendar API when credentials are available
  // For now, log the booking intent and create a CRM activity
  logger.info('Would book calendar slot', {
    dealership: dealership.name,
    customer: customerId,
    vehicle: vehicleInterest,
    preferredDate,
  });

  await db.logInteraction(conversationId, 'test_drive_requested', true, {
    customer_phone: customerId,
    dealership_id: dealershipId,
    vehicle_interest: vehicleInterest,
    preferred_date: preferredDate,
  });

  // If dealership has CRM configured, create appointment there
  if (dealership.crm_config?.apiKey && dealership.crm_config?.calendarId) {
    const { CRMFactory } = await import('../services/crm/crm.adapter');
    const crm = CRMFactory.create(dealership.crm_type || 'gohighlevel', dealership.crm_config);

    try {
      const startTime = new Date(preferredDate || Date.now() + 86400000).toISOString();
      const endTime = new Date(new Date(startTime).getTime() + 3600000).toISOString();

      await crm.bookAppointment('', {
        customer_name: customerId,
        phone: customerId,
        vehicle: vehicleInterest || 'Vehicle TBD',
        start: startTime,
        end: endTime,
        timezone: 'America/New_York',
      });

      logger.info('CRM appointment created', { conversationId });
    } catch (error: any) {
      logger.warn('CRM appointment failed, continuing', { error: error.message });
    }
  }

  // Send booking confirmation notification
  await addNotificationJob({
    type: 'booking_confirmed',
    conversationId,
    dealershipId,
    recipient: customerId,
    metadata: { vehicleInterest, preferredDate },
  });

  logger.info('Booking job completed', { conversationId });
}

const worker = new Worker('test-drive-booking', processBooking, {
  connection,
  concurrency: 3,
  limiter: { max: 5, duration: 1000 },
});

worker.on('completed', (job) => {
  logger.info('Booking job completed', { jobId: job.id, conversationId: job.data.conversationId });
});

worker.on('failed', (job, err) => {
  logger.error('Booking job failed', {
    jobId: job?.id,
    conversationId: job?.data.conversationId,
    error: err.message,
    attempts: job?.attemptsMade,
  });
});

logger.info('Booking worker started');

export { worker };
