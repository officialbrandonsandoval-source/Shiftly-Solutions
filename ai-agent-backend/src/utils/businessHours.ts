import { DateTime } from 'luxon';

export interface BusinessHoursConfig {
  monday: { open: string; close: string } | null;
  tuesday: { open: string; close: string } | null;
  wednesday: { open: string; close: string } | null;
  thursday: { open: string; close: string } | null;
  friday: { open: string; close: string } | null;
  saturday: { open: string; close: string } | null;
  sunday: { open: string; close: string } | null;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '17:00' },
  sunday: null,
};

const DAY_NAMES: (keyof BusinessHoursConfig)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export function isWithinBusinessHours(timezone: string, config?: BusinessHoursConfig): boolean {
  const hours = config || DEFAULT_BUSINESS_HOURS;
  const now = DateTime.now().setZone(timezone);
  const dayIndex = now.weekday - 1; // Luxon weekday is 1-based (Mon=1)
  const dayName = DAY_NAMES[dayIndex];
  const dayHours = hours[dayName];

  if (!dayHours) return false;

  const [openH, openM] = dayHours.open.split(':').map(Number);
  const [closeH, closeM] = dayHours.close.split(':').map(Number);

  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  const nowMinutes = now.hour * 60 + now.minute;

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function getNextBusinessWindow(timezone: string, config?: BusinessHoursConfig): { start: DateTime; end: DateTime } | null {
  const hours = config || DEFAULT_BUSINESS_HOURS;
  let check = DateTime.now().setZone(timezone);

  for (let i = 0; i < 7; i++) {
    const dayIndex = check.weekday - 1;
    const dayName = DAY_NAMES[dayIndex];
    const dayHours = hours[dayName];

    if (dayHours) {
      const [openH, openM] = dayHours.open.split(':').map(Number);
      const [closeH, closeM] = dayHours.close.split(':').map(Number);
      const start = check.set({ hour: openH, minute: openM, second: 0, millisecond: 0 });
      const end = check.set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 });

      if (start > DateTime.now().setZone(timezone)) {
        return { start, end };
      }
    }

    check = check.plus({ days: 1 }).startOf('day');
  }

  return null;
}
