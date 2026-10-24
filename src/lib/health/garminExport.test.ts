import { describe, expect, it } from "vitest";
import { describeValues, firstWins, garminDailyValues, garminTypeName, hrvFromFit, parseDailySummaries, parseHealthStatusHrv, parseMaxMet, parseSleep, parseSummarizedActivities, parseWeights, statsOfSummary } from "./garminExport";
import { planImport } from "./import";

describe("daily summaries", () => {
  const day = {
    calendarDate: "2026-10-01",
    restingHeartRate: 51,
    totalSteps: 10201,
    allDayStress: { aggregatorList: [{ type: "TOTAL", averageStressLevel: 32 }, { type: "AWAKE", averageStressLevel: 40 }] },
    bodyBattery: { bodyBatteryStatList: [{ bodyBatteryStatType: "HIGHEST", statsValue: 96 }, { bodyBatteryStatType: "LOWEST", statsValue: 12 }, { bodyBatteryStatType: "MOSTRECENT", statsValue: 40 }] },
  };

  it("reads resting HR, steps, stress and Body Battery", () => {
    expect(parseDailySummaries([day])).toEqual([
      { metricId: "rhr", date: "2026-10-01", value: 51 },
      { metricId: "steps", date: "2026-10-01", value: 10201 },
      { metricId: "stress", date: "2026-10-01", value: 32 },
      { metricId: "body-battery-high", date: "2026-10-01", value: 96 },
      { metricId: "body-battery-low", date: "2026-10-01", value: 12 },
    ]);
  });

  it("drops what was not measured (zero, -1, missing)", () => {
    const out = parseDailySummaries([{ calendarDate: "2026-10-02", restingHeartRate: 0, totalSteps: 0, allDayStress: { aggregatorList: [{ type: "TOTAL", averageStressLevel: -1 }] } }, { restingHeartRate: 50 }]);
    expect(out).toEqual([]);
  });
});

describe("sleep", () => {
  it("reads score, hours asleep (not awake), naps and breathing on the day the sleep ends", () => {
    const night = {
      calendarDate: "2026-10-01", deepSleepSeconds: 5400, lightSleepSeconds: 14400, remSleepSeconds: 5400, awakeSleepSeconds: 1800, averageRespiration: 14.2,
      sleepScores: { overallScore: 83 }, napList: [{ napTimeSec: 1800 }, { napTimeSec: 900 }],
    };
    expect(parseSleep([night])).toEqual([
      { metricId: "sleep-score", date: "2026-10-01", value: 83 },
      { metricId: "sleep-duration", date: "2026-10-01", value: 7 },
      { metricId: "nap-duration", date: "2026-10-01", value: 0.8 },
      { metricId: "breathing-sleep", date: "2026-10-01", value: 14.2 },
      { metricId: "sleep-deep", date: "2026-10-01", value: 90 },
      { metricId: "sleep-rem", date: "2026-10-01", value: 90 },
    ]);
  });

  it("skips entries with no night (only `retro`) and nights without a REM stage", () => {
    const out = parseSleep([{ retro: false }, { calendarDate: "2026-10-03", deepSleepSeconds: 3600, lightSleepSeconds: 3600, sleepScores: { overallScore: 40 } }]);
    expect(out.find((v) => v.metricId === "sleep-duration")?.value).toBe(2);
    expect(out.some((v) => v.date === "2026-10-03" && v.metricId === "sleep-score")).toBe(true);
    expect(out.every((v) => v.date === "2026-10-03")).toBe(true);
  });
});

describe("HRV, VO2max, weight", () => {
  it("takes HRV from the FIT nights first, the JSON for the rest", () => {
    const fit = hrvFromFit([{ t: Date.UTC(2026, 9, 1, 6, 0), lastNight: 83.4 }]);
    const json = parseHealthStatusHrv([
      { calendarDate: "2026-10-01", metrics: [{ type: "HRV", value: 90 }] },
      { calendarDate: "2026-10-02", metrics: [{ type: "HRV", value: 77 }, { type: "HR", value: 50 }] },
      { calendarDate: "2026-10-03", metrics: [{ type: "SPO2", status: "IN_RANGE" }] },
    ]);
    expect(firstWins(fit, json)).toEqual([
      { metricId: "hrv", date: "2026-10-01", value: 83 },
      { metricId: "hrv", date: "2026-10-02", value: 77 },
    ]);
  });

  it("keeps running VO2max only", () => {
    expect(parseMaxMet([{ calendarDate: "2026-10-01", sport: "RUNNING", vo2MaxValue: 58.6 }, { calendarDate: "2026-10-01", sport: "WALKING", vo2MaxValue: 40 }])).toEqual([
      { metricId: "vo2max", date: "2026-10-01", value: 58.6 },
    ]);
  });

  it("turns grams into kilograms, the last weighing of a day winning, and skips entries without one", () => {
    const out = parseWeights([
      { weight: { weight: 70200, timestampGMT: "2026-10-01T05:00:00.0" } },
      { weight: { weight: 69800, timestampGMT: "2026-10-01T19:00:00.0" } },
      { height: 180 },
    ]);
    expect(out).toEqual([{ metricId: "bodyweight", date: "2026-10-01", value: 69.8 }]);
  });
});

describe("garminDailyValues and describeValues", () => {
  it("merges the sources and summarises them for the preview", () => {
    const values = garminDailyValues({
      summaries: [{ calendarDate: "2026-10-01", restingHeartRate: 50 }, { calendarDate: "2026-10-02", restingHeartRate: 52 }],
      sleep: [], healthStatus: [], maxMet: [], bio: [],
      fitHrv: [{ t: Date.UTC(2026, 9, 2), lastNight: 80 }],
    });
    expect(describeValues(values)).toEqual([
      { metricId: "hrv", days: 1, from: "2026-10-02", to: "2026-10-02" },
      { metricId: "rhr", days: 2, from: "2026-10-01", to: "2026-10-02" },
    ]);
  });

  it("imports as garmin entries, never over a typed value or another source's", () => {
    const values = [{ metricId: "hrv", date: "2026-10-01", value: 80 }, { metricId: "hrv", date: "2026-10-02", value: 81 }, { metricId: "hrv", date: "2026-10-03", value: 82 }];
    const existing = [
      { id: "typed", metricId: "hrv", date: "2026-10-01", value: 70 },
      { id: "hc-hrv-2026-10-02", metricId: "hrv", date: "2026-10-02", value: 79, source: "health-connect" as const },
      { id: "garmin-hrv-2026-10-03", metricId: "hrv", date: "2026-10-03", value: 60, source: "garmin" as const },
    ];
    const plan = planImport(existing, values, "garmin");
    expect(plan.keptManual).toBe(2);
    expect(plan.upserts).toEqual([{ id: "garmin-hrv-2026-10-03", metricId: "hrv", date: "2026-10-03", value: 82, source: "garmin" }]);
    expect(planImport([], values, "garmin").upserts.map((u) => u.id)).toEqual(["garmin-hrv-2026-10-01", "garmin-hrv-2026-10-02", "garmin-hrv-2026-10-03"]);
  });
});

describe("activity summaries", () => {
  it("converts Garmin's units and names the type", () => {
    const [a] = parseSummarizedActivities([{
      summarizedActivitiesExport: [{
        activityId: 1, activityType: "running", startTimeGmt: 1792818162000, name: "Bern Running", duration: 2786514.9, movingDuration: 2752823, distance: 740938, elevationGain: 17385,
        avgHr: 148, maxHr: 185, calories: 2371.5, locationName: "Bern",
      }],
    }]);
    expect(a).toEqual({ startMs: 1792818162000, name: "Bern Running", type: "Run", durationSec: 2787, movingSec: 2753, distanceM: 7409, elevationM: 174, avgHr: 148, maxHr: 185, calories: 567, place: "Bern", activityId: 1 });
  });
  it("names unknown types in words and survives empty input", () => {
    expect(garminTypeName("badminton")).toBe("Badminton");
    expect(garminTypeName("open_water_swimming")).toBe("Swim");
    expect(garminTypeName(undefined)).toBe("Activity");
    expect(parseSummarizedActivities([{}])).toEqual([]);
  });
});

describe("what a summary says about how it went", () => {
  const summary = {
    hrTimeInZone_0: 0, hrTimeInZone_1: 60_000, hrTimeInZone_2: 180_000, hrTimeInZone_3: 540_000, hrTimeInZone_4: 300_000, hrTimeInZone_5: 6_000,
    trainingEffectLabel: "TEMPO", workoutRpe: 40, workoutFeel: 50, differenceBodyBattery: -5, avgDoubleCadence: 150.2, avgStrideLength: 110.4, elevationLoss: 20_000,
  };

  it("reads zone times (milliseconds), the label, rating, feel, Body Battery, cadence, stride and descent", () => {
    expect(statsOfSummary(summary)).toEqual({ zonesSec: [60, 180, 540, 300, 6], effectLabel: "tempo", rpe: 4, feel: 50, bodyBatteryDelta: -5, avgCadence: 150, strideCm: 110, descentM: 200 });
  });

  it("skips an unknown label, empty zones and nothing-to-say", () => {
    expect(statsOfSummary({ trainingEffectLabel: "UNKNOWN", hrTimeInZone_1: 0, hrTimeInZone_2: 0, hrTimeInZone_3: 0, hrTimeInZone_4: 0, hrTimeInZone_5: 0 })).toBeUndefined();
    expect(statsOfSummary({ hrTimeInZone_1: 1000 })?.zonesSec).toBeUndefined();
    expect(statsOfSummary({ trainingEffectLabel: "AEROBIC_BASE" })).toEqual({ effectLabel: "aerobic base" });
  });

  it("puts them on the parsed summary", () => {
    const [s] = parseSummarizedActivities([{ summarizedActivitiesExport: [{ startTimeGmt: 1_700_000_000_000, activityType: "running", workoutRpe: 30 }] }]);
    expect(s.stats).toEqual({ rpe: 3 });
  });
});
