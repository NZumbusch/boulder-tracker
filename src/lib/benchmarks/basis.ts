/**
 * Whether a benchmark's weight is the load on top of the body or the whole
 * load used to be a list of test ids in the preferences ("this one already
 * includes bodyweight"). It is now a property of the test's weight field
 * (`BenchmarkField.basis`). This carries the old choice over, once: a test
 * named in the list - or one merged from a test that was - gets "total".
 */
import type { BenchmarkTypeDef, ValueDef } from "../types";

export function adoptTotalBasis(types: BenchmarkTypeDef[], defs: readonly ValueDef[], totalIds: readonly string[]): { types: BenchmarkTypeDef[]; changed: boolean } {
  const wanted = new Set(totalIds);
  let changed = false;
  const out = types.map((t) => {
    if (!(wanted.has(t.id) || t.mergedFrom?.some((id) => wanted.has(id)))) return t;
    const weightField = (t.fields ?? []).find((f) => f.role === "result" && defs.find((d) => d.id === f.valueId)?.measure === "weight");
    if (!weightField || weightField.basis === "total") return t;
    changed = true;
    return { ...t, fields: t.fields!.map((f) => (f === weightField ? { ...f, basis: "total" as const } : f)) };
  });
  return { types: changed ? out : types, changed };
}
