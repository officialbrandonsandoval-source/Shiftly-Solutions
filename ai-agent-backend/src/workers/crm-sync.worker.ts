import { Worker } from 'bullmq';
import { connection } from '../config/queue';
import { DatabaseService } from '../services/database.service';
import { CRMFactory } from '../services/crm/crm.adapter';
import { logger } from '../utils/logger';

const db = new DatabaseService();

export const crmSyncWorker = new Worker(
  'crm-sync',
  async (job) => {
    const { conversation_id, customer_phone, dealership_id } = job.data;

    try {
      const dealership = await db.getDealership(dealership_id);
      if (!dealership || !dealership.crm_type || !dealership.crm_config) {
        logger.info('CRM sync skipped: no CRM configured', { dealership_id });
        return;
      }

      const adapter = CRMFactory.create(dealership.crm_type, dealership.crm_config);
      const contactId = await adapter.createContact({
        phone: customer_phone,
        metadata: {
          source: 'Shiftly AI Agent',
          conversation_id,
        },
      });

      await adapter.logInteraction(contactId, {
        type: 'crm_sync',
        content: 'Conversation started via Shiftly AI Agent.',
        timestamp: new Date().toISOString(),
      });

      await db.logInteraction(conversation_id, 'crm_contact_created', true, {
        crm_type: dealership.crm_type,
        crm_contact_id: contactId,
      });

      logger.info('CRM sync completed', { conversation_id, contactId });
    } catch (error: any) {
      await db.logInteraction(conversation_id, 'crm_contact_created', false, {
        crm_type: 'unknown',
      }, error.message);
      logger.error('CRM sync failed', { error: error.message, conversation_id });
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);
