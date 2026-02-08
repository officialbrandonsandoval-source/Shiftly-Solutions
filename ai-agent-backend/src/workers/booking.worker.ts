import { Worker } from 'bullmq';
import { connection } from '../config/queue';
import { BookingService } from '../services/booking.service';
import { DatabaseService } from '../services/database.service';
import { TwilioService } from '../services/twilio.service';
import { logger } from '../utils/logger';

const bookingService = new BookingService();
const db = new DatabaseService();
const twilio = new TwilioService();

export const bookingWorker = new Worker(
  'test-drive-book',
  async (job) => {
    const { conversationId, dealershipId, customerPhone, vehicle, date, time, timezone, customerName } = job.data;

    const jobLogId = await db.createJobLog('test-drive-book', job.id?.toString() || '', job.data);

    try {
      const result = await bookingService.bookTestDrive({
        conversationId,
        dealershipId,
        customerPhone,
        customerName,
        vehicle,
        preferredDate: date,
        preferredTime: time,
        timezone: timezone || 'America/Phoenix',
      });

      if (result.success) {
        // Send confirmation SMS
        try {
          await twilio.sendSMS(
            customerPhone,
            `Your test drive for the ${vehicle} has been scheduled for ${result.scheduledStart}. We look forward to seeing you! 🚗`
          );
        } catch (smsErr: any) {
          logger.warn('Booking SMS confirmation failed', { error: smsErr.message });
        }

        await db.updateJobLog(jobLogId, 'completed', result as unknown as Record<string, unknown>);
      } else {
        await db.updateJobLog(jobLogId, 'failed', undefined, result.error);
      }

      logger.info('Booking job completed', { conversationId, result: result.success });
    } catch (error: any) {
      await db.updateJobLog(jobLogId, 'failed', undefined, error.message);
      logger.error('Booking job failed', { error: error.message, conversationId });
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);
