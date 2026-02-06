import { CRMAdapter, ContactData, InteractionLog, AppointmentData, CRMConfig } from '../../types/crm';
import { logger } from '../../utils/logger';
import { ServiceError } from '../../utils/errors';

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

export class GoHighLevelAdapter implements CRMAdapter {
  private apiKey: string;
  private locationId: string;
  private calendarId?: string;

  constructor(private config: CRMConfig) {
    this.apiKey = config.apiKey || '';
    this.locationId = config.locationId || '';
    this.calendarId = config.calendarId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${GHL_BASE_URL}${path}`;
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (res.status === 429) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn('GHL rate limited, backing off', { attempt, delay, path });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`GHL API ${method} ${path} returned ${res.status}: ${errorBody}`);
        }

        return (await res.json()) as T;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries && !error.message?.includes('401')) {
          const delay = Math.pow(2, attempt) * 500;
          logger.warn('GHL request failed, retrying', { attempt, path, error: error.message });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new ServiceError('GoHighLevel', `${method} ${path}`, lastError!, false);
  }

  async createContact(contact: ContactData): Promise<string> {
    logger.info('GHL creating contact', { phone: contact.phone });

    const payload: Record<string, unknown> = {
      locationId: this.locationId,
      phone: contact.phone,
      source: 'Shiftly AI Agent',
    };

    if (contact.firstName) payload.firstName = contact.firstName;
    if (contact.lastName) payload.lastName = contact.lastName;
    if (contact.email) payload.email = contact.email;
    if (contact.metadata) payload.customFields = contact.metadata;

    const result = await this.request<{ contact: { id: string } }>(
      'POST',
      '/contacts/',
      payload
    );

    logger.info('GHL contact created', { contactId: result.contact.id });
    return result.contact.id;
  }

  async updateContact(crmContactId: string, updates: Partial<ContactData>): Promise<void> {
    logger.info('GHL updating contact', { crmContactId });

    const payload: Record<string, unknown> = {};
    if (updates.firstName) payload.firstName = updates.firstName;
    if (updates.lastName) payload.lastName = updates.lastName;
    if (updates.email) payload.email = updates.email;
    if (updates.phone) payload.phone = updates.phone;
    if (updates.metadata) payload.customFields = updates.metadata;

    await this.request<{ contact: { id: string } }>(
      'PUT',
      `/contacts/${crmContactId}`,
      payload
    );

    logger.info('GHL contact updated', { crmContactId });
  }

  async logInteraction(crmContactId: string, interaction: InteractionLog): Promise<void> {
    logger.info('GHL logging interaction', { crmContactId, type: interaction.type });

    await this.request<{ note: { id: string } }>(
      'POST',
      `/contacts/${crmContactId}/notes`,
      {
        body: `[${interaction.type}] ${interaction.content}`,
        userId: this.locationId,
      }
    );

    logger.info('GHL interaction logged', { crmContactId, type: interaction.type });
  }

  async bookAppointment(crmContactId: string, appointment: AppointmentData): Promise<string> {
    if (!this.calendarId) {
      throw new ServiceError(
        'GoHighLevel',
        'bookAppointment',
        new Error('Calendar ID not configured'),
        false
      );
    }

    logger.info('GHL booking appointment', { crmContactId, vehicle: appointment.vehicle });

    const result = await this.request<{ id: string }>(
      'POST',
      '/calendars/events/appointments',
      {
        calendarId: this.calendarId,
        locationId: this.locationId,
        contactId: crmContactId,
        startTime: appointment.start,
        endTime: appointment.end,
        title: `Test Drive - ${appointment.vehicle}`,
        appointmentStatus: 'confirmed',
        address: '',
        ignoreDateRange: false,
        toNotify: true,
      }
    );

    logger.info('GHL appointment booked', { appointmentId: result.id, crmContactId });
    return result.id;
  }
}
