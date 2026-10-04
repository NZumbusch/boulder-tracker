import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, ValueDef } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { bodyweightNear, buildSeries, defaultMetric, isImprovement, metricPoints, metricsOf, metricValue, primaryText } from "./series";
import { resolveFields } from "./model";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps" },
  { id: "time", name: "Time", unit: "s", kind: "number", measure: "time" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
];
const hang: BenchmarkTypeDef = { id: "hang", name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result", label: "Added weight" }] };
const pull: BenchmarkTypeDef = {
  id: "pull", name: "Weighted Pullup", unit: "kg", score: "estimatedMax",
  fields: [{ valueId: "weight", role: "result", label: "Added weight" }, { valueId: "reps", role: "condition" }],
};
const circuit: BenchmarkTypeDef = { id: "circ", name: "Circuit", unit: "s", direction: "lower", fields: [{ valueId: "time", role: "result" }] };
const r = (id: string, typeId: string, date: string, value: number, values?: Benchmark["values"]): Benchmark => ({ id, typeId, type: typeId, value, unit: "kg", date, weekId: "2026-W36", values });

describe("buildSeries", () => {
  const results = [
    r("a", "hang", "2026-01-01", 40, { edge: 20, weight: 40 }),
    r("b", "hang", "2026-03-01", 45, { edge: 20, weight: 45 }),
    r("c", "hang", "2026-04-01", 30, { edge: 15, weight: 30 }),
    r("d", "circ", "2026-02-01", 95),
    r("e", "gone", "2026-02-01", 1),
  ];
  const series = buildSeries(results.slice(0, 4), [hang, circuit], defs, "kg");

  it("groups a test's results by the way it was done, newest tested first", () => {
    expect(series.map((s) => s.label)).toEqual(["Max Hang · 15 mm", "Max Hang · 20 mm", "Circuit"]);
    expect(series[1].results.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("leaves out archived tests, and keeps the results of a deleted test as a plain one", () => {
    expect(buildSeries(results, [{ ...hang, archived: true }, circuit], defs, "kg").map((s) => s.label)).toEqual(["Circuit", "gone"]);
  });
});

describe("metrics", () => {
  it("offers the fields, then the scores the fields allow, the test's own choice first", () => {
    const hangMetrics = metricsOf(hang, resolveFields(hang, defs), "kg");
    expect(hangMetrics.map((m) => m.id)).toEqual(["weight", "edge", "relative"]);
    expect(hangMetrics[0]).toMatchObject({ label: "Added weight", unit: "kg" });
    const pullMetrics = metricsOf(pull, resolveFields(pull, defs), "lb");
    expect(pullMetrics.map((m) => m.id)).toEqual(["estimatedMax", "weight", "reps", "relative"]);
    expect(pullMetrics[0].unit).toBe("lb");
    expect(metricsOf(circuit, resolveFields(circuit, defs), "kg").map((m) => m.id)).toEqual(["time"]);
  });

  it("reads a field in the shown unit, and estimates a max from weight and reps (Epley)", () => {
    const fields = resolveFields(pull, defs);
    const result = r("p", "pull", "2026-05-01", 30, { weight: 30, reps: 5 });
    const [est, weight, reps] = metricsOf(pull, fields, "kg");
    expect(metricValue(est, result, fields, "kg", [])).toBe(35); // 30 * (1 + 5/30)
    expect(metricValue(weight, result, fields, "kg", [])).toBe(30);
    expect(metricValue(reps, result, fields, "kg", [])).toBe(5);
    expect(metricValue(weight, result, fields, "lb", [])).toBe(66.1);
    expect(metricValue(est, r("q", "pull", "2026-05-01", 30, { weight: 30 }), fields, "kg", [])).toBeUndefined(); // reps missing
  });

  it("reads a load as % of bodyweight from the nearest bodyweight, added or total", () => {
    const fields = resolveFields(hang, defs);
    const rel = metricsOf(hang, fields, "kg").find((m) => m.id === "relative")!;
    const day = toUtcDayIndex("2026-05-01");
    const bw = [{ day: day - 3, value: 70 }, { day: day + 10, value: 72 }];
    expect(metricValue(rel, r("h", "hang", "2026-05-01", 35, { edge: 20, weight: 35 }), fields, "kg", bw)).toBe(150); // (70+35)/70
    expect(metricValue(rel, r("h", "hang", "2026-05-01", 35, { edge: 20, weight: 35 }), fields, "kg", [])).toBeUndefined();
    const total = resolveFields({ ...hang, fields: [hang.fields![0], { ...hang.fields![1], basis: "total" }] }, defs);
    expect(metricValue(rel, r("h", "hang", "2026-05-01", 105, { edge: 20, weight: 105 }), total, "kg", bw)).toBe(150);
    expect(bodyweightNear(day, [{ day: day - 20, value: 70 }])).toBeUndefined();
  });

  it("makes the points of a series for a metric, skipping results that cannot be read", () => {
    const s = buildSeries([r("a", "pull", "2026-01-01", 30, { weight: 30, reps: 3 }), r("b", "pull", "2026-02-01", 30, { weight: 30 })], [pull], defs, "kg");
    // different reps -> different conditions -> separate series
    expect(s).toHaveLength(2);
    const est = defaultMetric(s[0], "kg")!;
    expect(metricPoints(est, s[0], "kg", [])).toEqual([]);
    expect(metricPoints(est, s[1], "kg", []).map((p) => p.value)).toEqual([33]);
  });
});

describe("direction and text", () => {
  it("counts a lower time as the improvement", () => {
    expect(isImprovement(-5, circuit)).toBe(true);
    expect(isImprovement(5, circuit)).toBe(false);
    expect(isImprovement(5, hang)).toBe(true);
    expect(isImprovement(0, hang)).toBeUndefined();
  });
  it("writes the primary result in the shown unit", () => {
    const [s] = buildSeries([r("a", "hang", "2026-01-01", 40, { edge: 20, weight: 40 })], [hang], defs, "lb");
    expect(primaryText(s.results[0], s, "lb")).toBe("88.2 lb");
  });
});
