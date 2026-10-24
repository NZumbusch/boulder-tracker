import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration, formatPaceOrSpeed, summaryLine } from "./format";

describe("format", () => {
  it("durations", () => {
    expect(formatDuration(0)).toBe("–");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(42 * 60)).toBe("42 min");
    expect(formatDuration(65 * 60)).toBe("1 h 05 min");
  });
  it("distances", () => {
    expect(formatDistance(10512)).toBe("10.5 km");
    expect(formatDistance(120_000)).toBe("120 km");
    expect(formatDistance(1609.344, true)).toBe("1.0 mi");
  });
  it("pace on foot, speed otherwise", () => {
    expect(formatPaceOrSpeed({ type: "Run", distanceM: 10_000, durationSec: 3000 })).toBe("5:00 /km");
    expect(formatPaceOrSpeed({ type: "Run", distanceM: 10_000, movingSec: 2999.6 as number, durationSec: 3200 })).toBe("5:00 /km");
    expect(formatPaceOrSpeed({ type: "Ride", distanceM: 30_000, durationSec: 3600 })).toBe("30.0 km/h");
    expect(formatPaceOrSpeed({ type: "Run", distanceM: 50, durationSec: 30 })).toBeUndefined();
    expect(formatPaceOrSpeed({ type: "Run", durationSec: 30 })).toBeUndefined();
  });
  it("summary skips what is missing", () => {
    const base = { id: "x", source: "strava" as const, sourceId: "x", date: "", start: "", name: "", type: "Weight Training", durationSec: 3600 };
    expect(summaryLine(base)).toBe("Weight Training · 1 h 00 min");
  });
});
