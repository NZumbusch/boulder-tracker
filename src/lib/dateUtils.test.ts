import { describe, it, expect, afterEach } from "vitest";
import { getWeekDates, getWeekDateRange, toUtcDayIndex, incrementWeekId, decrementWeekId, localIsoDate, isoWeeksInYear, getWeekId, getWeekIdRange, weekDatesText, weekLabel, trainingDayIso, trainingDayDate, addDaysIso, weekMondayIso, weekSundayIso, weekDayIsos, weekIdOfIso, parseDay, formatWeek, formatDay } from "./dateUtils";

describe("getWeekDates", () => {
  it("returns the UTC Monday-start/Sunday-end for a mid-year week", () => {
    const dates = getWeekDates("2026-W12");
    expect(dates).not.toBeNull();
    expect(dates!.start.toISOString().split("T")[0]).toBe("2026-03-16");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2026-03-22");
  });

  it("handles a week-01 id that starts in the previous calendar year", () => {
    const dates = getWeekDates("2026-W01");
    expect(dates!.start.toISOString().split("T")[0]).toBe("2025-12-29");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2026-01-04");
  });

  it("handles a week-52 id that ends before the calendar year rolls over", () => {
    const dates = getWeekDates("2025-W52");
    expect(dates!.start.toISOString().split("T")[0]).toBe("2025-12-22");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2025-12-28");
  });

  it("returns null for a malformed week id", () => {
    expect(getWeekDates("not-a-week")).toBeNull();
    expect(getWeekDates("W1")).toBeNull();
  });
});

describe("getWeekDateRange (characterization - behaviour preserved across the getWeekDates extraction)", () => {
  it("formats a mid-year week", () => {
    expect(getWeekDateRange("2026-W12")).toBe("Mar 16 - Mar 22");
  });

  it("formats a week spanning a year boundary", () => {
    expect(getWeekDateRange("2026-W01")).toBe("Dec 29 - Jan 4");
  });

  it("returns an empty string for an empty or malformed id", () => {
    expect(getWeekDateRange("")).toBe("");
    expect(getWeekDateRange("garbage")).toBe("");
  });
});

describe("toUtcDayIndex", () => {
  it("is stable for a bare YYYY-MM-DD date", () => {
    expect(toUtcDayIndex("2026-03-02")).toBe(toUtcDayIndex("2026-03-02"));
  });

  it("puts a timestamp on the local calendar day it happened on - the same day as that bare date", () => {
    // Built from local times, so this holds in any timezone: a session that
    // ended at 00:30 counts on that day, not (via its UTC date) the one before.
    const day = toUtcDayIndex("2026-03-02");
    expect(toUtcDayIndex(new Date(2026, 2, 2, 0, 30).toISOString())).toBe(day);
    expect(toUtcDayIndex(new Date(2026, 2, 2, 23, 59).toISOString())).toBe(day);
  });

  it("increases by exactly 1 per UTC calendar day, including across a month boundary", () => {
    expect(toUtcDayIndex("2026-03-01")).toBe(toUtcDayIndex("2026-02-28") + 1);
  });

  it("is unaffected by DST transitions (a plain UTC day-count, not local time)", () => {
    // US DST started 2026-03-08; a naive local-time day-diff would misfire here.
    expect(toUtcDayIndex("2026-03-09")).toBe(toUtcDayIndex("2026-03-08") + 1);
  });
});

describe("decrementWeekId", () => {
  it("is incrementWeekId's exact inverse for a mid-year week", () => {
    expect(decrementWeekId("2026-W26")).toBe("2026-W25");
    expect(incrementWeekId(decrementWeekId("2026-W26"))).toBe("2026-W26");
  });

  it("rolls under into the previous year at week 01", () => {
    expect(decrementWeekId("2026-W01")).toBe("2025-W52");
  });

  it("returns a malformed id unchanged", () => {
    expect(decrementWeekId("garbage")).toBe("garbage");
  });
});

describe("localIsoDate", () => {
  it("is the local calendar date, also just after midnight", () => {
    expect(localIsoDate(new Date(2026, 8, 28, 0, 30))).toBe("2026-09-28");
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("53-week years", () => {
  it("knows which years have a week 53", () => {
    expect([2020, 2026, 2032].map(isoWeeksInYear)).toEqual([53, 53, 53]);
    expect([2024, 2025, 2027].map(isoWeeksInYear)).toEqual([52, 52, 52]);
  });

  it("steps through 2026-W53 in both directions", () => {
    expect(incrementWeekId("2026-W52")).toBe("2026-W53");
    expect(incrementWeekId("2026-W53")).toBe("2027-W01");
    expect(decrementWeekId("2027-W01")).toBe("2026-W53");
    expect(getWeekIdRange("2026-W52", "2027-W01")).toEqual(["2026-W52", "2026-W53", "2027-W01"]);
  });

  it("agrees with the calendar for ten years of weeks", () => {
    let week = "2024-W01";
    for (let i = 0; i < 520; i++) {
      const start = getWeekDates(week)!.start;
      const oneWeekLater = getWeekId(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7, 12));
      expect(incrementWeekId(week)).toBe(oneWeekLater);
      expect(decrementWeekId(oneWeekLater)).toBe(week);
      week = oneWeekLater;
    }
  });
});

describe('weekDatesText / weekLabel', () => {
  it('spells a week and a run of weeks out in plain English', () => {
    expect(weekDatesText('2026-W40')).toBe('28 Sep – 4 Oct 2026');
    expect(weekDatesText('2026-W41')).toBe('5 – 11 Oct 2026');
    expect(weekDatesText('2026-W38', '2026-W41')).toBe('14 Sep – 11 Oct 2026');
    expect(weekDatesText('2025-W52', '2026-W02')).toBe('22 Dec 2025 – 11 Jan 2026');
    expect(weekDatesText('nonsense')).toBe('');
  });
  it('labels a week id with its dates', () => {
    expect(weekLabel('2026-W40')).toBe('2026-W40 (28 Sep – 4 Oct 2026)');
    expect(weekLabel('x')).toBe('x');
  });
});

describe("week dates west of UTC", () => {
  const original = process.env.TZ;
  afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });

  it.each(["America/Los_Angeles", "America/New_York", "America/Sao_Paulo", "Europe/Berlin", "Asia/Tokyo"])("shows Monday to Sunday in %s", (tz) => {
    process.env.TZ = tz;
    expect(getWeekDateRange("2026-W41")).toBe("Oct 5 - Oct 11");
  });
});

describe("trainingDayIso", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);
  it("stays on the day before until the start hour", () => {
    expect(trainingDayIso(at(0, 40), 4)).toBe("2026-10-06");
    expect(trainingDayIso(at(3, 59), 4)).toBe("2026-10-06");
    expect(trainingDayIso(at(4, 0), 4)).toBe("2026-10-07");
    expect(trainingDayIso(at(23, 30), 4)).toBe("2026-10-07");
  });
  it("is plain calendar days with a start hour of 0", () => {
    expect(trainingDayIso(at(0, 40), 0)).toBe("2026-10-07");
  });
  it("moves the week over on Monday morning, not at midnight", () => {
    const mondayEarly = new Date(2026, 9, 12, 0, 30);
    expect(getWeekId(trainingDayDate(mondayEarly, 4))).toBe("2026-W41");
    expect(getWeekId(trainingDayDate(mondayEarly, 0))).toBe("2026-W42");
  });
});

describe("days as ISO dates", () => {
  it("gives a week's Monday, Sunday and seven days", () => {
    expect(weekMondayIso("2026-W41")).toBe("2026-10-05");
    expect(weekSundayIso("2026-W41")).toBe("2026-10-11");
    expect(weekDayIsos("2026-W41")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(weekMondayIso("nonsense")).toBe("");
    expect(weekDayIsos("nonsense")).toEqual([]);
  });

  it("knows the week a day falls in, across New Year and week 53", () => {
    expect(weekIdOfIso("2026-10-05")).toBe("2026-W41");
    expect(weekIdOfIso("2026-10-11")).toBe("2026-W41");
    expect(weekIdOfIso("2026-12-31")).toBe("2026-W53");
    expect(weekIdOfIso("2027-01-03")).toBe("2026-W53");
    expect(weekIdOfIso("2027-01-04")).toBe("2027-W01");
    expect(weekIdOfIso("2024-12-30")).toBe("2025-W01");
  });

  it("round-trips: every day of every week of several years lands in its own week", () => {
    for (let id = "2024-W01"; id < "2029-W01"; id = incrementWeekId(id)) {
      for (const day of weekDayIsos(id)) expect(weekIdOfIso(day)).toBe(id);
    }
  });

  it("adds days across month ends, leap days and daylight-saving changes", () => {
    expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDaysIso("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe('parseDay / formatWeek / formatDay', () => {
  it('reads a bare day as that day in any time zone', () => {
    const d = parseDay('2026-10-15');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 15]);
    expect(parseDay(new Date(2020, 0, 1)).getFullYear()).toBe(2020);
    expect(parseDay('2026-10-15T23:30:00.000Z').getTime()).toBe(new Date('2026-10-15T23:30:00.000Z').getTime());
  });

  it('writes a week number one way', () => {
    expect(formatWeek('2026-W42')).toBe('Week 42');
    expect(formatWeek('2026-W07', 'short')).toBe('W7');
    expect(formatWeek('not a week')).toBe('not a week');
  });

  it('writes a day without the year unless it is another year', () => {
    const now = new Date(2026, 9, 15);
    expect(formatDay('2026-10-14', { now })).toMatch(/14/);
    expect(formatDay('2026-10-14', { now })).not.toMatch(/2026/);
    expect(formatDay('2025-12-31', { now })).toMatch(/2025/);
    expect(formatDay('2026-10-14', { now, year: true })).toMatch(/2026/);
    expect(formatDay('2026-10-14', { now, weekday: 'short' })).toMatch(/Wed/);
    expect(formatDay('garbage')).toBe('garbage');
  });
});
