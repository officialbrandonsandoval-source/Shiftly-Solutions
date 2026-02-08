import { google, calendar_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { DateTime } from 'luxon';
import { CalendarAdapter, TimeSlot, CalendarEvent } from '../../types/calendar';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class GoogleCalendarAdapter implements CalendarAdapter {
  private calendar: calendar_v3.Calendar;
  private calendarId: string;

  constructor() {
    const credentialsJson = env.GOOGLE_CALENDAR_CREDENTIALS;
    if (!credentialsJson) {
      throw new Error('GOOGLE_CALENDAR_CREDENTIALS not configured');
    }

    const credentials = JSON.parse(Buffer.from(credentialsJson, 'base64').toString('utf8'));
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    this.calendar = google.calendar({ version: 'v3', auth });
    this.calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
  }

  async getAvailableSlots(date: string, timezone: string): Promise<TimeSlot[]> {
    const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf('day').set({ hour: 9 });
    const dayEnd = DateTime.fromISO(date, { zone: timezone }).startOf('day').set({ hour: 18 });

    const freeBusy = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISO()!,
        timeMax: dayEnd.toISO()!,
        timeZone: timezone,
        items: [{ id: this.calendarId }],
      },
    });

    const busySlots = freeBusy.data.calendars?.[this.calendarId]?.busy || [];
    const slots: TimeSlot[] = [];

    let cursor = dayStart;
    while (cursor < dayEnd) {
      const slotEnd = cursor.plus({ minutes: 30 });
      const isBusy = busySlots.some((busy) => {
        const busyStart = DateTime.fromISO(busy.start!, { zone: timezone });
        const busyEnd = DateTime.fromISO(busy.end!, { zone: timezone });
        return cursor < busyEnd && slotEnd > busyStart;
      });

      slots.push({
        start: cursor.toISO()!,
        end: slotEnd.toISO()!,
        available: !isBusy,
      });

      cursor = slotEnd;
    }

    return slots;
  }

  async createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const result = await this.calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC',
        },
        attendees: event.attendees?.map((email) => ({ email })),
      },
    });

    logger.info('Google Calendar event created', { eventId: result.data.id });

    return {
      id: result.data.id || '',
      title: event.title,
      start: event.start,
      end: event.end,
      attendees: event.attendees,
      location: event.location,
      description: event.description,
    };
  }

  async cancelEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: this.calendarId,
      eventId,
    });

    logger.info('Google Calendar event cancelled', { eventId });
  }
}
