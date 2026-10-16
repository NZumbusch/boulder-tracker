import { describe, it, expect } from 'vitest';
import { formatClock, formatClockText, formatClockDate, formatHourLabel } from './timeFormat';

describe('formatClock', () => {
  it('24-hour is the default and pads', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(formatClock(18 * 60 + 30)).toBe('18:30');
    expect(formatClock(1440)).toBe('00:00');
  });
  it('12-hour: midnight and noon are 12', () => {
    expect(formatClock(0, true)).toBe('12:00 AM');
    expect(formatClock(12 * 60, true)).toBe('12:00 PM');
    expect(formatClock(12 * 60 + 15, true)).toBe('12:15 PM');
    expect(formatClock(9 * 60 + 5, true)).toBe('9:05 AM');
    expect(formatClock(18 * 60 + 30, true)).toBe('6:30 PM');
    expect(formatClock(23 * 60 + 59, true)).toBe('11:59 PM');
  });
});

describe('formatClockText', () => {
  it('converts a stored HH:MM and leaves other text alone', () => {
    expect(formatClockText('18:30')).toBe('18:30');
    expect(formatClockText('7:05')).toBe('07:05');
    expect(formatClockText('18:30', true)).toBe('6:30 PM');
    expect(formatClockText('evening', true)).toBe('evening');
    expect(formatClockText('', true)).toBe('');
  });
});

describe('formatClockDate', () => {
  const d = new Date(2026, 9, 16, 18, 30, 5);
  it('reads local time, with seconds if asked', () => {
    expect(formatClockDate(d)).toBe('18:30');
    expect(formatClockDate(d, false, true)).toBe('18:30:05');
    expect(formatClockDate(d, true)).toBe('6:30 PM');
    expect(formatClockDate(d, true, true)).toBe('6:30:05 PM');
  });
});

describe('formatHourLabel', () => {
  it('gutter labels', () => {
    expect(formatHourLabel(6)).toBe('6');
    expect(formatHourLabel(18, true)).toBe('6 PM');
    expect(formatHourLabel(0, true)).toBe('12 AM');
    expect(formatHourLabel(12, true)).toBe('12 PM');
  });
});
