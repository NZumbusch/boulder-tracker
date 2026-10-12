import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, ValueDef } from "../types";
import { buildSeries } from "./series";
import { adoptWayViews } from "./ways";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
];
const hang: BenchmarkTypeDef = { id: "hang", name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result" }] };
const r = (id: string, date: string, edge: number, w: number, typeId = "hang"): Benchmark => ({ id, typeId, type: "Max Hang", value: w, unit: "kg", date, weekId: "", values: { edge, weight: w } });

describe("adoptWayViews", () => {
  const results = [r("a", "2026-01-01T10:00:00Z", 20, 40), r("b", "2026-02-01T10:00:00Z", 15, 30), r("c", "2026-03-01T10:00:00Z", 20, 45), r("d", "2026-04-01T10:00:00Z", 10, 20)];

  it("gives a test that was done several ways one Home view each, newest first, so Home reads as before", () => {
    const before = buildSeries(results, [hang], defs, "kg"); // implicit: the latest way only
    const { types, added } = adoptWayViews([hang], results, defs);
    expect(added).toEqual([{ typeId: "hang", name: "Max Hang", views: ["10 mm", "20 mm", "15 mm"] }]);
    const after = buildSeries(results, types, defs, "kg");
    expect(after.map((s) => s.label)).toEqual(["Max Hang · 10 mm", "Max Hang · 20 mm", "Max Hang · 15 mm"]);
    expect(after.map((s) => s.results.length)).toEqual([1, 2, 1]);
    expect(before).toHaveLength(1);
  });

  it("is deterministic, and leaves a test with views, one way, or too many ways alone", () => {
    expect(adoptWayViews([hang], results, defs).types).toEqual(adoptWayViews([hang], results, defs).types);
    const again = adoptWayViews(adoptWayViews([hang], results, defs).types, results, defs);
    expect(again.added).toEqual([]);
    expect(adoptWayViews([hang], [r("a", "2026-01-01T10:00:00Z", 20, 40)], defs).added).toEqual([]);
    const many = Array.from({ length: 8 }, (_, i) => r(`m${i}`, `2026-01-0${i + 1}T10:00:00Z`, 10 + i, 20));
    expect(adoptWayViews([hang], many, defs).added).toEqual([]);
  });

  it("treats a blank or zero value as the same way, and skips archived tests and tests without a set-up field", () => {
    const pull: BenchmarkTypeDef = { id: "mp", name: "Max Pullups", unit: "reps", fields: [{ valueId: "weight", role: "condition", label: "Added weight" }] };
    const rows: Benchmark[] = [
      { id: "1", typeId: "mp", type: "x", value: 10, unit: "reps", date: "2026-01-01T10:00:00Z", weekId: "", values: { reps: 10 } },
      { id: "2", typeId: "mp", type: "x", value: 11, unit: "reps", date: "2026-02-01T10:00:00Z", weekId: "", values: { reps: 11, weight: 0 } },
    ];
    // blank vs 0 are two keys in conditionKey; adoption must not make two views that show the same results
    const out = adoptWayViews([pull], rows, defs);
    const filtersOf = out.types[0].views?.map((v) => JSON.stringify(v.filters));
    expect(new Set(filtersOf).size).toBe(filtersOf?.length ?? 0);
    expect(adoptWayViews([{ ...hang, archived: true }], results, defs).added).toEqual([]);
    expect(adoptWayViews([{ id: "t", name: "Hold", unit: "s", fields: [{ valueId: "weight", role: "result" }] }], results, defs).added).toEqual([]);
  });
});
