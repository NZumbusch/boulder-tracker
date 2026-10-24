import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, ExternalActivity } from "../types";
import { DEFAULT_AI_FIELDS, aiFields, type AIFields } from "../preferences/migrate";
import { activityDigest, digestLegend, mmss } from "./activityDigest";
import { buildOtherTrainingContext, buildRecoveryContext } from "./wellnessContext";

const bins = new Array(11).fill(0);
bins[4] = 1800; // 130-139 bpm
bins[8] = 300; // 170-179

const run: ExternalActivity = {
  id: "garmin-1", source: "garmin", sourceId: "1", date: "2026-10-20", start: "2026-10-20T06:30:00.000Z", name: "Run", type: "Run",
  durationSec: 2400, movingSec: 2400, distanceM: 8000, elevationM: 85, avgHr: 150, maxHr: 178,
  stats: { splitsSec: [300, 302, 296, 310, 305, 298, 301, 299], paceDriftPct: 4, hrDriftBpm: 6, hrBinsSec: bins, descentM: 83, avgCadence: 172, avgPowerW: 210, avgTempC: 14, effectLabel: "tempo", rpe: 4, feel: 50, bodyBatteryDelta: -5, strideCm: 110 },
};
const all: AIFields = { ...DEFAULT_AI_FIELDS, terrain: true };
const none = { pace: false, zones: false, effect: false, terrain: false };

describe("activityDigest", () => {
  it("formats minutes and seconds", () => {
    expect(mmss(312)).toBe("5:12");
    expect(mmss(59.6)).toBe("1:00");
    expect(mmss(3605)).toBe("60:05");
  });

  it("gives pace, splits, drift, zones, effect and terrain as short strings", () => {
    expect(activityDigest(run, all, 190)).toEqual({
      pace: "5:00/km",
      kmSplits: "5:00 5:02 4:56 5:10 5:05 4:58 5:01 4:59",
      drift: "second half 4 % slower, heart rate +6 bpm",
      zonesMin: "Z3 30 · Z5 5",
      garminEffect: "trained: tempo, my rating 4/10, felt normal, Body Battery -5",
      terrain: "ascent 85 m, descent 83 m, cadence 172, stride 110 cm, power 210 W, 14 °C",
    });
  });

  it("is empty with every group off, and each group adds only its own keys", () => {
    expect(activityDigest(run, none, 190)).toEqual({});
    expect(Object.keys(activityDigest(run, { ...none, pace: true }, 190)).sort()).toEqual(["drift", "kmSplits", "pace"]);
    expect(Object.keys(activityDigest(run, { ...none, zones: true }, 190))).toEqual(["zonesMin"]);
    expect(Object.keys(activityDigest(run, { ...none, effect: true }, 190))).toEqual(["garminEffect"]);
    expect(Object.keys(activityDigest(run, { ...none, terrain: true }, 190))).toEqual(["terrain"]);
  });

  it("leaves out a small drift, and speaks of speed for a ride", () => {
    const ride = { ...run, type: "Ride", stats: { paceDriftPct: 1, hrDriftBpm: 1 } };
    const d = activityDigest(ride, { ...none, pace: true }, 190);
    expect(d).toEqual({ pace: "12.0 km/h" });
  });

  it("shows an interval workout's laps and cuts a long run's splits", () => {
    const intervals = { ...run, stats: { laps: [{ sec: 600 }, { sec: 240, m: 1000, hr: 170 }] } };
    expect(activityDigest(intervals, { ...none, pace: true }, 190).laps).toBe("10:00 | 4:00 1000 m 170 bpm");
    const long = { ...run, stats: { splitsSec: Array.from({ length: 42 }, () => 300) } };
    expect(activityDigest(long, { ...none, pace: true }, 190).kmSplits!.endsWith("...")).toBe(true);
  });

  it("explains only the keys that are there", () => {
    expect(digestLegend(new Set())).toBe("");
    expect(digestLegend(new Set(["pace", "drift"]))).toContain("drift compares the second half");
    expect(digestLegend(new Set(["pace"]))).not.toContain("zonesMin");
  });
});

describe("the activity list carries the digest at list detail only", () => {
  const asOf = new Date("2026-10-24T12:00:00Z");
  const window = { fullWeeks: 2, summaryWeeks: 0 };

  it("adds it per activity in list detail, with its legend", () => {
    const out = buildOtherTrainingContext([run], asOf, "list", window, undefined, DEFAULT_AI_FIELDS)!;
    expect(out.activities![0]).toMatchObject({ date: "2026-10-20", type: "Run", pace: "5:00/km", zonesMin: "Z3 30 · Z5 5" });
    expect(out.about).toContain("kmSplits are minutes:seconds");
    expect(out.activities![0]).not.toHaveProperty("terrain");
  });

  it("is the same as before in summary detail, and with every group off", () => {
    expect(buildOtherTrainingContext([run], asOf, "summary", window)!.activities).toBeUndefined();
    const off = buildOtherTrainingContext([run], asOf, "list", window, undefined, { ...DEFAULT_AI_FIELDS, pace: false, zones: false, effect: false })!;
    expect(Object.keys(off.activities![0]).sort()).toEqual(["avgHr", "date", "km", "load", "minutes", "type"]);
    expect(off.about).not.toContain("kmSplits");
  });
});

describe("recovery data with the daily switches", () => {
  const asOf = new Date("2026-10-24T12:00:00Z");
  const entry = (metricId: string, value: number): DailyMetricEntry => ({ id: `${metricId}`, metricId, date: "2026-10-24", value }) as DailyMetricEntry;
  const entries = [entry("sleep-score", 80), entry("vo2max", 55.2), entry("sleep-deep", 70), entry("sleep-rem", 95)];

  it("sends VO2max and sleep stages by default", () => {
    const r = buildRecoveryContext(entries, asOf, "brief", 4, aiFields())!;
    expect(r.lastNight).toMatchObject({ sleepScore: 80, vo2max: 55.2, deepSleepMin: 70, remSleepMin: 95 });
  });

  it("leaves a group out when its switch is off", () => {
    const off = buildRecoveryContext(entries, asOf, "brief", 4, { ...DEFAULT_AI_FIELDS, vo2max: false, sleepStages: false })!;
    expect(Object.keys(off.lastNight!).sort()).toEqual(["date", "sleepScore"]);
  });
});
