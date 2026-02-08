export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

export interface CalendarAdapter {
  getAvailableSlots(date: string, timezone: string): Promise<TimeSlot[]>;
  createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>;
  cancelEvent(eventId: string): Promise<void>;
}
