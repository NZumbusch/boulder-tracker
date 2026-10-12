import type { Benchmark, BenchmarkTypeDef, DailyMetricEntry, ValueDef } from "../types";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import { localIsoDate } from "../dateUtils";
import { measureOfUnit } from "./upgrade";
import { resolveFields } from "./model";

/**
 * A weigh-in is a daily reading (the Bodyweight metric), not a test: Home,
 * readiness and the %-of-bodyweight scores all read the metric. A test that is
 * only a weigh-in - "Bodyweight", "Body weight", "Weigh-in" - is therefore
 * retired: its results become daily readings (`planWeighInMigration`), it is
 * archived, planned slots for it go, and the AI is never offered it.
 *
 * Everything here is pure and total: old data comes in many shapes (a result
 * from before fields has only `value` + `unit`, a result may name a test that
 * was deleted, units were typed by hand), and none of it may throw.
 */

/** Plausible human bodyweights, in kg. Anything else is a typo, not a reading. */
export const MIN_BODYWEIGHT_KG = 20;
export const MAX_BODYWEIGHT_KG = 400;

const WEIGH_IN_NAMES = new Set(["bodyweight", "body weight", "body mass", "weigh in", "weighin", "my weight", "weight", "bw", "body weight test", "bodyweight test"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Whether a test's name says "a weigh-in". Plain "Weight" counts: a test of added weight is named for its exercise ("Max Hang"). */
export const isWeighInName = (name: string): boolean => WEIGH_IN_NAMES.has(words(name));

/**
 * A test that is only a weigh-in: a weigh-in name and one result that is a
 * weight (no conditions, not "added weight"). A test from before fields has
 * just its unit to go by.
 */
export function isWeighInType(type: Pick<BenchmarkTypeDef, "name" | "unit" | "fields">, defs: readonly ValueDef[]): boolean {
  if (!isWeighInName(type.name)) return false;
  if (!type.fields || type.fields.length === 0) return measureOfUnit(type.unit)?.key === "weight";
  const fields = resolveFields(type, defs);
  if (fields.length !== 1 || fields[0].role !== "result") return false;
  if (/added|extra/i.test(fields[0].label)) return false;
  return fields[0].measure === "weight" || measureOfUnit(type.unit)?.key === "weight";
}

/** The calendar day a result is dated: a plain day as is, a timestamp as the local day. */
function dayOf(date: string): string | null {
  if (typeof date !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const t = new Date(date);
  return Number.isNaN(t.getTime()) ? (/^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null) : localIsoDate(t);
}

/**
 * A result's weight in kg. A result with fields stores weights in kg already;
 * one from before fields carries only a unit as typed ("kg", "lbs").
 */
export function resultKg(b: Pick<Benchmark, "value" | "unit" | "values">, type?: Pick<BenchmarkTypeDef, "fields">): number | null {
  let raw = b.value;
  let factor = 1;
  const hasFields = !!type?.fields?.length;
  if (hasFields) {
    const first = type!.fields!.find((f) => f.role === "result");
    const stored = first ? b.values?.[first.valueId] : undefined;
    if (typeof stored === "number") raw = stored;
  } else if (b.unit) {
    const m = measureOfUnit(b.unit);
    if (m?.key === "weight") factor = m.factor;
    else return null; // a unit that isn't a weight, or isn't known: not guessing (no unit at all reads as kg)
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const kg = Math.round(raw * factor * 100) / 100;
  return kg >= MIN_BODYWEIGHT_KG && kg <= MAX_BODYWEIGHT_KG ? kg : null;
}

/** The id a weigh-in on a day gets: the same on every device, so a sync never doubles it. */
export const weighInEntryId = (day: string): string => `bodyweight-${day}`;

/**
 * The daily bodyweight reading a just-logged weigh-in result stands for, or
 * null when it isn't one. `existingId` keeps one entry per day.
 */
export function bodyweightFromBenchmark(b: Pick<Benchmark, "type" | "value" | "unit" | "date" | "values">, type: Pick<BenchmarkTypeDef, "name" | "unit" | "fields"> | undefined, defs: readonly ValueDef[], existingId?: string): DailyMetricEntry | null {
  const weighIn = type ? isWeighInType(type, defs) : isWeighInName(b.type) && measureOfUnit(b.unit)?.key === "weight";
  if (!weighIn) return null;
  const kg = resultKg(b, type);
  const day = dayOf(b.date);
  if (kg === null || day === null) return null;
  return { id: existingId ?? weighInEntryId(day), metricId: BODYWEIGHT_METRIC_ID, date: day, value: kg };
}

export interface WeighInMigration {
  /** Readings to add: one per day that had none. */
  entries: DailyMetricEntry[];
  /** Tests to archive: every weigh-in test not archived yet. */
  typeIds: string[];
  /** Results that are weigh-ins - the ones the readings come from. They stay in history. */
  resultIds: string[];
  /** Days that already had a reading (kept as they are - what was logged by hand wins). */
  keptDays: number;
  /** Results that could not become a reading, with why. */
  skipped: { resultId: string; reason: string }[];
}

/**
 * Moves weigh-in tests over to the Bodyweight metric. Safe on any data and to
 * run twice: it only adds readings for days without one, never overwrites,
 * and a second run finds nothing to add.
 *
 * - Results count by their test (a weigh-in test, archived or not) or, when
 *   the test is gone, by their own name and a weight unit.
 * - Several results on a day give one reading: the last in the list.
 * - A weight that is not plausible (0, 7, 700) or in a unit that isn't a weight is skipped and reported.
 */
export function planWeighInMigration(types: readonly BenchmarkTypeDef[], benchmarks: readonly Benchmark[], defs: readonly ValueDef[], dailyMetrics: readonly DailyMetricEntry[]): WeighInMigration {
  const weighTypes = types.filter((t) => isWeighInType(t, defs));
  const byId = new Map(types.map((t) => [t.id, t] as const));
  const weighIds = new Set(weighTypes.map((t) => t.id));
  const have = new Set(dailyMetrics.filter((m) => m.metricId === BODYWEIGHT_METRIC_ID).map((m) => m.date));

  const resultIds: string[] = [];
  const skipped: WeighInMigration["skipped"] = [];
  const perDay = new Map<string, DailyMetricEntry>();
  let keptDays = 0;
  const counted = new Set<string>();

  for (const b of benchmarks) {
    const type = byId.get(b.typeId);
    const orphan = !type && isWeighInName(b.type ?? "");
    if (!weighIds.has(b.typeId) && !orphan) continue;
    resultIds.push(b.id);
    const kg = resultKg(b, type);
    const day = dayOf(b.date);
    if (kg === null) { skipped.push({ resultId: b.id, reason: "no usable weight" }); continue; }
    if (day === null) { skipped.push({ resultId: b.id, reason: "no usable date" }); continue; }
    if (have.has(day)) { if (!counted.has(day)) { counted.add(day); keptDays++; } continue; }
    perDay.set(day, { id: weighInEntryId(day), metricId: BODYWEIGHT_METRIC_ID, date: day, value: kg });
  }
  return {
    entries: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    typeIds: weighTypes.filter((t) => !t.archived).map((t) => t.id),
    resultIds,
    keptDays,
    skipped,
  };
}

/** The ids of the weigh-in tests, for dropping their planned slots. Archived ones count. */
export const weighInTypeIds = (types: readonly BenchmarkTypeDef[], defs: readonly ValueDef[]): string[] => types.filter((t) => isWeighInType(t, defs)).map((t) => t.id);

/**
 * Sessions that still plan a weigh-in test, as the same sessions without it.
 * Only sessions not done yet change: a finished one keeps its test slot (and
 * the result it recorded) as the history of what happened.
 */
export function withoutWeighInSlots<W extends { status?: string; exercises?: { test?: { typeId: string } }[] }>(workouts: readonly W[], typeIds: readonly string[]): W[] {
  const ids = new Set(typeIds);
  const out: W[] = [];
  for (const w of workouts) {
    if (w.status === "completed") continue;
    const slots = w.exercises ?? [];
    const kept = slots.filter((s) => !(s.test && ids.has(s.test.typeId)));
    if (kept.length !== slots.length) out.push({ ...w, exercises: kept });
  }
  return out;
}

type SlotLike = { test?: { typeId: string } };

/** A session template without the weigh-in test slots; the same object back when it had none. */
function strip<T extends { exercises: SlotLike[] }>(t: T, ids: Set<string>): T {
  const kept = t.exercises.filter((s) => !(s.test && ids.has(s.test.typeId)));
  return kept.length === t.exercises.length ? t : { ...t, exercises: kept };
}

/**
 * The phases' session templates without weigh-in test slots - `changed` lists the phases whose
 * list is different, as the new lists, `count` the slots dropped. (A template is a plan for
 * every week a phase covers, so a weigh-in test left in one would keep coming back.)
 */
export function withoutWeighInSlotsInTemplates<T extends { exercises: SlotLike[] }>(templates: Record<string, T[]>, typeIds: readonly string[]): { changed: Record<string, T[]>; count: number } {
  const ids = new Set(typeIds);
  const changed: Record<string, T[]> = {};
  let count = 0;
  for (const [phase, list] of Object.entries(templates ?? {})) {
    const next = (list ?? []).map((t) => strip(t, ids));
    if (next.some((t, i) => t !== list[i])) {
      changed[phase] = next;
      count += list.reduce((n, t, i) => n + (t.exercises.length - next[i].exercises.length), 0);
    }
  }
  return { changed, count };
}

/** Plan B alternatives whose sessions held a weigh-in test slot, as the same alternatives without it. */
export function withoutWeighInSlotsInAlternatives<A extends { changes: { session?: { exercises: SlotLike[] } }[] }>(alternatives: readonly A[], typeIds: readonly string[]): { changed: A[]; count: number } {
  const ids = new Set(typeIds);
  const changed: A[] = [];
  let count = 0;
  for (const alt of alternatives) {
    let touched = false;
    const changes = (alt.changes ?? []).map((c) => {
      if (!c.session) return c;
      const session = strip(c.session, ids);
      if (session === c.session) return c;
      touched = true;
      count += c.session.exercises.length - session.exercises.length;
      return { ...c, session };
    });
    if (touched) changed.push({ ...alt, changes });
  }
  return { changed, count };
}
