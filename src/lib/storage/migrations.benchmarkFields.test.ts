import { describe, it, expect } from "vitest";
import { runDataMigrations, assertMigrationInvariants } from "./migrations";
import { DATA_EXPORT_VERSION, DEFAULT_BENCHMARK_TYPES, DEFAULT_VALUE_DEFS } from "../constants";
import { BENCHMARK_VALUE_DEFS, measureOfUnit, splitEdgeName, upgradeBenchmarks } from "../benchmarks/upgrade";

/** The benchmark types an install had before fields. */
const OLD_DEFAULTS = [
  { id: "max-hang-20", name: "Max Hang 20mm", unit: "kg" },
  { id: "max-hang-15", name: "Max Hang 15mm", unit: "kg" },
  { id: "max-hang-10", name: "Max Hang 10mm", unit: "kg" },
  { id: "1rm-weighted-pullup", name: "1RM Weighted Pullup", unit: "kg" },
  { id: "1rm-weighted-dip", name: "1RM Weighted Dip", unit: "kg" },
  { id: "max-pullups", name: "Max Pullups", unit: "reps" },
  { id: "lsit-duration", name: "L-Sit Duration", unit: "s" },
  { id: "front-lever-duration", name: "Front Lever Duration", unit: "s" },
];
const result = (id: string, typeId: string, type: string, value: number, unit: string, date = "2026-09-01") =>
  ({ id, typeId, type, value, unit, date, weekId: "2026-W36" });

const old = (extra: Record<string, unknown> = {}): any => ({
  exportVersion: "3.33",
  workouts: [],
  exerciseTypes: [],
  benchmarkTypes: structuredClone(OLD_DEFAULTS),
  benchmarks: [],
  ...extra,
});

describe("3.33 -> 3.34: benchmark fields", () => {
  it("merges the three max hangs into one test with an edge condition, keeping every result", () => {
    const data = old({
      benchmarks: [
        result("a", "max-hang-20", "Max Hang 20mm", 40, "kg", "2026-01-01"),
        result("b", "max-hang-20", "Max Hang 20mm", 45, "kg", "2026-05-01"),
        result("c", "max-hang-15", "Max Hang 15mm", 30, "kg"),
        result("d", "max-pullups", "Max Pullups", 14, "reps"),
      ],
    });
    const before = structuredClone(data);
    runDataMigrations(data);
    expect(data.exportVersion).toBe(DATA_EXPORT_VERSION);
    assertMigrationInvariants(before, data);

    const hang = data.benchmarkTypes.find((t: any) => t.id === "max-hang");
    expect(hang).toMatchObject({ name: "Max Hang", unit: "kg", group: "Fingers", mergedFrom: ["max-hang-10", "max-hang-15", "max-hang-20"] });
    expect(hang.fields).toEqual([{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result", label: "Added weight" }]);
    expect(data.benchmarkTypes.some((t: any) => t.id.startsWith("max-hang-"))).toBe(false);

    const byId = Object.fromEntries(data.benchmarks.map((r: any) => [r.id, r]));
    expect(byId.a).toMatchObject({ typeId: "max-hang", type: "Max Hang", value: 40, unit: "kg", values: { edge: 20, weight: 40 } });
    expect(byId.c.values).toEqual({ edge: 15, weight: 30 });
    expect(byId.d).toMatchObject({ typeId: "max-pullups", value: 14, values: { reps: 14 } });
  });

  it("gives the other shipped tests their natural fields", () => {
    const data = old();
    runDataMigrations(data);
    const t = Object.fromEntries(data.benchmarkTypes.map((x: any) => [x.id, x]));
    expect(t["1rm-weighted-pullup"].fields).toEqual([
      { valueId: "weight", role: "result", label: "Added weight" },
      { valueId: "reps", role: "condition", fixed: 1 },
    ]);
    expect(t["max-pullups"].fields).toEqual([{ valueId: "reps", role: "result" }, { valueId: "weight", role: "condition", label: "Added weight" }]);
    expect(t["lsit-duration"]).toMatchObject({ unit: "s", group: "Core", fields: [{ valueId: "time", role: "result" }] });
  });

  it("makes a fresh install's tests the same as an upgraded one's", () => {
    const data = old();
    runDataMigrations(data);
    const strip = (types: any[]) => types.map(({ mergedFrom, ...t }) => t).sort((a, b) => a.id.localeCompare(b.id));
    expect(strip(data.benchmarkTypes)).toEqual(strip(structuredClone(DEFAULT_BENCHMARK_TYPES)));
  });

  it("adds the benchmark value types, and the original four when the table did not exist", () => {
    const data = old();
    runDataMigrations(data);
    expect(data.valueDefs.map((d: any) => d.id)).toEqual(["elevation", "speed", "heartRate", "count", "weight", "reps", "time", "edge"]);
    const kept = old({ valueDefs: [{ id: "grip", name: "Grip", kind: "choice", options: ["Open", "Half"] }] });
    runDataMigrations(kept);
    expect(kept.valueDefs.map((d: any) => d.id)).toEqual(["grip", "weight", "reps", "time", "edge"]);
  });

  it("keeps the value types the app ships and the migration adds in step", () => {
    for (const def of Object.values(BENCHMARK_VALUE_DEFS)) expect(DEFAULT_VALUE_DEFS).toContainEqual(def);
  });

  it("uses a user's own number type of the same id, and a new id when theirs is a pick-list", () => {
    const own = old({ valueDefs: [{ id: "weight", name: "Weight", unit: "kg", kind: "number" }] });
    runDataMigrations(own);
    expect(own.valueDefs.filter((d: any) => d.id === "weight")).toEqual([{ id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" }]);

    const clash = old({ benchmarkTypes: [{ id: "x", name: "Heavy", unit: "kg" }], valueDefs: [{ id: "weight", name: "Weight", kind: "choice", options: ["a", "b"] }] });
    runDataMigrations(clash);
    const field = clash.benchmarkTypes[0].fields[0];
    expect(field.valueId).not.toBe("weight");
    expect(clash.valueDefs.find((d: any) => d.id === field.valueId)).toMatchObject({ kind: "number", measure: "weight" });
  });

  it("merges a user's own edge-named tests, but leaves a lone one as it is", () => {
    const data = old({
      benchmarkTypes: [
        { id: "u1", name: "Board hang (20 mm)", unit: "kg" },
        { id: "u2", name: "board hang - 15mm", unit: "kg" },
        { id: "solo", name: "Repeater 18mm", unit: "kg" },
        { id: "u3", name: "Board hang 20mm", unit: "s" },
      ],
      benchmarks: [result("r1", "u2", "board hang - 15mm", 22, "kg")],
    });
    runDataMigrations(data);
    const ids = data.benchmarkTypes.map((t: any) => t.id);
    expect(ids).toEqual(["board-hang", "solo", "u3"]);
    expect(data.benchmarkTypes[0]).toMatchObject({ name: "Board hang", mergedFrom: ["u1", "u2"] });
    expect(data.benchmarkTypes[1].name).toBe("Repeater 18mm");
    expect(data.benchmarks[0]).toMatchObject({ typeId: "board-hang", type: "Board hang", values: { edge: 15, weight: 22 } });
  });

  it("converts pounds to kg and minutes to seconds, and gives other units a value type of their own", () => {
    const data = old({
      benchmarkTypes: [
        { id: "lbs", name: "Deadlift", unit: "lb" },
        { id: "mins", name: "Plank", unit: "min" },
        { id: "cm", name: "Reach", unit: "cm" },
        { id: "cm2", name: "Jump", unit: "cm" },
      ],
      benchmarks: [result("a", "lbs", "Deadlift", 200, "lb"), result("b", "mins", "Plank", 2, "min"), result("c", "cm", "Reach", 150, "cm")],
    });
    runDataMigrations(data);
    const r = Object.fromEntries(data.benchmarks.map((x: any) => [x.id, x]));
    expect(r.a).toMatchObject({ value: 90.72, unit: "kg" });
    expect(r.b).toMatchObject({ value: 120, unit: "s" });
    expect(r.c).toMatchObject({ value: 150, unit: "cm" });
    const t = Object.fromEntries(data.benchmarkTypes.map((x: any) => [x.id, x]));
    expect(t.lbs.unit).toBe("kg");
    expect(t.cm.fields[0].valueId).toBe(t.cm2.fields[0].valueId);
    expect(data.valueDefs.find((d: any) => d.id === t.cm.fields[0].valueId)).toMatchObject({ name: "Result (cm)", unit: "cm", kind: "number" });
  });

  it("leaves tests that already have fields, results with values, and results of unknown tests alone", () => {
    const fields = [{ valueId: "weight", role: "result" }];
    const data = old({
      benchmarkTypes: [{ id: "t", name: "Mine", unit: "kg", fields }],
      benchmarks: [result("a", "t", "Mine", 5, "kg"), result("b", "gone", "Old test", 7, "kg")],
    });
    const before = structuredClone(data.benchmarks);
    runDataMigrations(data);
    expect(data.benchmarkTypes[0].fields).toEqual(fields);
    expect(data.benchmarks).toEqual(before);
  });

  it("is idempotent: upgrading the output again changes nothing", () => {
    const data = old({ benchmarks: [result("a", "max-hang-20", "Max Hang 20mm", 40, "kg")] });
    runDataMigrations(data);
    const again = upgradeBenchmarks({ types: data.benchmarkTypes, results: data.benchmarks, valueDefs: data.valueDefs });
    expect(again.types).toEqual(data.benchmarkTypes);
    expect(again.results).toEqual(data.benchmarks);
    expect(again.valueDefs).toEqual(data.valueDefs);
  });

  it("does not depend on the order the tests are listed in (every device must reach the same result)", () => {
    const a = old({ benchmarks: [result("a", "max-hang-15", "Max Hang 15mm", 30, "kg")] });
    const b = old({ benchmarkTypes: [...OLD_DEFAULTS].reverse(), benchmarks: structuredClone(a.benchmarks) });
    runDataMigrations(a);
    runDataMigrations(b);
    const hangA = a.benchmarkTypes.find((t: any) => t.id === "max-hang");
    const hangB = b.benchmarkTypes.find((t: any) => t.id === "max-hang");
    expect(hangA).toEqual(hangB);
    expect(a.benchmarks).toEqual(b.benchmarks);
  });
});

describe("unit and name helpers", () => {
  it("reads units written by hand", () => {
    expect(measureOfUnit("KG")).toEqual({ key: "weight", factor: 1, unit: "kg" });
    expect(measureOfUnit("reps")?.key).toBe("reps");
    expect(measureOfUnit("sec")).toEqual({ key: "time", factor: 1, unit: "s" });
    expect(measureOfUnit("watts")).toBeNull();
  });
  it("finds an edge in a name", () => {
    expect(splitEdgeName("Max Hang 20mm")).toEqual({ base: "Max Hang", edge: 20 });
    expect(splitEdgeName("Hang (12.5 mm)")).toEqual({ base: "Hang", edge: 12.5 });
    expect(splitEdgeName("20mm")).toBeNull();
    expect(splitEdgeName("Max pullups")).toBeNull();
  });
});
