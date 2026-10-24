import { describe, expect, it } from "vitest";
import { parseStravaCsv, parseStravaDate, planStravaImport } from "./stravaCsvImport";

const HEADER =
  "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Average Heart Rate,Calories";

const row = (cells: Record<number, string>) =>
  Array.from({ length: 23 }, (_, i) => cells[i] ?? "").join(",");

describe("parseStravaDate", () => {
  it("reads the export's UTC format", () => {
    expect(new Date(parseStravaDate("Oct 5, 2024, 6:30:00 AM")).toISOString()).toBe("2024-10-05T06:30:00.000Z");
    expect(new Date(parseStravaDate("Oct 5, 2024, 6:30:00 PM")).toISOString()).toBe("2024-10-05T18:30:00.000Z");
    expect(new Date(parseStravaDate("Jan 1, 2025, 12:05:00 AM")).toISOString()).toBe("2025-01-01T00:05:00.000Z");
    expect(new Date(parseStravaDate("Jan 1, 2025, 12:05:00 PM")).toISOString()).toBe("2025-01-01T12:05:00.000Z");
  });
  it("takes ISO dates and refuses anything else", () => {
    expect(new Date(parseStravaDate("2024-10-05T06:30:00Z")).toISOString()).toBe("2024-10-05T06:30:00.000Z");
    expect(parseStravaDate("5 Okt. 2024")).toBeNaN();
    expect(parseStravaDate("")).toBeNaN();
  });
});

describe("parseStravaCsv", () => {
  it("maps a run, preferring the detail columns (seconds, metres)", () => {
    const csv = [
      HEADER,
      row({ 0: "111", 1: '"Oct 5, 2024, 6:30:00 AM"', 2: "Morning run", 3: "Run", 4: '"easy, felt good"', 5: "3700", 6: "10.5", 7: "172", 15: "3650.0", 16: "3600", 17: "10512.3", 20: "88.4", 21: "151.2", 22: "640" }),
    ].join("\n");
    const { activities, skipped } = parseStravaCsv(csv);
    expect(skipped).toEqual([]);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: "strava-111",
      source: "strava",
      sourceId: "111",
      start: "2024-10-05T06:30:00.000Z",
      name: "Morning run",
      type: "Run",
      durationSec: 3650,
      distanceM: 10512,
      elevationM: 88,
      avgHr: 151,
      maxHr: 172,
      calories: 640,
      notes: "easy, felt good",
    });
  });

  it("falls back to the summary columns and drops empty ones", () => {
    const csv = [HEADER, row({ 0: "7", 1: '\"Oct 6, 2024, 9:00:00 AM\"', 2: "", 3: "Hike", 5: "5400", 6: "8" })].join("\n");
    const [a] = parseStravaCsv(csv).activities;
    expect(a.name).toBe("Hike");
    expect(a.durationSec).toBe(5400);
    expect(a.distanceM).toBe(8000);
    expect(a.avgHr).toBeUndefined();
    expect(a.maxHr).toBeUndefined();
    expect(a.notes).toBeUndefined();
  });

  it("skips rows it cannot place, and a repeated id, with the line", () => {
    const csv = [
      HEADER,
      row({ 0: "1", 1: "garbage", 3: "Run" }),
      row({ 0: "", 1: '\"Oct 5, 2024, 6:30:00 AM\"' }),
      row({ 0: "2", 1: '\"Oct 5, 2024, 6:30:00 AM\"', 3: "Run" }),
      row({ 0: "2", 1: '\"Oct 5, 2024, 6:30:00 AM\"', 3: "Run" }),
    ].join("\n");
    const { activities, skipped } = parseStravaCsv(csv);
    expect(activities.map((a) => a.id)).toEqual(["strava-2"]);
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 5]);
  });

  it("refuses a file that is not an activities.csv", () => {
    const { activities, skipped } = parseStravaCsv("date,difficulty\n2024-01-01,7A");
    expect(activities).toEqual([]);
    expect(skipped[0].line).toBe(1);
  });

  it("copes with a BOM and an empty file", () => {
    expect(parseStravaCsv("﻿" + [HEADER, row({ 0: "9", 1: '\"Oct 5, 2024, 6:30:00 AM\"' })].join("\n")).activities).toHaveLength(1);
    expect(parseStravaCsv("")).toEqual({ activities: [], skipped: [] });
  });
});

describe("planStravaImport", () => {
  it("adds only what is not stored yet", () => {
    const mk = (id: string) => ({ id, source: "strava" as const, sourceId: id, date: "2024-10-05", start: "", name: "", type: "Run", durationSec: 1 });
    const plan = planStravaImport([mk("strava-1")], [mk("strava-1"), mk("strava-2")]);
    expect(plan.add.map((a) => a.id)).toEqual(["strava-2"]);
    expect(plan.already).toBe(1);
  });
});
