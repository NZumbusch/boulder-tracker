import { describe, expect, it } from "vitest";
import type { DailyMetricEntry, ExternalActivity } from "../types";
import { AI_FIELD_KEYS } from "../preferences/migrate";
import { AI_FIELD_INFO, fieldCosts } from "./fieldSwitches";

const run: ExternalActivity = {
  id: "g1", source: "garmin", sourceId: "1", date: "2026-10-20", start: "2026-10-20T06:30:00.000Z", name: "Run", type: "Run", durationSec: 2400, distanceM: 8000, avgHr: 150, maxHr: 178,
  stats: { splitsSec: [300, 302, 296, 310, 305, 298, 301, 299], hrBinsSec: [0, 0, 0, 0, 1800, 0, 0, 0, 300, 0, 0], trainingEffect: 3.2, avgCadence: 172 },
};
const m = (metricId: string, value: number): DailyMetricEntry => ({ id: metricId, metricId, date: "2026-10-24", value }) as DailyMetricEntry;
const base = { today: new Date("2026-10-24T12:00:00Z"), history: { fullWeeks: 2, summaryWeeks: 0 }, recoveryDetail: "brief" as const };

describe("what each switch costs", () => {
  it("has a switch for every field group, once", () => {
    expect(AI_FIELD_INFO.map((i) => i.key).sort()).toEqual([...AI_FIELD_KEYS].sort());
  });

  it("measures each activity group on the activities that carry it", () => {
    const c = fieldCosts({ ...base, activities: [run], dailyMetrics: [] });
    for (const key of ["pace", "zones", "effect", "terrain"] as const) {
      expect(c[key].hasData, key).toBe(true);
      expect(c[key].tokens, key).toBeGreaterThan(0);
    }
    // Splits and pace cost more than a single training-effect line.
    expect(c.pace.tokens).toBeGreaterThan(c.effect.tokens);
  });

  it("says there is no data for a group nothing feeds", () => {
    const c = fieldCosts({ ...base, activities: [{ ...run, stats: undefined }], dailyMetrics: [] });
    expect(c.zones.hasData).toBe(false);
    expect(c.effect.hasData).toBe(false);
    expect(c.vo2max).toEqual({ tokens: 0, hasData: false });
  });

  it("measures the recovery groups on the readings you have", () => {
    const c = fieldCosts({ ...base, activities: [], dailyMetrics: [m("sleep-score", 80), m("vo2max", 55.2), m("sleep-deep", 70), m("sleep-rem", 95)] });
    expect(c.vo2max.hasData).toBe(true);
    expect(c.sleepStages.tokens).toBeGreaterThan(c.vo2max.tokens);
    expect(c.readiness.hasData).toBe(false);
  });
});
