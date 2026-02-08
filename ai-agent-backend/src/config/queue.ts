import { Queue } from 'bullmq';
import { env } from './env';
import { logger } from '../utils/logger';

const redisUrl = new URL(env.REDIS_URL);

export const connection = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port || '6379'),
  password: redisUrl.password || undefined,
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};

export const QUEUE_NAMES = {
  CRM_SYNC: 'crm-sync',
  TEST_DRIVE_BOOK: 'test-drive-book',
  NOTIFICATION: 'notification',
  ANALYTICS: 'analytics',
} as const;

export const crmSyncQueue = new Queue(QUEUE_NAMES.CRM_SYNC, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const testDriveBookQueue = new Queue(QUEUE_NAMES.TEST_DRIVE_BOOK, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const notificationQueue = new Queue(QUEUE_NAMES.NOTIFICATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 1000 },
  },
});

crmSyncQueue.on('error', (err) => {
  logger.error('CRM sync queue error', { error: err.message });
});

testDriveBookQueue.on('error', (err) => {
  logger.error('Test drive booking queue error', { error: err.message });
});

notificationQueue.on('error', (err) => {
  logger.error('Notification queue error', { error: err.message });
});

analyticsQueue.on('error', (err) => {
  logger.error('Analytics queue error', { error: err.message });
});

export async function closeQueues(): Promise<void> {
  await Promise.all([
    crmSyncQueue.close(),
    testDriveBookQueue.close(),
    notificationQueue.close(),
    analyticsQueue.close(),
  ]);
}
