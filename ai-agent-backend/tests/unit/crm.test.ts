import { GoHighLevelAdapter } from '../../src/services/crm/ghl.adapter';
import { CRMFactory } from '../../src/services/crm/crm.adapter';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CRM Factory', () => {
  it('should create GoHighLevel adapter', () => {
    const adapter = CRMFactory.create('gohighlevel', {
      apiKey: 'test-key',
      locationId: 'loc-123',
    });
    expect(adapter).toBeInstanceOf(GoHighLevelAdapter);
  });

  it('should throw for unsupported CRM type', () => {
    expect(() => CRMFactory.create('salesforce', {})).toThrow('Unsupported CRM type: salesforce');
  });
});

describe('GoHighLevelAdapter', () => {
  let adapter: GoHighLevelAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GoHighLevelAdapter({
      apiKey: 'test-api-key',
      locationId: 'loc-123',
      calendarId: 'cal-456',
    });
  });

  it('should create a contact', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ contact: { id: 'contact-789' } }),
    });

    const contactId = await adapter.createContact({
      phone: '+15551234567',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    });

    expect(contactId).toBe('contact-789');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/contacts/');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');

    const body = JSON.parse(options.body);
    expect(body.phone).toBe('+15551234567');
    expect(body.firstName).toBe('John');
    expect(body.locationId).toBe('loc-123');
  });

  it('should update a contact', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ contact: { id: 'contact-789' } }),
    });

    await adapter.updateContact('contact-789', { firstName: 'Jane' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/contacts/contact-789');
    expect(options.method).toBe('PUT');
  });

  it('should log an interaction', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note: { id: 'note-123' } }),
    });

    await adapter.logInteraction('contact-789', {
      type: 'sms_conversation',
      content: 'Customer interested in Toyota Camry',
      timestamp: new Date().toISOString(),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/contacts/contact-789/notes');
    expect(options.method).toBe('POST');
  });

  it('should book an appointment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'appt-101' }),
    });

    const appointmentId = await adapter.bookAppointment('contact-789', {
      customer_name: 'John Doe',
      phone: '+15551234567',
      vehicle: '2024 Toyota Camry',
      start: '2026-02-07T10:00:00Z',
      end: '2026-02-07T11:00:00Z',
      timezone: 'America/New_York',
    });

    expect(appointmentId).toBe('appt-101');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/calendars/events/appointments');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.calendarId).toBe('cal-456');
    expect(body.contactId).toBe('contact-789');
    expect(body.title).toContain('Toyota Camry');
  });

  it('should throw when booking without calendar ID', async () => {
    const adapterNoCalendar = new GoHighLevelAdapter({
      apiKey: 'test-api-key',
      locationId: 'loc-123',
    });

    await expect(
      adapterNoCalendar.bookAppointment('contact-789', {
        customer_name: 'John',
        phone: '+15551234567',
        vehicle: 'Camry',
        start: '2026-02-07T10:00:00Z',
        end: '2026-02-07T11:00:00Z',
        timezone: 'America/New_York',
      })
    ).rejects.toThrow('Calendar ID not configured');
  });

  it('should retry on rate limit (429)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limited' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ contact: { id: 'contact-after-retry' } }),
      });

    const contactId = await adapter.createContact({
      phone: '+15551234567',
    });

    expect(contactId).toBe('contact-after-retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(
      adapter.createContact({ phone: '+15551234567' })
    ).rejects.toThrow();
  });
});
