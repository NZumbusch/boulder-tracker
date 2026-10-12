import { describe, expect, it } from "vitest";
import type { Benchmark, BenchmarkTypeDef, DailyMetricEntry, ValueDef } from "../types";
import { bodyweightFromBenchmark, isWeighInName, isWeighInType, planWeighInMigration, resultKg, weighInEntryId, withoutWeighInSlots, withoutWeighInSlotsInAlternatives, withoutWeighInSlotsInTemplates } from "./bodyweight";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight", builtIn: true, uses: ["benchmark"] },
  { id: "edge", name: "Edge", unit: "mm", kind: "number", builtIn: true } as ValueDef,
];
const legacy = (id: string, name: string, unit: string, extra: Partial<BenchmarkTypeDef> = {}): BenchmarkTypeDef => ({ id, name, unit, ...extra });
const withFields = (id: string, name: string, label?: string): BenchmarkTypeDef => ({ id, name, unit: "kg", fields: [{ valueId: "weight", role: "result", ...(label ? { label } : {}) }] });
const res = (id: string, typeId: string, type: string, value: number, unit: string, date: string, values?: Benchmark["values"]): Benchmark => ({ id, typeId, type, value, unit, date, weekId: "2026-W41", ...(values ? { values } : {}) });
const metric = (date: string, value: number): DailyMetricEntry => ({ id: `m-${date}`, metricId: "bodyweight", date, value });

describe("isWeighInName / isWeighInType", () => {
  it("knows the usual spellings and nothing else", () => {
    for (const n of ["Bodyweight", " body weight ", "Body-Weight", "Weigh-in", "weigh in", "Body mass", "Weight", "BW"]) expect(isWeighInName(n)).toBe(true);
    for (const n of ["Max Hang", "Bodyweight pull-ups", "Weighted pullup", "Weight vest hang", ""]) expect(isWeighInName(n)).toBe(false);
  });
  it("needs a single weight result: old unit-only tests, field tests; not added weight or tests with conditions", () => {
    expect(isWeighInType(legacy("bw", "Bodyweight", "kg"), defs)).toBe(true);
    expect(isWeighInType(legacy("bw", "Bodyweight", "lbs"), defs)).toBe(true);
    expect(isWeighInType(legacy("bw", "Bodyweight", "reps"), defs)).toBe(false);
    expect(isWeighInType(withFields("bw", "Body weight"), defs)).toBe(true);
    expect(isWeighInType(withFields("bw", "Weight", "Added weight"), defs)).toBe(false);
    const conditioned: BenchmarkTypeDef = { id: "x", name: "Bodyweight", unit: "kg", fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result" }] };
    expect(isWeighInType(conditioned, defs)).toBe(false);
  });
});

describe("resultKg", () => {
  it("reads a result's own weight, converting hand-typed pounds and refusing nonsense", () => {
    expect(resultKg({ value: 71.2, unit: "kg" })).toBe(71.2);
    expect(resultKg({ value: 157, unit: "lbs" })).toBeCloseTo(71.21, 1);
    expect(resultKg({ value: 70, unit: "reps" })).toBeNull();
    expect(resultKg({ value: 0, unit: "kg" })).toBeNull();
    expect(resultKg({ value: 7, unit: "kg" })).toBeNull();
    expect(resultKg({ value: 700, unit: "kg" })).toBeNull();
    expect(resultKg({ value: Number.NaN, unit: "kg" })).toBeNull();
  });
  it("prefers the field value of a result with fields (stored in kg whatever the unit setting)", () => {
    expect(resultKg({ value: 1, unit: "kg", values: { weight: 72.5 } }, withFields("bw", "Bodyweight"))).toBe(72.5);
  });
});

describe("bodyweightFromBenchmark", () => {
  it("makes the day's reading, with a stable id per day", () => {
    const r = bodyweightFromBenchmark(res("r", "bw", "Bodyweight", 71.2, "kg", "2026-10-12"), legacy("bw", "Bodyweight", "kg"), defs);
    expect(r).toEqual({ id: weighInEntryId("2026-10-12"), metricId: "bodyweight", date: "2026-10-12", value: 71.2 });
    expect(bodyweightFromBenchmark(res("r", "bw", "Bodyweight", 71.2, "kg", "2026-10-12"), legacy("bw", "Bodyweight", "kg"), defs, "mine")!.id).toBe("mine");
  });
  it("is null for other tests, and works without the test when the result names it", () => {
    expect(bodyweightFromBenchmark(res("r", "mh", "Max Hang", 40, "kg", "2026-10-12"), legacy("mh", "Max Hang", "kg"), defs)).toBeNull();
    expect(bodyweightFromBenchmark(res("r", "gone", "Bodyweight", 71, "kg", "2026-10-12"), undefined, defs)?.value).toBe(71);
  });
});

describe("planWeighInMigration", () => {
  const types = [legacy("bw", "Bodyweight", "kg"), withFields("bw2", "Weigh-in"), legacy("mh", "Max Hang", "kg")];

  it("turns results into one reading per day, never overwriting a day that has one", () => {
    const benchmarks = [
      res("1", "bw", "Bodyweight", 71, "kg", "2026-10-01"),
      res("2", "bw", "Bodyweight", 70.5, "kg", "2026-10-02"),
      res("3", "bw", "Bodyweight", 70.8, "kg", "2026-10-02"), // later one that day wins
      res("4", "bw2", "Weigh-in", 1, "kg", "2026-10-03", { weight: 72 }),
      res("5", "bw", "Bodyweight", 71.4, "kg", "2026-10-04"), // already has a reading
      res("6", "mh", "Max Hang", 40, "kg", "2026-10-05"),
    ];
    const plan = planWeighInMigration(types, benchmarks, defs, [metric("2026-10-04", 69.9)]);
    expect(plan.entries.map((e) => [e.date, e.value])).toEqual([["2026-10-01", 71], ["2026-10-02", 70.8], ["2026-10-03", 72]]);
    expect(plan.resultIds).toEqual(["1", "2", "3", "4", "5"]);
    expect(plan.typeIds).toEqual(["bw", "bw2"]);
    expect(plan.keptDays).toBe(1);
  });

  it("is idempotent: after the readings exist there is nothing to add", () => {
    const benchmarks = [res("1", "bw", "Bodyweight", 71, "kg", "2026-10-01")];
    const first = planWeighInMigration(types, benchmarks, defs, []);
    expect(planWeighInMigration(types, benchmarks, defs, first.entries).entries).toEqual([]);
  });

  it("reports what it cannot use instead of throwing", () => {
    const benchmarks = [res("1", "bw", "Bodyweight", 0, "kg", "2026-10-01"), res("2", "bw", "Bodyweight", 71, "kg", "not a date"), res("3", "bw", "Bodyweight", 71, "kg", "2026-10-03")];
    const plan = planWeighInMigration(types, benchmarks, defs, []);
    expect(plan.entries).toHaveLength(1);
    expect(plan.skipped.map((s) => s.resultId)).toEqual(["1", "2"]);
  });

  it("finds results whose test was deleted by their own name, and reads pounds", () => {
    const plan = planWeighInMigration([], [res("1", "gone", "Body weight", 157, "lb", "2026-10-01"), res("2", "gone", "Max Hang", 40, "kg", "2026-10-01")], defs, []);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].value).toBeCloseTo(71.21, 1);
    expect(plan.resultIds).toEqual(["1"]);
  });

  it("takes a timestamp's local day, handles an archived test, and nothing at all", () => {
    const archived = [{ ...legacy("bw", "Bodyweight", "kg"), archived: true }];
    const plan = planWeighInMigration(archived, [res("1", "bw", "Bodyweight", 71, "kg", "2026-10-01T12:00:00.000Z")], defs, []);
    expect(plan.entries[0].date).toBe("2026-10-01");
    expect(plan.typeIds).toEqual([]);
    expect(planWeighInMigration([], [], defs, [])).toEqual({ entries: [], typeIds: [], resultIds: [], keptDays: 0, skipped: [] });
  });
});

describe("withoutWeighInSlots", () => {
  const slot = (id: string, typeId?: string) => (typeId ? { id, test: { typeId } } : { id });
  it("drops weigh-in test slots from sessions not done yet, and leaves finished ones and other tests alone", () => {
    const ws = [
      { id: "a", status: "planned", exercises: [slot("1", "bw"), slot("2", "mh"), slot("3")] },
      { id: "b", status: "completed", exercises: [slot("4", "bw")] },
      { id: "c", status: "planned", exercises: [slot("5", "mh")] },
    ];
    const out = withoutWeighInSlots(ws, ["bw"]);
    expect(out.map((w) => w.id)).toEqual(["a"]);
    expect(out[0].exercises.map((s) => s.id)).toEqual(["2", "3"]);
    expect(withoutWeighInSlots(ws, [])).toEqual([]);
  });
});

describe("weigh-in slots in templates and Plan B", () => {
  const slot = (id: string, typeId?: string) => (typeId ? { id, test: { typeId } } : { id });
  it("strips them from phase templates and says which phases changed", () => {
    const templates = { cap: [{ id: "t1", exercises: [slot("1", "bw"), slot("2")] }, { id: "t2", exercises: [slot("3", "mh")] }], pow: [{ id: "t3", exercises: [slot("4")] }] };
    const { changed, count } = withoutWeighInSlotsInTemplates(templates, ["bw"]);
    expect(Object.keys(changed)).toEqual(["cap"]);
    expect(changed.cap.map((t) => t.exercises.length)).toEqual([1, 1]);
    expect(changed.cap[1]).toBe(templates.cap[1]); // untouched ones are the same objects
    expect(count).toBe(1);
    expect(withoutWeighInSlotsInTemplates({}, ["bw"])).toEqual({ changed: {}, count: 0 });
  });
  it("strips them from Plan B sessions, leaving changes without a session alone", () => {
    const alts = [
      { id: "a", changes: [{ id: "c1", session: { exercises: [slot("1", "bw"), slot("2")] } }, { id: "c2" }] },
      { id: "b", changes: [{ id: "c3", session: { exercises: [slot("3")] } }] },
    ];
    const { changed, count } = withoutWeighInSlotsInAlternatives(alts, ["bw"]);
    expect(changed.map((a) => a.id)).toEqual(["a"]);
    expect(changed[0].changes[0].session!.exercises).toEqual([slot("2")]);
    expect(count).toBe(1);
  });
});
