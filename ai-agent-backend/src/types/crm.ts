export interface ContactData {
  firstName?: string;
  lastName?: string;
  phone: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface InteractionLog {
  type: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AppointmentData {
  customer_name: string;
  phone: string;
  customer_email?: string;
  vehicle: string;
  start: string;
  end: string;
  timezone: string;
}

export interface CRMConfig {
  apiKey?: string;
  locationId?: string;
  calendarId?: string;
  refreshToken?: string;
}

export interface CRMAdapter {
  createContact(contact: ContactData): Promise<string>;
  updateContact(crmContactId: string, updates: Partial<ContactData>): Promise<void>;
  logInteraction(crmContactId: string, interaction: InteractionLog): Promise<void>;
  bookAppointment(crmContactId: string, appointment: AppointmentData): Promise<string>;
  findContact(phone: string): Promise<string | null>;
}
