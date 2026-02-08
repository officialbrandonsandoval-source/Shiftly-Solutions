import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { DatabaseService } from './database.service';
import { CRMFactory } from './crm/crm.adapter';
import { BookingRequest, BookingResult } from '../types/booking';
import { logger } from '../utils/logger';

export class BookingService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  /**
   * Detect if a message contains a booking/test drive intent with a date/time.
   * Returns parsed date info if found, null otherwise.
   */
  detectBookingIntent(message: string): { date: Date; text: string } | null {
    const lower = message.toLowerCase();
    const hasBookingKeyword =
      lower.includes('test drive') ||
      lower.includes('schedule') ||
      lower.includes('appointment') ||
      lower.includes('book') ||
      lower.includes('come in') ||
      lower.includes('visit');

    if (!hasBookingKeyword) return null;

    const results = chrono.parse(message, new Date(), { forwardDate: true });
    if (results.length === 0) return null;

    const parsed = results[0];
    if (!parsed.start.get('hour')) return null; // Need a specific time

    return {
      date: parsed.start.date(),
      text: parsed.text,
    };
  }

  async bookTestDrive(request: BookingRequest): Promise<BookingResult> {
    try {
      const dealership = await this.db.getDealership(request.dealershipId);
      if (!dealership) {
        return { success: false, error: 'Dealership not found' };
      }

      const scheduledDate = DateTime.fromISO(request.preferredDate, { zone: request.timezone });
      const scheduledTime = request.preferredTime;

      // Create booking record in database
      const bookingId = await this.db.createBooking({
        conversationId: request.conversationId,
        dealershipId: request.dealershipId,
        customerPhone: request.customerPhone,
        customerName: request.customerName,
        vehicle: request.vehicle,
        scheduledDate: scheduledDate.toISODate()!,
        scheduledTime,
      });

      // If CRM is configured, book appointment there too
      let crmAppointmentId: string | undefined;
      if (dealership.crm_type && dealership.crm_config) {
        try {
          const crm = CRMFactory.create(dealership.crm_type, dealership.crm_config);
          const contactId = await crm.createContact({
            phone: request.customerPhone,
            firstName: request.customerName,
          });

          const startDt = scheduledDate.set({
            hour: parseInt(scheduledTime.split(':')[0]),
            minute: parseInt(scheduledTime.split(':')[1]),
          });

          crmAppointmentId = await crm.bookAppointment(contactId, {
            customer_name: request.customerName || 'Customer',
            phone: request.customerPhone,
            vehicle: request.vehicle,
            start: startDt.toISO()!,
            end: startDt.plus({ minutes: 30 }).toISO()!,
            timezone: request.timezone,
          });
        } catch (crmError: any) {
          logger.warn('CRM booking failed, local booking still created', {
            error: crmError.message,
            bookingId,
          });
        }
      }

      logger.info('Test drive booked', { bookingId, crmAppointmentId });

      return {
        success: true,
        bookingId,
        calendarEventId: crmAppointmentId,
        scheduledStart: `${scheduledDate.toISODate()} ${scheduledTime}`,
      };
    } catch (error: any) {
      logger.error('Booking failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}
