import { Worker, Job } from 'bullmq';
import { connection, QUEUE_NAMES } from '../config/queue';
import { CRMFactory } from '../services/crm/crm.adapter';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

export interface CRMSyncJobData {
  conversation_id: string;
  customer_phone: string;
  dealership_id: string;
}

export async function processCRMSync(job: Job<CRMSyncJobData>): Promise<void> {
  const { conversation_id, customer_phone, dealership_id } = job.data;

  logger.info('CRM sync job started', {
    jobId: job.id,
    conversation_id,
    dealership_id,
  });

  const db = new DatabaseService();

  // 1. Look up dealership to get CRM config
  const dealership = await db.getDealership(dealership_id);
  if (!dealership) {
    logger.warn('CRM sync skipped: dealership not found', { dealership_id });
    return;
  }

  if (!dealership.crm_type || !dealership.crm_config) {
    logger.info('CRM sync skipped: no CRM configured', { dealership_id });
    return;
  }

  try {
    // 2. Create CRM adapter via factory
    const crm = CRMFactory.create(dealership.crm_type, dealership.crm_config);

    // 3. Create contact in CRM
    const contactId = await crm.createContact({
      phone: customer_phone,
      metadata: {
        source: 'Shiftly AI Agent',
        conversation_id,
      },
    });

    // 4. Log successful interaction
    await db.logInteraction(conversation_id, 'crm_contact_created', true, {
      crm_type: dealership.crm_type,
      crm_contact_id: contactId,
    });

    logger.info('CRM sync completed', {
      jobId: job.id,
      conversation_id,
      crm_contact_id: contactId,
    });
  } catch (error: any) {
    // Log failed interaction
    await db.logInteraction(
      conversation_id,
      'crm_contact_created',
      false,
      { crm_type: dealership.crm_type },
      error.message
    );

    logger.error('CRM sync failed', {
      jobId: job.id,
      conversation_id,
      error: error.message,
    });

    throw error; // Re-throw for BullMQ retry
  }
}

export function createCRMSyncWorker(): Worker<CRMSyncJobData> {
  const worker = new Worker<CRMSyncJobData>(
    QUEUE_NAMES.CRM_SYNC,
    processCRMSync,
    {
      connection,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.debug('CRM sync job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('CRM sync job failed', {
      jobId: job?.id,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('CRM sync worker error', { error: err.message });
  });

  return worker;
}
