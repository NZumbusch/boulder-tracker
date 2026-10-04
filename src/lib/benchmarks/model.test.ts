import { describe, it, expect } from "vitest";
import type { Benchmark, BenchmarkTypeDef, ValueDef } from "../types";
import {
  describeResult, otherValuesText, askedFields, conditionKey, conditionsText, finalizeType, formatFieldValue, fromShown, groupTypes,
  primaryField, resolveFields, resultValues, toShown, typeProblem, unitLabel,
} from "./model";

const defs: ValueDef[] = [
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" },
  { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps" },
  { id: "time", name: "Time", unit: "s", kind: "number", measure: "time" },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length" },
  { id: "grip", name: "Grip", kind: "choice", options: ["Open", "Half"] },
];
const hang: BenchmarkTypeDef = {
  id: "max-hang", name: "Max Hang", unit: "kg",
  fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result", label: "Added weight" }, { valueId: "reps", role: "condition", fixed: 1 }],
};
const res = (values: Benchmark["values"], value = 40): Benchmark => ({ id: "r", typeId: "max-hang", type: "Max Hang", value, unit: "kg", date: "2026-09-01", weekId: "2026-W36", values });

describe("resolveFields", () => {
  it("looks the value types up, with the test's own label first", () => {
    const f = resolveFields(hang, defs);
    expect(f.map((x) => [x.valueId, x.label, x.unit, x.measure])).toEqual([
      ["edge", "Edge depth", "mm", "length"], ["weight", "Added weight", "kg", "weight"], ["reps", "Reps", "reps", "reps"],
    ]);
    expect(primaryField(f)?.valueId).toBe("weight");
    expect(askedFields(f).map((x) => x.valueId)).toEqual(["edge", "weight"]);
  });

  it("reads a test from before fields as one result in its unit", () => {
    const f = resolveFields({ unit: "s" }, defs);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ valueId: "result", role: "result", unit: "s" });
  });

  it("keeps a field whose value type was deleted readable", () => {
    const f = resolveFields({ unit: "kg", fields: [{ valueId: "gone", role: "result" }] }, defs);
    expect(f[0]).toMatchObject({ label: "gone", known: false, kind: "number" });
  });
});

describe("units and formatting", () => {
  const [, w, , ] = resolveFields(hang, defs);
  it("shows weights in the chosen unit and stores kg", () => {
    expect(unitLabel(w, "lb")).toBe("lb");
    expect(toShown(w, 45, "lb")).toBe(99.2);
    expect(fromShown(w, 99.2, "lb")).toBe(45);
    expect(toShown(w, 45, "kg")).toBe(45);
  });
  it("formats values", () => {
    const f = resolveFields(hang, defs);
    expect(formatFieldValue(f[0], 20, "kg")).toBe("20 mm");
    expect(formatFieldValue(f[1], 45, "lb")).toBe("99.2 lb");
    const time = resolveFields({ unit: "s", fields: [{ valueId: "time", role: "result" }] }, defs)[0];
    expect(formatFieldValue(time, 90, "kg")).toBe("90 s");
    expect(formatFieldValue(time, 150, "kg")).toBe("2:30");
    expect(formatFieldValue(time, undefined, "kg")).toBe("");
  });
});

describe("results", () => {
  const f = resolveFields(hang, defs);
  it("fills the primary value and fixed conditions in", () => {
    expect(resultValues(res({ edge: 20 }), f)).toEqual({ edge: 20, weight: 40, reps: 1 });
    expect(resultValues(res(undefined, 33), f)).toEqual({ weight: 33, reps: 1 });
  });
  it("names the conditions that vary and keys results by them", () => {
    expect(conditionsText(res({ edge: 20 }), f, "kg")).toBe("20 mm");
    expect(conditionKey(res({ edge: 20 }), f)).toBe("edge=20");
    expect(conditionKey(res({ edge: 15 }), f)).not.toBe(conditionKey(res({ edge: 20 }), f));
    expect(conditionKey(res(undefined), f)).toBe("edge=");
  });
});

describe("editing a test", () => {
  it("finds what is wrong with a draft", () => {
    expect(typeProblem({ ...hang, name: " " }, [])).toMatch(/name/);
    expect(typeProblem(hang, ["max hang"])).toMatch(/already/);
    expect(typeProblem({ ...hang, fields: [{ valueId: "edge", role: "condition" }] }, [])).toMatch(/result/);
    expect(typeProblem({ ...hang, fields: [{ valueId: "weight", role: "result" }, { valueId: "weight", role: "condition" }] }, [])).toMatch(/once/);
    expect(typeProblem(hang, ["Board"])).toBeNull();
  });

  it("keeps the type's unit in step with its primary result and drops empty options", () => {
    const type = finalizeType({ id: "t", name: " Reps test ", unit: "kg", group: " ", protocol: "", direction: "higher", score: "raw", fields: [{ valueId: "reps", role: "result", label: " " }, { valueId: "weight", role: "condition", fixed: "" }] }, defs);
    expect(type).toEqual({ id: "t", name: "Reps test", unit: "reps", fields: [{ valueId: "reps", role: "result" }, { valueId: "weight", role: "condition" }] });
    expect(finalizeType({ ...hang, direction: "lower", score: "relative", group: "Fingers" }, defs)).toMatchObject({ direction: "lower", score: "relative", group: "Fingers", unit: "kg" });
  });
});

describe("groupTypes", () => {
  it("groups by folder, ungrouped last", () => {
    const g = groupTypes([{ id: "a", group: "Pull" }, { id: "b" }, { id: "c", group: "Fingers" }, { id: "d", group: "Pull" }]);
    expect(g.map((x) => [x.group, x.types.map((t) => t.id)])).toEqual([["Pull", ["a", "d"]], ["Fingers", ["c"]], ["", ["b"]]]);
  });
});

describe("describeResult", () => {
  it("names the test with its conditions and shows the result in the unit setting", () => {
    expect(describeResult(res({ edge: 20 }), [hang], defs, "kg")).toEqual({ title: "Max Hang · 20 mm", value: "40 kg" });
    expect(describeResult(res({ edge: 20 }), [hang], defs, "lb")).toEqual({ title: "Max Hang · 20 mm", value: "88.2 lb" });
  });
  it("falls back to what the result itself says when its test is gone", () => {
    expect(describeResult(res(undefined), [], defs, "kg")).toEqual({ title: "Max Hang", value: "40 kg" });
  });
});

describe("otherValuesText", () => {
  it("names every value but the primary one, fixed ones too", () => {
    const f = resolveFields(hang, defs);
    expect(otherValuesText(res({ edge: 20 }), f)).toBe("Edge depth 20 mm, Reps 1 reps");
    expect(otherValuesText(res(undefined), f)).toBe("Reps 1 reps");
  });
});
