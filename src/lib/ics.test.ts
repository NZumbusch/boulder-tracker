import { describe, it, expect } from "vitest";
import { generateICS, getDateFromWeekId, exportWeekIds } from "./ics";
import type { Workout } from "./types";

const workout = (over: Partial<Workout>): Workout =>
  ({ id: "w1", weekId: "2026-W41", dayOfWeek: "Monday", exercises: [], plannedDuration: 180, status: "planned", date: null, loadFactor: 0, ...over }) as Workout;

const NOW = new Date("2026-10-13T10:20:30Z");
const lines = (ics: string) => ics.split("\r\n");
const line = (ics: string, key: string) => lines(ics).find((l) => l.startsWith(`${key}:`))!.slice(key.length + 1);

describe("generateICS", () => {
  it("ends an event its planned duration after it starts", () => {
    const ics = generateICS([workout({ startTime: "18:00" })]);
    expect(line(ics, "DTSTART")).toBe("20261005T180000");
    expect(line(ics, "DTEND")).toBe("20261005T210000");
  });

  it("rolls over midnight", () => {
    const ics = generateICS([workout({ startTime: "23:00", plannedDuration: 90 })]);
    expect(line(ics, "DTEND")).toBe("20261006T003000");
  });

  it("falls back to noon for a session with no start time", () => {
    const ics = generateICS([workout({ plannedDuration: 60 })]);
    expect(line(ics, "DTSTART")).toBe("20261005T120000");
    expect(line(ics, "DTEND")).toBe("20261005T130000");
  });

  it("dates a planned session by its week and day, not by when it was created", () => {
    const ics = generateICS([workout({ dayOfWeek: "Thursday", date: "2026-01-02T08:00:00.000Z", startTime: "18:00" })]);
    expect(line(ics, "DTSTART")).toBe("20261008T180000");
  });

  it("leaves out a planned session with no day", () => {
    expect(generateICS([workout({ dayOfWeek: undefined })])).not.toContain("BEGIN:VEVENT");
  });

  it("puts a finished session on the day it happened, for as long as it took", () => {
    const done = workout({
      status: "completed", dayOfWeek: "Monday", startTime: "18:00", plannedDuration: 60, actualDuration: 95,
      date: new Date(2026, 9, 7, 19, 40).toISOString(),
    });
    const ics = generateICS([done]);
    expect(line(ics, "DTSTART")).toBe("20261007T180000");
    expect(line(ics, "DTEND")).toBe("20261007T193500");
  });

  it("escapes what the format reserves and keeps one line per property", () => {
    const ics = generateICS([workout({ notes: "Pull, push; core\\x", description: "line one\nline two" })]);
    expect(line(ics, "SUMMARY")).toBe("Pull\\, push\; core\\\\x");
    expect(line(ics, "DESCRIPTION")).toBe("line one\\nline two");
  });

  it("folds long lines at 75 bytes without breaking a character", () => {
    const ics = generateICS([workout({ notes: "ä".repeat(60) })]);
    for (const l of lines(ics)) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    // Unfolding gives the full text back.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"ä".repeat(60)}`);
  });

  it("stamps in UTC", () => {
    expect(line(generateICS([workout({})], { now: NOW }), "DTSTAMP")).toBe("20261013T102030Z");
  });

  it("lists the exercises in the description", () => {
    const ics = generateICS(
      [workout({ exercises: [{ id: "s1", typeId: "t1", prescribed: {} }, { id: "s2", typeId: "t1", prescribed: {} }] as Workout["exercises"] })],
      { exerciseTypes: [{ id: "t1", name: "Hangboard" }] as never },
    );
    expect(line(ics, "DESCRIPTION")).toContain("Hangboard ×2");
  });
});

describe("getDateFromWeekId", () => {
  it("is local midnight of that day, also across a daylight-saving change", () => {
    for (const [day, date] of [["Monday", 19], ["Wednesday", 21], ["Sunday", 25]] as const) {
      const d = getDateFromWeekId("2026-W43", day);
      expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, date, 0]);
    }
    const next = getDateFromWeekId("2026-W44", "Monday");
    expect([next.getMonth(), next.getDate(), next.getHours()]).toEqual([9, 26, 0]);
  });
});

describe("exportWeekIds", () => {
  const blocks = [{ startWeekId: "2026-W40", endWeekId: "2026-W45" }];
  it("covers this week to the end of the plan", () => {
    expect(exportWeekIds({ currentWeekId: "2026-W42", workouts: [], blocks, includePast: false })).toEqual([
      "2026-W42", "2026-W43", "2026-W44", "2026-W45",
    ]);
  });
  it("reaches back to the first logged session when asked", () => {
    const ids = exportWeekIds({ currentWeekId: "2026-W42", workouts: [workout({ weekId: "2026-W38" })], blocks, includePast: true });
    expect(ids[0]).toBe("2026-W38");
    expect(ids.at(-1)).toBe("2026-W45");
  });
  it("keeps the current week when the plan ends before it", () => {
    expect(exportWeekIds({ currentWeekId: "2026-W50", workouts: [], blocks, includePast: false })).toEqual(["2026-W50"]);
  });
});
