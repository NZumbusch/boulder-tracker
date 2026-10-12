import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, ValueDef } from "../types";
import { applyTidy, conditionsFromLabel, proposeTidy } from "./tidy";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
  { id: "time", name: "Time", unit: "s", kind: "number", measure: "time" },
  { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps" },
];
// The shape of a real one: a leftover "Hangboard" (id max-hang-20) beside the merged "Max Hang".
const hangboard: BenchmarkTypeDef = { id: "max-hang-20", name: "Hangboard", unit: "kg", fields: [{ valueId: "weight", role: "result" }, { valueId: "time", role: "condition" }, { valueId: "edge", role: "condition" }] };
const maxHang: BenchmarkTypeDef = { id: "max-hang", name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result", label: "Added weight" }], mergedFrom: ["max-hang-10", "max-hang-15"] };
const bodyweight: BenchmarkTypeDef = { id: "bw", name: "Bodyweight", unit: "kg", fields: [{ valueId: "weight", role: "result" }] };
const pushups: BenchmarkTypeDef = { id: "pu", name: "Max Pushups", unit: "reps", fields: [{ valueId: "reps", role: "result" }] };
const lsit: BenchmarkTypeDef = { id: "ls", name: "L-Sit Duration", unit: "s", fields: [{ valueId: "time", role: "result" }] };
const result = (id: string, typeId: string, type: string, value: number, values: Record<string, number | string>): Benchmark => ({ id, typeId, type, value, unit: "kg", date: "2026-06-25T12:00:00Z", weekId: "2026-W26", values });

const types = [hangboard, maxHang, bodyweight, pushups, lsit];
const results = [
  result("r1", "max-hang-20", "Max Hang 20mm 7s", 51.5, { weight: 51.5 }),
  result("r2", "max-hang", "Max Hang", 60, { weight: 60, edge: 15 }),
  result("r3", "bw", "Bodyweight", 73.5, { weight: 73.5 }),
  result("r4", "pu", "Max Pushups", 25, { reps: 25 }),
];

describe("conditionsFromLabel", () => {
  it("reads the edge and the hang time out of an old name", () => {
    expect(conditionsFromLabel("Max Hang 20mm 7s")).toEqual({ length: 20, time: 7 });
    expect(conditionsFromLabel("Max Hang 15 mm")).toEqual({ length: 15 });
    expect(conditionsFromLabel("Max Pullups")).toEqual({});
  });
});

describe("proposeTidy", () => {
  const p = proposeTidy(types, results, defs);
  it("proposes merging the leftover hang test into Max Hang, adding the missing condition and filling it from the old name", () => {
    const m = p.find((x) => x.kind === "merge")!;
    expect(m).toMatchObject({ fromId: "max-hang-20", intoId: "max-hang", moves: 1, defaultOn: true });
    expect(m.kind === "merge" && m.addFields.map((f) => f.valueId)).toEqual(["time"]);
    expect(m.kind === "merge" && m.fill).toEqual([{ resultId: "r1", values: { edge: 20, time: 7 } }]);
  });
  it("leaves the bodyweight test to the weigh-in migration, whatever its results", () => {
    expect(p.some((x) => x.id === "archive-bw" || (x.kind === "archive" && x.typeIds.includes("bw")))).toBe(false);
  });
  it("offers unused tests too, but off by default", () => {
    const unused = p.find((x) => x.id === "archive-unused")!;
    expect(unused).toMatchObject({ kind: "archive", defaultOn: false, typeIds: ["ls"] });
    expect(p.some((x) => x.kind === "archive" && x.typeIds.includes("pu"))).toBe(false);
  });
  it("proposes nothing for a tidy set", () => {
    expect(proposeTidy([maxHang, pushups], [results[1], results[3]], defs)).toEqual([]);
  });
});

describe("applyTidy", () => {
  const p = proposeTidy(types, results, defs).filter((x) => x.defaultOn);
  const out = applyTidy(p, types, results);
  it("merges: the source test goes, the target gains the field and remembers it, the result moves with its conditions", () => {
    expect(out.types.find((t) => t.id === "max-hang-20")).toBeUndefined();
    const mh = out.types.find((t) => t.id === "max-hang")!;
    expect(mh.fields?.map((f) => f.valueId)).toEqual(["edge", "weight", "time"]);
    expect(mh.mergedFrom).toEqual(["max-hang-10", "max-hang-15", "max-hang-20"]);
    const moved = out.benchmarks.find((b) => b.id === "r1")!;
    expect(moved).toMatchObject({ typeId: "max-hang", type: "Max Hang", values: { weight: 51.5, edge: 20, time: 7 } });
    expect(out.benchmarks).toHaveLength(1);
  });
  it("leaves tests it did not propose alone", () => {
    expect(out.types.find((t) => t.id === "bw")?.archived).toBeUndefined(); // the weigh-in migration owns that one
    expect(out.types.find((t) => t.id === "pu")?.archived).toBeUndefined();
    expect(out.types.find((t) => t.id === "ls")?.archived).toBeUndefined();
  });
});

describe("combining a lift kept as max reps and heaviest single", () => {
  const maxPull: BenchmarkTypeDef = { id: "max-pullups", name: "Max Pullups", unit: "reps", fields: [{ valueId: "reps", role: "result" }] };
  const oneRm: BenchmarkTypeDef = { id: "1rm-weighted-pullup", name: "1RM Weighted Pullup", unit: "kg", fields: [{ valueId: "weight", role: "result", label: "Added weight" }, { valueId: "reps", role: "condition", fixed: 1 }] };
  const dip: BenchmarkTypeDef = { id: "1rm-weighted-dip", name: "1RM Weighted Dip", unit: "kg", fields: [{ valueId: "weight", role: "result" }, { valueId: "reps", role: "condition", fixed: 1 }] };
  const rs = [
    result("p1", "max-pullups", "Max Pullups", 11, { reps: 11 }),
    { ...result("w1", "1rm-weighted-pullup", "1RM Weighted Pullup", 30, { weight: 30, reps: 1 }), date: "2026-07-01T12:00:00Z" },
    result("w2", "1rm-weighted-pullup", "1RM Weighted Pullup", 35, { weight: 35 }), // an old result without the fixed reps stored
    result("d1", "1rm-weighted-dip", "1RM Weighted Dip", 40, { weight: 40 }),
  ];
  const all = [maxPull, oneRm, dip];

  it("proposes one combine for the same lift, not for a lift with nothing to pair", () => {
    const p = proposeTidy(all, rs, defs).filter((x) => x.kind === "combine");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: "combine", fromId: "1rm-weighted-pullup", intoId: "max-pullups", defaultOn: true, moves: 2, singleReps: 1 });
    expect(p[0].label).toBe("Combine Max Pullups and 1RM Weighted Pullup");
  });

  it("moves the singles over as one rep at their weight, adds the weight, two Home views, archives the old test, and Undo-able data is untouched", () => {
    const p = proposeTidy(all, rs, defs).filter((x) => x.kind === "combine");
    const out = applyTidy(p, all, rs);
    const into = out.types.find((t) => t.id === "max-pullups")!;
    expect(into.fields).toEqual([{ valueId: "reps", role: "result" }, { valueId: "weight", role: "condition", label: "Added weight" }]);
    expect(into.views?.map((v) => [v.name, v.y, v.onHome])).toEqual([["Max reps, no weight", "reps", true], ["Heaviest single", "weight", true]]);
    expect(into.mergedFrom).toContain("1rm-weighted-pullup");
    expect(out.types.find((t) => t.id === "1rm-weighted-pullup")?.archived).toBe(true);
    expect(out.types.find((t) => t.id === "1rm-weighted-dip")?.archived).toBeUndefined();
    expect(out.benchmarks.map((b) => [b.id, b.typeId, b.value, b.values])).toEqual([
      ["w1", "max-pullups", 1, { weight: 30, reps: 1 }],
      ["w2", "max-pullups", 1, { weight: 35, reps: 1 }],
    ]);
  });

  it("leaves Home as it was: a row for max reps and a row for the heaviest single, each with its own number", async () => {
    const { buildSeries } = await import("./series");
    const { latestBenchmarks } = await import("../analytics/progress");
    const p = proposeTidy(all, rs, defs).filter((x) => x.kind === "combine");
    const out = applyTidy(p, all, rs);
    const merged = rs.map((r) => out.benchmarks.find((b) => b.id === r.id) ?? r);
    const series = buildSeries(merged, out.types, defs, "kg");
    expect(series.map((s) => s.label).sort()).toEqual(["1RM Weighted Dip", "Max Pullups · Heaviest single", "Max Pullups · Max reps, no weight"]);
    const rows = latestBenchmarks(merged, out.types, defs, "kg");
    expect(rows.find((x) => x.name.includes("Heaviest single"))?.latestText).toBe("30 kg"); // w1 is the newer one
    expect(rows.find((x) => x.name.includes("no weight"))?.latestText).toBe("11 reps");
  });
});
