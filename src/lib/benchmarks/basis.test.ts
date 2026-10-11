import { describe, it, expect } from "vitest";
import { adoptTotalBasis } from "./basis";
import type { BenchmarkTypeDef, ValueDef } from "../types";

const defs: ValueDef[] = [{ id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight" }, { id: "reps", name: "Reps", kind: "number", measure: "reps" }];
const hang: BenchmarkTypeDef = { id: "max-hang", name: "Max Hang", unit: "kg", mergedFrom: ["max-hang-15", "max-hang-20"], fields: [{ valueId: "weight", role: "result" }] };
const pull: BenchmarkTypeDef = { id: "pull", name: "Pull", unit: "reps", fields: [{ valueId: "reps", role: "result" }] };

describe("adoptTotalBasis", () => {
  it("marks a test named in the old list - or merged from one that was - as total", () => {
    const direct = adoptTotalBasis([hang, pull], defs, ["pull", "max-hang"]);
    expect(direct.changed).toBe(true);
    expect(direct.types[0].fields![0].basis).toBe("total");
    expect(direct.types[1]).toBe(pull); // reps: nothing to mark
    const merged = adoptTotalBasis([hang], defs, ["max-hang-20"]);
    expect(merged.types[0].fields![0].basis).toBe("total");
  });
  it("changes nothing when nothing applies", () => {
    const none = adoptTotalBasis([hang, pull], defs, ["other"]);
    expect(none.changed).toBe(false);
    expect(none.types[0]).toBe(hang);
    expect(adoptTotalBasis([{ ...hang, fields: [{ valueId: "weight", role: "result", basis: "total" }] }], defs, ["max-hang"]).changed).toBe(false);
  });
});
