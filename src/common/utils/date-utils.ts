import { WeekDayValues } from '@modules/school-admin/academic/academic.dto';

export const DAYS_LIST = [
  WeekDayValues.sunday,    // 0: Dimanche
  WeekDayValues.monday,    // 1: Lundi
  WeekDayValues.tuesday,   // 2: Mardi
  WeekDayValues.wednesday, // 3: Mercredi
  WeekDayValues.thursday,  // 4: Jeudi
  WeekDayValues.friday,    // 5: Vendredi
  WeekDayValues.saturday,  // 6: Samedi
];

/**
 * Returns the Monday of the week containing the given date, at 00:00:00 local time.
 */
export function getStartOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = result.getDate() - day + (day === 0 ? -6 : 1);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Normalizes a week start date string (YYYY-MM-DD) to a Date at midnight local.
 */
export function parseWeekStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return getStartOfWeek(date);
}

/**
 * Returns the mapping of day name to its offset from MONDAY (0-6).
 * Lundi = 0, Mardi = 1, ..., Dimanche = 6.
 */
export const MONDAY_START_DAYS_MAP: Record<string, number> = {
  [WeekDayValues.monday]: 0,
  [WeekDayValues.tuesday]: 1,
  [WeekDayValues.wednesday]: 2,
  [WeekDayValues.thursday]: 3,
  [WeekDayValues.friday]: 4,
  [WeekDayValues.saturday]: 5,
  [WeekDayValues.sunday]: 6,
};

/**
 * Calculates a specific date given a Monday start-of-week and a day name.
 */
export function getDateFromDayName(startOfWeek: Date, dayName: string): Date {
  const normalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();
  const offset = MONDAY_START_DAYS_MAP[normalizedDay] ?? 0;
  const result = new Date(startOfWeek);
  result.setDate(startOfWeek.getDate() + offset);
  return result;
}
