import { parseDay } from '../dateUtils';

/**
 * The weekday of a forecast day ("2026-10-15", a date with no time). A bare date is UTC midnight to `new Date`, which
 * `toLocaleDateString` writes as the day before anywhere west of Greenwich - `parseDay` reads it as local noon instead.
 * `locale` is for tests; the app passes nothing and gets the device's.
 */
export function weekdayName(date: string, locale?: string, style: 'short' | 'long' = 'short'): string {
  return parseDay(date).toLocaleDateString(locale, { weekday: style });
}

/** A forecast strip's column label: "Today" for today, else the weekday. */
export function forecastDayLabel(date: string, todayIso: string, locale?: string): string {
  return date === todayIso ? 'Today' : weekdayName(date, locale);
}
