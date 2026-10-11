import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("localforage", () => ({
  default: {
    config: vi.fn(),
    getItem: vi.fn(async (k: string) => (k in db ? structuredClone(db[k]) : null)),
    setItem: vi.fn(async (k: string, v: unknown) => { db[k] = structuredClone(v); }),
    removeItem: vi.fn(async (k: string) => { delete db[k]; }),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { trainingState } from "../state.svelte";
import { DATA_EXPORT_VERSION, SLEEP_DURATION_METRIC } from "../constants";
import { setDbState } from "../storage/persistence";
import { planImport } from "./import";

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, {
    database_version: DATA_EXPORT_VERSION,
    workouts: [],
    dailyMetrics: [{ id: "manual", metricId: "rhr", date: "2026-09-24", value: 49 }],
  });
  setDbState(null);
  await trainingState.refresh();
});

describe("saving a Health Connect import", () => {
  it("writes all entries at once, adds the sleep metric, and keeps hand-entered values", async () => {
    const plan = planImport(trainingState.dailyMetrics, [
      { metricId: "rhr", date: "2026-09-24", value: 55 },
      { metricId: "rhr", date: "2026-09-25", value: 52 },
      { metricId: "sleep-duration", date: "2026-09-25", value: 7.2 },
    ]);
    await trainingState.importDailyMetrics(plan.upserts, [SLEEP_DURATION_METRIC]);

    expect(trainingState.dailyMetrics.find((m) => m.id === "manual")?.value).toBe(49);
    expect(trainingState.dailyMetrics.map((m) => m.id).sort()).toEqual(["hc-rhr-2026-09-25", "hc-sleep-duration-2026-09-25", "manual"]);
    expect(trainingState.metricDefs.some((d) => d.id === "sleep-duration")).toBe(true);

    // A second import of a changed value updates the same entry rather than adding one.
    const again = planImport(trainingState.dailyMetrics, [{ metricId: "rhr", date: "2026-09-25", value: 51 }]);
    await trainingState.importDailyMetrics(again.upserts, []);
    expect(trainingState.dailyMetrics.filter((m) => m.date === "2026-09-25" && m.metricId === "rhr")).toHaveLength(1);
    expect(trainingState.dailyMetrics.find((m) => m.id === "hc-rhr-2026-09-25")?.value).toBe(51);
  });
});
