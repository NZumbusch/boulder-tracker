/**
 * What the tests still need from the athlete after an update: moves that
 * change their data are offered, never done silently (Settings → Tests has
 * the cards, with Undo). The "what's new" sheet counts them to say so.
 */
import type { Benchmark, BenchmarkTypeDef, DailyMetricEntry, ValueDef, Workout } from "../types";
import { planWeighInMigration, weighInTypeIds, withoutWeighInSlots } from "./bodyweight";
import { proposeTidy } from "./tidy";

export interface PendingTestActions {
  /** Weigh-in results (or a weigh-in test, or planned weigh-in sessions) still to move to Bodyweight. */
  weighIn: boolean;
  /** Tidy-up proposals ticked by default (merge duplicates, combine a lift kept as two tests). */
  tidy: number;
  /** Their labels, for the sheet. */
  tidyLabels: string[];
}

export function pendingTestActions(
  types: readonly BenchmarkTypeDef[],
  benchmarks: readonly Benchmark[],
  defs: readonly ValueDef[],
  dailyMetrics: readonly DailyMetricEntry[],
  workouts: readonly Workout[],
): PendingTestActions {
  const w = planWeighInMigration(types, benchmarks, defs, dailyMetrics);
  const slots = withoutWeighInSlots(workouts, weighInTypeIds(types, defs));
  const tidy = proposeTidy(types, benchmarks, defs).filter((p) => p.defaultOn);
  return { weighIn: w.typeIds.length > 0 || w.entries.length > 0 || slots.length > 0, tidy: tidy.length, tidyLabels: tidy.map((p) => p.label) };
}
