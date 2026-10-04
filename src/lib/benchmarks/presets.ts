/**
 * Starting points for a new benchmark test: the common ones, already set up
 * with the right fields, direction and score - pick one and change what
 * differs, or start from nothing.
 */
import type { BenchmarkTypeDef, ValueDef } from "../types";
import { BENCHMARK_VALUE_DEFS } from "./upgrade";

export interface BenchmarkPreset {
  id: string;
  label: string;
  hint: string;
  /** The test, without an id. */
  make: () => Omit<BenchmarkTypeDef, "id">;
}

export const BENCHMARK_PRESETS: BenchmarkPreset[] = [
  {
    id: "max-hang",
    label: "Max hang",
    hint: "Added weight on an edge - compare edges, weights or hang times over time",
    make: () => ({ name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" }, { valueId: "weight", role: "result", label: "Added weight" }] }),
  },
  {
    id: "min-edge",
    label: "Minimum edge",
    hint: "The smallest edge you can hang - lower is better",
    make: () => ({ name: "Minimum Edge", unit: "mm", direction: "lower", fields: [{ valueId: "edge", role: "result", label: "Smallest edge" }, { valueId: "time", role: "condition", fixed: 10 }] }),
  },
  {
    id: "max-reps",
    label: "Max reps",
    hint: "Pull-ups, dips, push-ups - with an optional added weight",
    make: () => ({ name: "Max Pullups", unit: "reps", fields: [{ valueId: "reps", role: "result" }, { valueId: "weight", role: "condition", label: "Added weight" }] }),
  },
  {
    id: "weight-for-reps",
    label: "Weight for reps",
    hint: "Both change between tests - charted as an estimated one-rep max, and reps against weight (both are results, so nothing is split)",
    make: () => ({ name: "Weighted Pullup", unit: "kg", score: "estimatedMax", fields: [{ valueId: "weight", role: "result", label: "Added weight" }, { valueId: "reps", role: "result" }] }),
  },
  {
    id: "one-rep-max",
    label: "One-rep max",
    hint: "The heaviest single",
    make: () => ({ name: "1RM Weighted Pullup", unit: "kg", fields: [{ valueId: "weight", role: "result", label: "Added weight" }, { valueId: "reps", role: "condition", fixed: 1 }] }),
  },
  {
    id: "hold",
    label: "Hold time",
    hint: "L-sit, front lever, plank, dead hang - how long",
    make: () => ({ name: "L-Sit Duration", unit: "s", fields: [{ valueId: "time", role: "result" }] }),
  },
  {
    id: "timed",
    label: "Timed effort",
    hint: "A circuit or a run - lower is better",
    make: () => ({ name: "Timed Circuit", unit: "s", direction: "lower", fields: [{ valueId: "time", role: "result" }] }),
  },
  {
    id: "blank",
    label: "Start from nothing",
    hint: "Name it and pick what it records",
    make: () => ({ name: "", unit: "kg", fields: [{ valueId: "weight", role: "result" }] }),
  },
];

/** The built-in value types a test uses that are no longer in the registry (deleted), ready to put back. */
export function missingBuiltIns(type: Pick<BenchmarkTypeDef, "fields">, defs: readonly ValueDef[]): ValueDef[] {
  const have = new Set(defs.map((d) => d.id));
  const wanted = new Set((type.fields ?? []).map((f) => f.valueId));
  return Object.values(BENCHMARK_VALUE_DEFS).filter((d) => wanted.has(d.id) && !have.has(d.id)).map((d) => ({ ...d }));
}
