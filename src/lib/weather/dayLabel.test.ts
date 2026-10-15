import { describe, it, expect } from 'vitest';
import { forecastDayLabel, weekdayName } from './dayLabel';

// Run with TZ=America/Los_Angeles (and any other zone): a date-only string must name the same weekday everywhere.
// 2026-10-15 is a Thursday.
describe('forecast day labels', () => {
  it('names the weekday of a bare date, not the day before it (west of UTC)', () => {
    expect(weekdayName('2026-10-15', 'en-US')).toBe('Thu');
    expect(weekdayName('2026-10-16', 'en-US')).toBe('Fri');
    expect(weekdayName('2026-10-18', 'en-US', 'long')).toBe('Sunday');
  });
  it('says Today for today and the weekday for any other day', () => {
    expect(forecastDayLabel('2026-10-15', '2026-10-15', 'en-US')).toBe('Today');
    expect(forecastDayLabel('2026-10-17', '2026-10-15', 'en-US')).toBe('Sat');
  });
  it('is stable across a year boundary', () => {
    expect(weekdayName('2027-01-01', 'en-US')).toBe('Fri');
  });
});
