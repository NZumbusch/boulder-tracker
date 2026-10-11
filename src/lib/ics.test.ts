import { describe, it, expect } from "vitest";
import { generateICS } from "./ics";
import type { Workout } from "./types";

const workout = (over: Partial<Workout>): Workout =>
  ({ id: "w1", weekId: "2026-W41", dayOfWeek: "Monday", exercises: [], plannedDuration: 180, ...over }) as Workout;

const line = (ics: string, key: string) => ics.split("\r\n").find((l) => l.startsWith(`${key}:`))!.slice(key.length + 1);

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
});
