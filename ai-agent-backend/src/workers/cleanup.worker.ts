import { Worker } from 'bullmq';
import { connection, QUEUE_NAMES } from '../config/queue';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

const db = new DatabaseService();

export const cleanupWorker = new Worker(
  QUEUE_NAMES.ANALYTICS,
  async (job) => {
    const { maxAgeDays = 90 } = job.data || {};

    try {
      const closed = await db.closeStaleConversations(maxAgeDays);
      logger.info('Cleanup completed', { closedConversations: closed });
      return { closedConversations: closed };
    } catch (error: any) {
      logger.error('Cleanup failed', { error: error.message });
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);
