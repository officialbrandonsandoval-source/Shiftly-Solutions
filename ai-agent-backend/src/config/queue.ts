import { Queue } from 'bullmq';
import { env } from './env';
import { logger } from '../utils/logger';

const connection = {
  url: env.REDIS_URL,
};

export const crmSyncQueue = new Queue('crm-sync', { connection });
export const bookingQueue = new Queue('test-drive-booking', { connection });
export const notificationQueue = new Queue('notifications', { connection });

export interface CRMSyncJobData {
  conversationId: string;
  dealershipId: string;
  customerPhone: string;
  action: 'create' | 'update';
  qualificationScore?: number;
  context?: Record<string, unknown>;
}

export interface BookingJobData {
  conversationId: string;
  customerId: string;
  dealershipId: string;
  vehicleInterest?: string;
  preferredDate: string;
}

export interface NotificationJobData {
  type: 'escalation' | 'booking_confirmed' | 'high_score_lead';
  conversationId: string;
  dealershipId: string;
  recipient: string;
  metadata?: Record<string, unknown>;
}

export async function addCRMSyncJob(data: CRMSyncJobData): Promise<void> {
  try {
    await crmSyncQueue.add('sync', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    logger.info('CRM sync job queued', { conversationId: data.conversationId, action: data.action });
  } catch (error: any) {
    logger.error('Failed to queue CRM sync job', { error: error.message });
  }
}

export async function addBookingJob(data: BookingJobData): Promise<void> {
  try {
    await bookingQueue.add('book', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    logger.info('Booking job queued', { conversationId: data.conversationId });
  } catch (error: any) {
    logger.error('Failed to queue booking job', { error: error.message });
  }
}

export async function addNotificationJob(data: NotificationJobData): Promise<void> {
  try {
    await notificationQueue.add('notify', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    logger.info('Notification job queued', { type: data.type, conversationId: data.conversationId });
  } catch (error: any) {
    logger.error('Failed to queue notification job', { error: error.message });
  }
}
