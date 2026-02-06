import { CRMAdapter, ContactData, InteractionLog, AppointmentData, CRMConfig } from '../../types/crm';
import { logger } from '../../utils/logger';

export class GoHighLevelAdapter implements CRMAdapter {
  constructor(private config: CRMConfig) {}

  async createContact(contact: ContactData): Promise<string> {
    logger.info('GHL createContact stub', { phone: contact.phone });
    return 'stub-contact-id';
  }

  async updateContact(crmContactId: string, updates: Partial<ContactData>): Promise<void> {
    logger.info('GHL updateContact stub', { crmContactId });
  }

  async logInteraction(crmContactId: string, interaction: InteractionLog): Promise<void> {
    logger.info('GHL logInteraction stub', { crmContactId, type: interaction.type });
  }

  async bookAppointment(crmContactId: string, appointment: AppointmentData): Promise<string> {
    logger.info('GHL bookAppointment stub', { crmContactId });
    return 'stub-appointment-id';
  }
}
