import { Worker, Job } from 'bullmq';
import { connection } from '../config/queue';
import { DatabaseService } from '../services/database.service';
import { CRMFactory } from '../services/crm/crm.adapter';
import { logger } from '../utils/logger';

export interface CRMSyncJobData {
  conversation_id: string;
  customer_phone: string;
  dealership_id: string;
}

let _db: DatabaseService | null = null;
function getDb(): DatabaseService {
  if (!_db) _db = new DatabaseService();
  return _db;
}

export async function processCRMSync(job: Job<CRMSyncJobData>): Promise<void> {
  const db = getDb();
  const { conversation_id, customer_phone, dealership_id } = job.data;

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
    const adapter = CRMFactory.create(dealership.crm_type, dealership.crm_config);
    const contactId = await adapter.createContact({
      phone: customer_phone,
      metadata: {
        source: 'Shiftly AI Agent',
        conversation_id,
      },
    });

    await db.logInteraction(conversation_id, 'crm_contact_created', true, {
      crm_type: dealership.crm_type,
      crm_contact_id: contactId,
    });

    logger.info('CRM sync completed', { conversation_id, crm_contact_id: contactId });
  } catch (error: any) {
    await db.logInteraction(conversation_id, 'crm_contact_created', false, {
      crm_type: dealership.crm_type,
    }, error.message);
    logger.error('CRM sync failed', { error: error.message, conversation_id });
    throw error;
  }
}

export const crmSyncWorker = new Worker(
  'crm-sync',
  processCRMSync,
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);
