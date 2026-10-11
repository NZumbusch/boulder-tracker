import { describe, it, expect } from "vitest";
import { bestWindow, summarizeRecentRain, type HourlyPoint } from "./conditions";

const hour = (time: string, tempC: number, extra: Partial<HourlyPoint> = {}): HourlyPoint => ({ time, tempC, humidityPercent: 50, dewPointC: tempC - 8, ...extra });

describe("summarizeRecentRain", () => {
  it("totals the last 24 and 72 hours and finds the most recent rain", () => {
    // 72 hourly points, oldest first; rain 60h ago (3mm) and 10h ago (2mm).
    const past = Array.from({ length: 72 }, (_, i) => hour(`t${i}`, 10, { precipitationMm: 0 }));
    past[72 - 60].precipitationMm = 3;
    past[72 - 10].precipitationMm = 2;
    expect(summarizeRecentRain(past)).toEqual({ last24hMm: 2, last72hMm: 5, hoursSinceRain: 10 });
  });

  it("reports no rain when there was none", () => {
    expect(summarizeRecentRain([hour("t", 10, { precipitationMm: 0.05 })])).toEqual({ last24hMm: 0.1, last72hMm: 0.1, hoursSinceRain: undefined });
  });
});

describe("bestWindow", () => {
  const today = "2026-09-23";
  const hours = [
    hour(`${today}T14:00`, 16),
    hour(`${today}T15:00`, 15),
    hour(`${today}T16:00`, 13),
    hour(`${today}T17:00`, 11),
    hour(`${today}T18:00`, 10),
    hour(`${today}T19:00`, 9),
    hour(`${today}T20:00`, 8),
    hour("2026-09-24T06:00", 2),
  ];

  it("finds the coolest dry three hours before the cut-off", () => {
    const w = bestWindow(hours, today, `${today}T19:10`);
    expect(w?.start).toBe("16:00");
    expect(w?.end).toBe("19:00");
  });

  it("uses the rest of the day when there's no cut-off, and never tomorrow", () => {
    expect(bestWindow(hours, today)?.start).toBe("18:00");
  });

  it("skips wet hours and returns nothing without a dry stretch", () => {
    const wet = hours.map((h) => ({ ...h, precipitationChance: 80 }));
    expect(bestWindow(wet, today)).toBeUndefined();
  });
});
