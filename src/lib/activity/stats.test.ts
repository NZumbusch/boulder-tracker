import { describe, expect, it } from "vitest";
import type { FitPoint } from "./fit";
import { readFitActivity } from "./fit";
import { FitWriter, fitTime, type FieldDef } from "./fitBuilder.testutil";
import { computeStats, STATS_VERSION, statsNewer, zonesFromPoints, hrBins, hrDrift, kmSplits, paceDrift, timeAndDistance, workoutLaps, zoneMinutes, mergeStats } from "./stats";

const T0 = Date.UTC(2026, 9, 5, 6, 30, 0);

/** A run at a pace given per second of the recording: metres per second as a function of the second. */
function run(seconds: number, speed: (s: number) => number, hr: (s: number) => number = () => 150, withDistance = true): FitPoint[] {
  const points: FitPoint[] = [];
  let d = 0;
  for (let s = 0; s <= seconds; s++) {
    points.push({ t: T0 + s * 1000, hr: hr(s), ...(withDistance ? { d } : { lat: 46.5 + d / 111_320, lon: 7.5 }) });
    d += speed(s);
  }
  return points;
}

describe("splits, drift and heart-rate bins", () => {
  it("splits an even 5:00/km run into 300-second kilometres", () => {
    const p = run(1810, () => 1000 / 300);
    const td = timeAndDistance(p)!;
    expect(kmSplits(td.t, td.d)).toEqual([300, 300, 300, 300, 300, 300]);
  });

  it("finds a fade: a second half 10 % slower reads as +10", () => {
    // 4:00/km for 12 min, then 4:24/km for 13.2 min: equal distances, the second slower by 10 %.
    const p = run(1512, (s) => (s < 720 ? 1000 / 240 : 1000 / 264));
    const td = timeAndDistance(p)!;
    expect(paceDrift(td.t, td.d)).toBe(10);
  });

  it("gives no drift for a short recording", () => {
    const td = timeAndDistance(run(600, () => 3))!;
    expect(paceDrift(td.t, td.d)).toBeUndefined();
  });

  it("works along the GPS line when the device gave no distance", () => {
    const td = timeAndDistance(run(1200, () => 3.5, () => 150, false))!;
    expect(td.d[td.d.length - 1]).toBeGreaterThan(4000);
    expect(kmSplits(td.t, td.d).length).toBeGreaterThanOrEqual(4);
  });

  it("measures heart-rate drift between the halves", () => {
    expect(hrDrift(run(1200, () => 3, (s) => (s < 600 ? 140 : 150)))).toBe(10);
    expect(hrDrift(run(300, () => 3))).toBeUndefined();
  });

  it("counts the seconds at each heart rate", () => {
    const bins = hrBins(run(600, () => 3, (s) => (s < 300 ? 95 : 165)))!;
    expect(bins).toHaveLength(11);
    expect(bins[0]).toBeGreaterThanOrEqual(299);
    expect(bins[7]).toBeGreaterThanOrEqual(299);
    expect(hrBins([{ t: T0 }, { t: T0 + 1000 }])).toBeUndefined();
  });

  it("turns the bins into minutes per zone with the highest heart rate", () => {
    // 10 minutes at 135 (bin 100+30..: 130-139) and 5 at 175, with a maximum of 190: 135/190 = 71 % = Z3, 175/190 = 92 % = Z5.
    const bins = new Array(11).fill(0);
    bins[4] = 600;
    bins[8] = 300;
    expect(zoneMinutes({ hrBinsSec: bins }, 190)).toEqual([0, 0, 10, 0, 5]);
    expect(zoneMinutes(undefined, 190)).toBeUndefined();
    // Garmin's own zone seconds win over the bins.
    expect(zoneMinutes({ hrBinsSec: bins, zonesSec: [600, 1200, 0, 0, 60] }, 190)).toEqual([10, 20, 0, 0, 1]);
  });
});

describe("workout laps", () => {
  it("keeps a workout's own laps and drops automatic per-km laps", () => {
    const intervals = [{ elapsedSec: 600 }, { elapsedSec: 240, distanceM: 1000, avgHr: 170 }, { elapsedSec: 90, distanceM: 200 }, { elapsedSec: 240, distanceM: 1000, avgHr: 172 }];
    expect(workoutLaps(intervals)).toHaveLength(4);
    const auto = [1, 2, 3, 4, 5].map(() => ({ elapsedSec: 300, distanceM: 1000, avgHr: 150 }));
    expect(workoutLaps(auto)).toBeUndefined();
    expect(workoutLaps([{ elapsedSec: 1000 }])).toBeUndefined();
  });
});

describe("computeStats", () => {
  it("gives splits and pace drift for a run but only the heart-rate shape for a ride", () => {
    const p = run(1810, () => 1000 / 300, (s) => 140 + s / 100);
    const asRun = computeStats(p, "Run")!;
    expect(asRun.splitsSec).toHaveLength(6);
    expect(asRun.paceDriftPct).toBe(0);
    expect(asRun.hrDriftBpm).toBe(9);
    expect(asRun.hrBinsSec).toBeDefined();
    const asRide = computeStats(p, "Ride")!;
    expect(asRide.splitsSec).toBeUndefined();
    expect(asRide.paceDriftPct).toBeUndefined();
    expect(asRide.hrBinsSec).toBeDefined();
  });

  it("is nothing for a recording with nothing in it", () => {
    expect(computeStats([{ t: T0 }, { t: T0 + 1000 }], "Run")).toBeUndefined();
  });

  it("merges: the recording wins, the summary fills what it lacks", () => {
    expect(mergeStats({ trainingEffect: 3.1 }, { trainingEffect: 2.5, rpe: 4 })).toEqual({ v: STATS_VERSION, trainingEffect: 3.1, rpe: 4 });
    expect(mergeStats(undefined, { rpe: 4 })).toEqual({ v: STATS_VERSION, rpe: 4 });
  });
});

describe("a FIT file's extras", () => {
  const REC: FieldDef[] = [
    { num: 253, size: 4, base: 0x86 },
    { num: 3, size: 1, base: 0x02 },
    { num: 5, size: 4, base: 0x86 },
    { num: 73, size: 4, base: 0x86 },
    { num: 4, size: 1, base: 0x02 },
    { num: 13, size: 1, base: 0x01 },
  ];
  const LAP: FieldDef[] = [
    { num: 253, size: 4, base: 0x86 },
    { num: 7, size: 4, base: 0x86 },
    { num: 9, size: 4, base: 0x86 },
    { num: 15, size: 1, base: 0x02 },
  ];
  const SESSION: FieldDef[] = [
    { num: 253, size: 4, base: 0x86 },
    { num: 2, size: 4, base: 0x86 },
    { num: 5, size: 1, base: 0x00 },
    { num: 7, size: 4, base: 0x86 },
    { num: 18, size: 1, base: 0x02 },
    { num: 20, size: 2, base: 0x84 },
    { num: 23, size: 2, base: 0x84 },
    { num: 24, size: 1, base: 0x02 },
    { num: 137, size: 1, base: 0x02 },
    { num: 57, size: 1, base: 0x01 },
    { num: 125, size: 4, base: 0x86 },
  ];

  it("reads speed, distance, cadence and temperature per record, and the laps and session extras", () => {
    const w = new FitWriter();
    w.define(0, 20, REC);
    for (let i = 0; i < 3; i++) w.data(0, REC, [fitTime(T0) + i, 150, i * 300, 3333, 172, 14]);
    w.define(1, 19, LAP);
    w.data(1, LAP, [fitTime(T0) + 3, 600_000, 200_000, 160]);
    w.define(2, 18, SESSION);
    w.data(2, SESSION, [fitTime(T0) + 3, fitTime(T0), 1, 3000, 176, 210, 38, 32, 14, 16, 4500]);
    const a = readFitActivity(w.build())!;
    expect(a.points[1]).toMatchObject({ d: 3, speed: 3.333, cad: 172, temp: 14 });
    expect(a.laps).toEqual([{ elapsedSec: 600, distanceM: 2000, avgHr: 160 }]);
    expect(a).toMatchObject({ avgCadence: 176, avgPowerW: 210, descentM: 38, trainingEffect: 3.2, anaerobicEffect: 1.4, avgTempC: 16, maxSpeed: 4.5 });
  });
});

describe("an imported activity", () => {
  it("carries its stats, and a Garmin summary adds training effect and load where the recording has none", async () => {
    const { activityFromRecording, decodeRecording } = await import("../importers/activityFiles");
        const REC2: FieldDef[] = [{ num: 253, size: 4, base: 0x86 }, { num: 3, size: 1, base: 0x02 }, { num: 5, size: 4, base: 0x86 }];
    const SESSION2: FieldDef[] = [{ num: 253, size: 4, base: 0x86 }, { num: 2, size: 4, base: 0x86 }, { num: 5, size: 1, base: 0x00 }, { num: 7, size: 4, base: 0x86 }];
    const w = new FitWriter();
    w.define(0, 20, REC2);
    for (let s = 0; s <= 1210; s += 10) w.data(0, REC2, [fitTime(T0) + s, 150, Math.round((s * 1000) / 300) * 100]);
    w.define(1, 18, SESSION2);
    w.data(1, SESSION2, [fitTime(T0) + 1210, fitTime(T0), 1, 1_210_000]);
    const rec = (await decodeRecording("a.fit", w.build()))!;
    const activity = activityFromRecording(rec, "garmin")!;
    expect(activity.type).toBe("Run");
    expect(activity.stats?.splitsSec).toHaveLength(4);
    expect(activity.stats?.hrBinsSec).toBeDefined();

    expect(activity.stats?.v).toBe(STATS_VERSION);
  });
});

describe("zones from Garmin's limits", () => {
  it("counts the seconds from each reading to the next in the zone its heart rate falls in, below zone 1 not at all", () => {
    const floors = [105, 126, 147, 168, 189];
    const p = run(600, () => 3, (s) => (s < 100 ? 90 : s < 300 ? 130 : s < 500 ? 170 : 195));
    const z = zonesFromPoints(p, floors)!;
    expect(z[1]).toBeGreaterThanOrEqual(199);
    expect(z[3]).toBeGreaterThanOrEqual(199);
    expect(z[4]).toBeGreaterThanOrEqual(99);
    expect(z[0] + z[2]).toBe(0);
    expect(zonesFromPoints(p, [1, 2, 3])).toBeUndefined();
    expect(computeStats(p, "Run", undefined, { zoneFloors: floors })?.zonesSec).toEqual(z);
  });

  it("makes a stored activity refreshable by a newer version of the stats only", () => {
    expect(statsNewer(undefined, { rpe: 3 })).toBe(true);
    expect(statsNewer({ v: 1 }, { v: STATS_VERSION })).toBe(true);
    expect(statsNewer({ v: STATS_VERSION }, { v: STATS_VERSION })).toBe(false);
    expect(statsNewer({ v: STATS_VERSION }, undefined)).toBe(false);
  });

  it("doubles a runner's cadence from the file (one foot) and leaves a ride's alone", () => {
    const p = run(1200, () => 3);
    const fit = { startMs: T0, elapsedSec: 1200, laps: [], points: p, avgCadence: 80 } as never;
    expect(computeStats(p, "Run", fit)?.avgCadence).toBe(160);
    expect(computeStats(p, "Ride", fit)?.avgCadence).toBe(80);
  });
});
