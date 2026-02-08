export interface BookingRequest {
  conversationId: string;
  dealershipId: string;
  customerPhone: string;
  customerName?: string;
  vehicle: string;
  preferredDate: string;
  preferredTime: string;
  timezone: string;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  calendarEventId?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  error?: string;
}
