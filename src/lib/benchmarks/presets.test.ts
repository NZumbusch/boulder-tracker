import { describe, it, expect } from "vitest";
import { BENCHMARK_PRESETS, missingBuiltIns } from "./presets";
import { BENCHMARK_VALUE_DEFS } from "./upgrade";
import { primaryField, resolveFields, typeProblem } from "./model";

const defs = Object.values(BENCHMARK_VALUE_DEFS);

describe("benchmark presets", () => {
  it("are valid tests that only use value types the app ships", () => {
    for (const p of BENCHMARK_PRESETS) {
      const type = { id: "x", ...p.make() };
      if (p.id !== "blank") expect(typeProblem(type, [])).toBeNull();
      for (const f of type.fields ?? []) expect(defs.some((d) => d.id === f.valueId)).toBe(true);
      const fields = resolveFields(type, defs);
      expect(primaryField(fields)).toBeDefined();
      expect(type.unit).toBe(primaryField(fields)!.unit);
    }
  });

  it("put the right way round: a smallest edge and a timed effort are better lower", () => {
    const by = Object.fromEntries(BENCHMARK_PRESETS.map((p) => [p.id, p.make()]));
    expect(by["min-edge"].direction).toBe("lower");
    expect(by.timed.direction).toBe("lower");
    expect(by["weight-for-reps"].score).toBe("estimatedMax");
  });

  it("find the shipped value types a test needs that were deleted", () => {
    const hang = { fields: [{ valueId: "edge", role: "condition" as const }, { valueId: "weight", role: "result" as const }] };
    expect(missingBuiltIns(hang, defs)).toEqual([]);
    expect(missingBuiltIns(hang, defs.filter((d) => d.id !== "edge")).map((d) => d.id)).toEqual(["edge"]);
    expect(missingBuiltIns({ fields: [{ valueId: "custom", role: "result" as const }] }, [])).toEqual([]);
  });
});
