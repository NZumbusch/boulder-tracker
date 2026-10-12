import type { Benchmark, BenchmarkTypeDef, ExerciseSlot, ValueDef } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import type { WeightUnit } from "../units";
import { askedFields, conditionsText, formatFieldValue, fromShown, resolveFields, resultValues, toShown, type ResolvedField } from "./model";

/**
 * A benchmark test planned as part of a session: an exercise slot that names
 * the test and the conditions it is to be done under. In a live session it
 * takes the result and records it as a `Benchmark` linked to the slot, so a
 * test is scheduled and logged like the rest of the session - and the plan
 * (the athlete's or the AI's) can put one where it fits.
 */

/** The `typeId` of every test slot - not an exercise type in the library; the slot's `test` says what it is. */
export const TEST_SLOT_TYPE_ID = "test";
/** Minutes a test slot is planned to take (warm-up, attempts and rest). */
export const TEST_SLOT_MINUTES = 10;
/** A test is called due after this many weeks without a result. */
export const DEFAULT_RETEST_WEEKS = 6;

export const isTestSlot = (slot: Pick<ExerciseSlot, "test">): slot is { test: NonNullable<ExerciseSlot["test"]> } & typeof slot => !!slot.test;

/** The slot's name everywhere an exercise's name is shown, and what an AI change set calls it. */
export const testSlotName = (testName: string): string => `Test: ${testName}`;

/** The id of the result a slot records - stable, so logging again edits the same result. */
export const testResultId = (slotId: string): string => `test-${slotId}`;

export function makeTestSlot(args: { id: string; type: Pick<BenchmarkTypeDef, "id" | "name">; conditions?: Record<string, number | string>; categoryId?: string }): ExerciseSlot {
  const conditions = args.conditions && Object.keys(args.conditions).length ? { ...args.conditions } : undefined;
  return {
    id: args.id,
    typeId: TEST_SLOT_TYPE_ID,
    ...(args.categoryId ? { categoryId: args.categoryId } : {}),
    test: { typeId: args.type.id, name: args.type.name, ...(conditions ? { conditions } : {}) },
    prescribed: { duration: TEST_SLOT_MINUTES },
  };
}

/** The result recorded for a slot, if any. */
export function resultForSlot(benchmarks: readonly Benchmark[], slotId: string): Benchmark | undefined {
  return benchmarks.find((b) => b.slotId === slotId);
}

/** A test's results, newest first. */
export function resultsOf(benchmarks: readonly Benchmark[], typeId: string): Benchmark[] {
  return benchmarks.filter((b) => b.typeId === typeId).sort((a, b) => b.date.localeCompare(a.date));
}

/** The conditions a new result of this test starts from: those of the last one. */
export function lastConditions(type: BenchmarkTypeDef, defs: readonly ValueDef[], benchmarks: readonly Benchmark[]): Record<string, number | string> {
  const last = resultsOf(benchmarks, type.id)[0];
  if (!last) return {};
  const fields = resolveFields(type, defs);
  const values = resultValues(last, fields);
  const out: Record<string, number | string> = {};
  for (const f of askedFields(fields)) if (f.role === "condition" && values[f.valueId] !== undefined) out[f.valueId] = values[f.valueId];
  return out;
}

/** "Edge depth 20 mm · Time 7 s" - what the plan sets beforehand, in words (empty without any). Any field can be set: the rest is what the test is to find ("Reps 1" -> find the weight). */
export function plannedConditionsText(slot: Pick<ExerciseSlot, "test">, type: BenchmarkTypeDef | undefined, defs: readonly ValueDef[], weight: WeightUnit): string {
  const conditions = slot.test?.conditions;
  if (!conditions || !type) return "";
  const fields = resolveFields(type, defs);
  return fields
    .filter((f) => f.fixed === undefined && conditions[f.valueId] !== undefined)
    .map((f) => `${f.label} ${formatFieldValue(f, conditions[f.valueId], weight)}`)
    .join(" · ");
}

/** The result line for a slot that has one: "51.5 kg · 20 mm · 7 s". */
export function resultText(b: Benchmark, type: BenchmarkTypeDef | undefined, defs: readonly ValueDef[], weight: WeightUnit): string {
  if (!type) return `${b.value} ${b.unit}`;
  const fields = resolveFields(type, defs);
  const primary = fields.find((f) => f.role === "result");
  const main = primary ? formatFieldValue(primary, b.value, weight) : `${b.value} ${b.unit}`;
  const cond = conditionsText(b, fields, weight);
  return cond ? `${main} · ${cond}` : main;
}

export interface PlannedTest { week: string; session?: string; day?: string }

/** Where each test is already scheduled: planned slots that have no result yet, by test id. */
export function plannedTestsByType(workouts: readonly { status: string; weekId: string; notes?: string; dayOfWeek?: string; exercises: readonly ExerciseSlot[] }[], benchmarks: readonly Benchmark[]): Map<string, PlannedTest[]> {
  const out = new Map<string, PlannedTest[]>();
  for (const w of workouts) {
    if (w.status !== "planned") continue;
    for (const slot of w.exercises) {
      if (!slot.test || slot.skipped || resultForSlot(benchmarks, slot.id)) continue;
      const list = out.get(slot.test.typeId) ?? [];
      list.push({ week: w.weekId, ...(w.notes ? { session: w.notes } : {}), ...(w.dayOfWeek ? { day: w.dayOfWeek } : {}) });
      out.set(slot.test.typeId, list);
    }
  }
  return out;
}

export interface TestStatus {
  type: BenchmarkTypeDef;
  /** The most recent result. */
  last?: Benchmark;
  /** Whole weeks since it; undefined without a result. */
  weeksSince?: number;
  /** Done before, and not for `retestWeeks`. */
  due: boolean;
  /** No result yet - optional, never "due" on its own, so a long list of tests isn't a long to-do. */
  never: boolean;
  /** A planned test slot for it that has no result yet (it is already scheduled). */
  scheduled: boolean;
}

/** Every test on offer with when it was last done, whether it is due and whether one is already planned. */
export function testStatuses(
  types: readonly BenchmarkTypeDef[],
  benchmarks: readonly Benchmark[],
  asOf: Date,
  plannedTestTypeIds: ReadonlySet<string> = new Set(),
  retestWeeks = DEFAULT_RETEST_WEEKS,
): TestStatus[] {
  const today = toUtcDayIndex(asOf.toISOString());
  return types
    .filter((t) => !t.archived)
    .map((type) => {
      const last = resultsOf(benchmarks, type.id)[0];
      const weeksSince = last ? Math.max(0, Math.floor((today - toUtcDayIndex(last.date)) / 7)) : undefined;
      return { type, last, weeksSince, due: weeksSince !== undefined && weeksSince >= retestWeeks, never: weeksSince === undefined, scheduled: plannedTestTypeIds.has(type.id) };
    });
}

// --- The test sheet's inputs ------------------------------------------------


const parseNumber = (text: string | undefined): number | undefined => {
  const t = (text ?? "").trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Stored values as the text the inputs show (weights in the chosen unit). */
export function inputsFromValues(fields: readonly ResolvedField[], values: Record<string, number | string> | undefined, weight: WeightUnit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of askedFields([...fields])) {
    const v = values?.[f.valueId];
    if (v === undefined) continue;
    out[f.valueId] = typeof v === "string" ? v : String(toShown(f, v, weight));
  }
  return out;
}

/** What was typed as stored values (weights in kg); fields left empty are left out, fixed ones are always there. */
export function valuesFromInputs(fields: readonly ResolvedField[], inputs: Record<string, string>, weight: WeightUnit): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const f of fields) {
    if (f.fixed !== undefined) {
      out[f.valueId] = f.fixed;
      continue;
    }
    const raw = inputs[f.valueId];
    if (f.kind === "choice") {
      if (raw) out[f.valueId] = raw;
      continue;
    }
    const n = parseNumber(raw);
    if (n !== undefined) out[f.valueId] = fromShown(f, n, weight);
  }
  return out;
}
