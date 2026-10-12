import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, BenchmarkView, ValueDef } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { resolveFields } from "./model";
import { explore } from "./explore";
import { distinctValues, filterResults, filtersText, likeLatestView, matchesFilter, sameView, varyingFields } from "./views";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps" },
  { id: "grip", name: "Grip", kind: "choice", options: ["Half crimp", "Open hand"] },
];
const pull: BenchmarkTypeDef = { id: "p", name: "Pull-ups", unit: "reps", fields: [{ valueId: "reps", role: "result" }, { valueId: "weight", role: "condition" }, { valueId: "grip", role: "condition" }] };
const fields = resolveFields(pull, defs);
const b = (id: string, date: string, reps: number, weight?: number, grip?: string): Benchmark => ({
  id, typeId: "p", type: "Pull-ups", value: reps, unit: "reps", date: `${date}T10:00:00Z`, weekId: "",
  values: { reps, ...(weight !== undefined ? { weight } : {}), ...(grip ? { grip } : {}) },
});
const results = [
  b("a", "2026-01-05", 10),          // no weight (blank)
  b("b", "2026-01-12", 11, 0),       // no weight (0)
  b("c", "2026-01-14", 9, 10),
  b("d", "2026-02-02", 8, 10),
  b("e", "2026-02-09", 6, 15),
  b("f", "2026-02-10", 7, 15, "Open hand"),
];
const run = (view: Partial<BenchmarkView>, rs = results) =>
  explore({ type: pull, fields, results: rs, view: { id: "v", name: "v", ...view }, weight: "kg", bodyweights: [] });

describe("filters", () => {
  it("none means not logged or zero; eq and range compare numbers", () => {
    expect(matchesFilter({ op: "none" }, undefined)).toBe(true);
    expect(matchesFilter({ op: "none" }, 0)).toBe(true);
    expect(matchesFilter({ op: "none" }, 5)).toBe(false);
    expect(matchesFilter({ op: "eq", value: 12.5 }, 12.5000001)).toBe(true);
    expect(matchesFilter({ op: "eq", value: "Open hand" }, "Open hand")).toBe(true);
    expect(matchesFilter({ op: "range", min: 10 }, 10)).toBe(true);
    expect(matchesFilter({ op: "range", min: 10, max: 14 }, 15)).toBe(false);
    expect(matchesFilter({ op: "range", min: 10 }, undefined)).toBe(false);
  });

  it("keeps the results that pass every field's filter", () => {
    expect(filterResults(results, fields, { weight: { op: "none" } }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterResults(results, fields, { weight: { op: "range", min: 10 } }).map((x) => x.id)).toEqual(["c", "d", "e", "f"]);
    expect(filterResults(results, fields, { weight: { op: "range", min: 10 }, grip: { op: "eq", value: "Open hand" } }).map((x) => x.id)).toEqual(["f"]);
    expect(filterResults(results, fields, undefined)).toHaveLength(6);
  });

  it("lists a field's distinct values and which fields vary", () => {
    const weight = fields.find((f) => f.valueId === "weight")!;
    expect(distinctValues(results, weight, fields)).toEqual([0, 10, 15]);
    expect(varyingFields(results, fields).map((f) => f.valueId)).toEqual(["reps", "weight", "grip"]);
    expect(varyingFields(results.slice(0, 1), fields)).toEqual([]);
  });

  it("'like your latest' matches the set-up fields of the latest result", () => {
    expect(likeLatestView(fields, results[5]).filters).toEqual({ weight: { op: "eq", value: 15 }, grip: { op: "eq", value: "Open hand" } });
    expect(likeLatestView(fields, results[1]).filters).toEqual({ weight: { op: "none" }, grip: { op: "none" } });
    expect(likeLatestView(fields, undefined).filters).toBeUndefined();
  });

  it("describes filters in words and compares views", () => {
    expect(filtersText({ weight: { op: "none" }, grip: { op: "eq", value: "Open hand" } }, fields, "kg")).toBe("no weight · Open hand");
    expect(filtersText({ weight: { op: "range", min: 10 } }, fields, "kg")).toBe("10 kg or more");
    expect(filtersText({ weight: { op: "eq", value: 10 } }, fields, "lb")).toBe("22 lb");
    expect(sameView({ id: "1", name: "a", y: "reps" }, { id: "2", name: "b", y: "reps", agg: "all", onHome: true })).toBe(true);
    expect(sameView({ id: "1", name: "a" }, { id: "2", name: "b", agg: "week" })).toBe(false);
  });
});

describe("explore", () => {
  it("plots every result over time, oldest first, for a filtered view", () => {
    const e = run({ filters: { weight: { op: "none" } } });
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].points.map((p) => [p.id, p.y])).toEqual([["a", 10], ["b", 11]]);
    expect(e.x).toBeUndefined();
    expect(e.y?.id).toBe("reps");
  });

  it("plots one metric against another, in time order", () => {
    const e = run({ x: "weight", y: "reps" });
    expect(e.lines[0].points.map((p) => [p.x, p.y])).toEqual([[0, 10], [0, 11], [10, 9], [10, 8], [15, 6], [15, 7]]);
  });

  it("takes the best result at each x value (the curve), or the average", () => {
    const best = run({ x: "weight", y: "reps", agg: "each" });
    expect(best.lines[0].points.map((p) => [p.x, p.y, p.n, p.id])).toEqual([[0, 11, 2, "b"], [10, 9, 2, "c"], [15, 7, 2, "f"]]);
    const avg = run({ x: "weight", y: "reps", agg: "each", stat: "average" });
    expect(avg.lines[0].points.map((p) => [p.x, p.y])).toEqual([[0, 10.5], [10, 8.5], [15, 6.5]]);
  });

  it("takes the best per week or month over time", () => {
    const week = run({ agg: "week" });
    expect(week.lines[0].points.map((p) => [p.id, p.y, p.n])).toEqual([["a", 10, 1], ["b", 11, 2], ["d", 8, 1], ["f", 7, 2]]);
  });

  it("uses the lower value as best when the test says lower is better", () => {
    const circuit: BenchmarkTypeDef = { id: "c", name: "Circuit", unit: "s", direction: "lower", fields: [{ valueId: "reps", role: "result" }] };
    const f = resolveFields(circuit, defs);
    const rs = [b("x", "2026-01-05", 90), b("y", "2026-01-06", 80), b("z", "2026-01-07", 85)].map((r) => ({ ...r, typeId: "c" }));
    const e = explore({ type: circuit, fields: f, results: rs, view: { id: "v", name: "v", agg: "month" }, weight: "kg", bodyweights: [] });
    expect(e.lines[0].points.map((p) => [p.id, p.y])).toEqual([["y", 80]]);
  });

  it("splits into one line per value of a field, no-value last, most-used kept when there are many", () => {
    const e = run({ splitBy: "weight" });
    expect(e.lines.map((l) => [l.label, l.points.length])).toEqual([["No weight", 2], ["10 kg", 2], ["15 kg", 2]]);
  });

  it("the second line rides on the same results, and only without a split", () => {
    const e = run({ y2: "weight" });
    expect(e.y2?.id).toBe("weight");
    expect(e.lines[0].points[2].y2).toBe(10);
    expect(run({ y2: "weight", splitBy: "grip" }).y2).toBeUndefined();
  });

  it("an unknown metric or split falls back to the test's own", () => {
    const e = run({ y: "nope", splitBy: "nope" });
    expect(e.y?.id).toBe("reps");
    expect(e.split).toBeUndefined();
    expect(e.lines).toHaveLength(1);
  });

  it("estimated max works as a metric of a weight-and-reps test, per line", () => {
    const wr: BenchmarkTypeDef = { id: "w", name: "Weighted", unit: "kg", fields: [{ valueId: "weight", role: "result" }, { valueId: "reps", role: "result" }] };
    const f = resolveFields(wr, defs);
    const rs: Benchmark[] = [
      { id: "1", typeId: "w", type: "w", value: 30, unit: "kg", date: "2026-01-01T10:00:00Z", weekId: "", values: { weight: 30, reps: 3 } },
      { id: "2", typeId: "w", type: "w", value: 35, unit: "kg", date: "2026-02-01T10:00:00Z", weekId: "", values: { weight: 35, reps: 3 } },
    ];
    const e = explore({ type: wr, fields: f, results: rs, view: { id: "v", name: "v", y: "estimatedMax", splitBy: "reps" }, weight: "kg", bodyweights: [] });
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].label).toBe("3 reps");
    expect(e.lines[0].points.map((p) => p.y)).toEqual([33, 38.5]);
    expect(toUtcDayIndex(e.lines[0].points[0].result.date)).toBe(e.lines[0].points[0].day);
  });
});
