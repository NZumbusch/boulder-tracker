import { describe, it, expect } from "vitest";
import { getWeekDates, getWeekDateRange, toUtcDayIndex, incrementWeekId, decrementWeekId, localIsoDate, isoWeeksInYear, getWeekId, getWeekIdRange } from "./dateUtils";

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
