import { Job } from 'bullmq';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock queue config (prevent real Redis connections)
jest.mock('../../src/config/queue', () => ({
  connection: { host: 'localhost', port: 6379 },
  QUEUE_NAMES: { CRM_SYNC: 'crm-sync' },
}));

// Mock database service and CRM factory with factories to avoid parsing real modules
jest.mock('../../src/services/database.service', () => ({
  DatabaseService: jest.fn(),
}));
jest.mock('../../src/services/crm/crm.adapter', () => ({
  CRMFactory: { create: jest.fn() },
}));

import { processCRMSync, CRMSyncJobData } from '../../src/workers/crm-sync.worker';
import { CRMFactory } from '../../src/services/crm/crm.adapter';
import { DatabaseService } from '../../src/services/database.service';
import { logger } from '../../src/utils/logger';

const mockGetDealership = jest.fn();
const mockLogInteraction = jest.fn();
const mockCreateContact = jest.fn();

function makeJob(data: CRMSyncJobData, id: string = 'job-1'): Job<CRMSyncJobData> {
  return { id, data } as Job<CRMSyncJobData>;
}

describe('CRM Sync Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up DatabaseService mock
    (DatabaseService as jest.Mock).mockImplementation(() => ({
      getDealership: mockGetDealership,
      logInteraction: mockLogInteraction,
    }));

    // Set up CRMFactory mock
    (CRMFactory.create as jest.Mock) = jest.fn().mockReturnValue({
      createContact: mockCreateContact,
    });
  });

  describe('processCRMSync', () => {
    const jobData: CRMSyncJobData = {
      conversation_id: 'conv-123',
      customer_phone: '+15551234567',
      dealership_id: 'dealer-456',
    };

    it('should create CRM contact for dealership with CRM configured', async () => {
      mockGetDealership.mockResolvedValue({
        id: 'dealer-456',
        crm_type: 'gohighlevel',
        crm_config: { apiKey: 'test-key', locationId: 'loc-1' },
      });
      mockCreateContact.mockResolvedValue('contact-789');
      mockLogInteraction.mockResolvedValue(undefined);

      await processCRMSync(makeJob(jobData));

      expect(mockGetDealership).toHaveBeenCalledWith('dealer-456');
      expect(CRMFactory.create).toHaveBeenCalledWith('gohighlevel', {
        apiKey: 'test-key',
        locationId: 'loc-1',
      });
      expect(mockCreateContact).toHaveBeenCalledWith({
        phone: '+15551234567',
        metadata: {
          source: 'Shiftly AI Agent',
          conversation_id: 'conv-123',
        },
      });
      expect(mockLogInteraction).toHaveBeenCalledWith(
        'conv-123',
        'crm_contact_created',
        true,
        { crm_type: 'gohighlevel', crm_contact_id: 'contact-789' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'CRM sync completed',
        expect.objectContaining({ crm_contact_id: 'contact-789' })
      );
    });

    it('should skip when dealership is not found', async () => {
      mockGetDealership.mockResolvedValue(null);

      await processCRMSync(makeJob(jobData));

      expect(CRMFactory.create).not.toHaveBeenCalled();
      expect(mockCreateContact).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'CRM sync skipped: dealership not found',
        { dealership_id: 'dealer-456' }
      );
    });

    it('should skip when dealership has no CRM type configured', async () => {
      mockGetDealership.mockResolvedValue({
        id: 'dealer-456',
        crm_type: null,
        crm_config: null,
      });

      await processCRMSync(makeJob(jobData));

      expect(CRMFactory.create).not.toHaveBeenCalled();
      expect(mockCreateContact).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'CRM sync skipped: no CRM configured',
        { dealership_id: 'dealer-456' }
      );
    });

    it('should skip when dealership has no CRM config', async () => {
      mockGetDealership.mockResolvedValue({
        id: 'dealer-456',
        crm_type: 'gohighlevel',
        crm_config: null,
      });

      await processCRMSync(makeJob(jobData));

      expect(CRMFactory.create).not.toHaveBeenCalled();
      expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it('should log failed interaction and re-throw on CRM error', async () => {
      mockGetDealership.mockResolvedValue({
        id: 'dealer-456',
        crm_type: 'gohighlevel',
        crm_config: { apiKey: 'test-key', locationId: 'loc-1' },
      });
      const crmError = new Error('GHL API rate limited');
      mockCreateContact.mockRejectedValue(crmError);
      mockLogInteraction.mockResolvedValue(undefined);

      await expect(processCRMSync(makeJob(jobData))).rejects.toThrow('GHL API rate limited');

      expect(mockLogInteraction).toHaveBeenCalledWith(
        'conv-123',
        'crm_contact_created',
        false,
        { crm_type: 'gohighlevel' },
        'GHL API rate limited'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'CRM sync failed',
        expect.objectContaining({ error: 'GHL API rate limited' })
      );
    });

    it('should pass correct metadata with source in contact creation', async () => {
      mockGetDealership.mockResolvedValue({
        id: 'dealer-456',
        crm_type: 'gohighlevel',
        crm_config: { apiKey: 'key', locationId: 'loc' },
      });
      mockCreateContact.mockResolvedValue('contact-new');
      mockLogInteraction.mockResolvedValue(undefined);

      await processCRMSync(makeJob({
        conversation_id: 'conv-abc',
        customer_phone: '+15559876543',
        dealership_id: 'dealer-456',
      }, 'job-2'));

      expect(mockCreateContact).toHaveBeenCalledWith({
        phone: '+15559876543',
        metadata: {
          source: 'Shiftly AI Agent',
          conversation_id: 'conv-abc',
        },
      });
    });
  });
});
