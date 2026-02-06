import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { CRMSyncJobData } from '../config/queue';
import { CRMFactory } from '../services/crm/crm.adapter';
import { DatabaseService } from '../services/database.service';
import { logger } from '../utils/logger';

const connection = { url: env.REDIS_URL };
const db = new DatabaseService();

async function processCRMSync(job: Job<CRMSyncJobData>): Promise<void> {
  const { conversationId, dealershipId, customerPhone, action, qualificationScore, context } = job.data;

  logger.info('Processing CRM sync job', { conversationId, action, attempt: job.attemptsMade + 1 });

  const dealership = await db.getDealership(dealershipId);
  if (!dealership) {
    logger.warn('Dealership not found for CRM sync', { dealershipId });
    return;
  }

  const crmConfig = dealership.crm_config;
  if (!crmConfig?.apiKey) {
    logger.info('No CRM configured for dealership, skipping', { dealershipId });
    return;
  }

  const crm = CRMFactory.create(dealership.crm_type || 'gohighlevel', crmConfig);

  if (action === 'create') {
    const contactId = await crm.createContact({
      phone: customerPhone,
      metadata: {
        source: 'shiftly_ai',
        conversation_id: conversationId,
        qualification_score: qualificationScore,
        ...context,
      },
    });

    logger.info('CRM contact created', { contactId, conversationId });

    await db.logInteraction(conversationId, 'crm_contact_created', true, {
      crm_contact_id: contactId,
      dealership_id: dealershipId,
    });
  } else if (action === 'update') {
    // For updates, we need the CRM contact ID — look it up from interactions
    logger.info('CRM update requested', { conversationId, qualificationScore });

    await crm.logInteraction('', {
      type: 'qualification_update',
      content: `Qualification score updated to ${qualificationScore}`,
      timestamp: new Date().toISOString(),
      metadata: context,
    });

    await db.logInteraction(conversationId, 'crm_contact_updated', true, {
      qualification_score: qualificationScore,
      dealership_id: dealershipId,
    });
  }
}

const worker = new Worker('crm-sync', processCRMSync, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

worker.on('completed', (job) => {
  logger.info('CRM sync job completed', { jobId: job.id, conversationId: job.data.conversationId });
});

worker.on('failed', (job, err) => {
  logger.error('CRM sync job failed', {
    jobId: job?.id,
    conversationId: job?.data.conversationId,
    error: err.message,
    attempts: job?.attemptsMade,
  });
});

logger.info('CRM sync worker started');

export { worker };
