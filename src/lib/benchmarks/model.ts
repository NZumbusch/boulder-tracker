/**
 * Reading a benchmark test and its results through their fields.
 *
 * A test (`BenchmarkTypeDef`) lists what it records; each field is a value
 * type (`ValueDef`, the same registry exercises draw their extra values
 * from) in a role: a *result* (what is measured) or a *condition* (how it
 * was done). A test from before fields has none, and reads as a single
 * result in its `unit` - everything here works on both.
 *
 * Weights are stored in kg and shown in the chosen unit; the rest is stored
 * as typed.
 */
import type { Benchmark, BenchmarkField, BenchmarkTypeDef, ValueDef, ValueMeasure } from "../types";
import { displayWeight, toKg, type WeightUnit } from "../units";

/** The value-type id standing in for the one result of a test from before fields. */
export const LEGACY_RESULT_ID = "result";

export interface ResolvedField {
  valueId: string;
  role: "result" | "condition";
  /** The name in this test: the field's own label, else the value type's. */
  label: string;
  /** The unit as stored ("kg" for any weight; see `unitLabel` for what is shown). */
  unit: string;
  measure?: ValueMeasure;
  kind: "number" | "choice";
  options: string[];
  fixed?: number | string;
  basis: "added" | "total";
  /** False when the value type is gone (deleted): the field still reads, by its label or id. */
  known: boolean;
}

/** The test's fields with their value types looked up. */
export function resolveFields(type: Pick<BenchmarkTypeDef, "unit" | "fields">, defs: readonly ValueDef[]): ResolvedField[] {
  if (!type.fields || type.fields.length === 0) {
    return [{ valueId: LEGACY_RESULT_ID, role: "result", label: "Result", unit: type.unit, kind: "number", options: [], basis: "added", known: true }];
  }
  return type.fields.map((f) => {
    const def = defs.find((d) => d.id === f.valueId);
    return {
      valueId: f.valueId,
      role: f.role,
      label: f.label?.trim() || def?.name || f.valueId,
      unit: def?.unit ?? "",
      measure: def?.measure,
      kind: def?.kind ?? "number",
      options: def?.options ?? [],
      fixed: f.fixed,
      basis: f.basis ?? "added",
      known: !!def,
    };
  });
}

export const primaryField = (fields: ResolvedField[]): ResolvedField | undefined => fields.find((f) => f.role === "result");
export const resultFields = (fields: ResolvedField[]) => fields.filter((f) => f.role === "result");
export const conditionFields = (fields: ResolvedField[]) => fields.filter((f) => f.role === "condition");
/** What is asked for when logging: every field without a fixed value. */
export const askedFields = (fields: ResolvedField[]) => fields.filter((f) => f.fixed === undefined);

// --- Units -----------------------------------------------------------------

/** The unit to show for a field: weights follow the unit setting. */
export function unitLabel(field: Pick<ResolvedField, "measure" | "unit">, weight: WeightUnit): string {
  return field.measure === "weight" ? weight : field.unit;
}

/** A stored number as typed/shown. */
export function toShown(field: Pick<ResolvedField, "measure">, value: number, weight: WeightUnit): number {
  return field.measure === "weight" ? Math.round(displayWeight(value, weight) * 10) / 10 : value;
}

/** A typed number as stored. */
export function fromShown(field: Pick<ResolvedField, "measure">, value: number, weight: WeightUnit): number {
  return field.measure === "weight" ? Math.round(toKg(value, weight) * 100) / 100 : value;
}

/** One value as text: "45 kg", "14 reps", "1:30", a pick-list's choice. */
export function formatFieldValue(field: ResolvedField, value: number | string | undefined, weight: WeightUnit): string {
  if (value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  if (field.measure === "time" && value >= 120) return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;
  const shown = toShown(field, value, weight);
  const unit = unitLabel(field, weight);
  return unit ? `${Number(shown.toFixed(2))} ${unit}` : String(Number(shown.toFixed(2)));
}

// --- Results ---------------------------------------------------------------

/** All of a result's values by value-type id; the primary result is always there (`value`). */
export function resultValues(b: Benchmark, fields: ResolvedField[]): Record<string, number | string> {
  const values: Record<string, number | string> = { ...(b.values ?? {}) };
  const primary = primaryField(fields);
  if (primary && values[primary.valueId] === undefined) values[primary.valueId] = b.value;
  for (const f of fields) if (f.fixed !== undefined && values[f.valueId] === undefined) values[f.valueId] = f.fixed;
  return values;
}

/** "20 mm" or "20 mm · 10 s": the conditions a result was done under (fixed ones are left out - they never differ). */
export function conditionsText(b: Benchmark, fields: ResolvedField[], weight: WeightUnit): string {
  const values = resultValues(b, fields);
  return conditionFields(fields)
    .filter((f) => f.fixed === undefined)
    .map((f) => formatFieldValue(f, values[f.valueId], weight))
    .filter(Boolean)
    .join(" · ");
}

/**
 * Which results are the same test done the same way: the values of the
 * conditions that vary, as one string ("" when the test has none).
 */
export function conditionKey(b: Benchmark, fields: ResolvedField[]): string {
  const values = resultValues(b, fields);
  return conditionFields(fields)
    .filter((f) => f.fixed === undefined)
    .map((f) => `${f.valueId}=${values[f.valueId] ?? ""}`)
    .join("|");
}

// --- Editing a test ---------------------------------------------------------

/** What is wrong with a test as drafted, if anything. */
export function typeProblem(draft: BenchmarkTypeDef, otherNames: Iterable<string>): string | null {
  const name = draft.name.trim();
  if (!name) return "Give the test a name.";
  if ([...otherNames].some((n) => n.trim().toLowerCase() === name.toLowerCase())) return "Another test already has this name.";
  const fields = draft.fields ?? [];
  if (!fields.some((f) => f.role === "result")) return "A test needs a result - what it measures.";
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.valueId) return "Every field needs a value type.";
    if (seen.has(f.valueId)) return "A value type can only be used once in a test.";
    seen.add(f.valueId);
  }
  return null;
}

/** The test ready to save: trimmed, and its `unit` kept in step with its primary result (what readers from before fields see). */
export function finalizeType(draft: BenchmarkTypeDef, defs: readonly ValueDef[]): BenchmarkTypeDef {
  const fields: BenchmarkField[] = (draft.fields ?? []).map((f) => {
    const out: BenchmarkField = { valueId: f.valueId, role: f.role };
    if (f.label?.trim()) out.label = f.label.trim();
    if (f.fixed !== undefined && f.fixed !== "") out.fixed = f.fixed;
    if (f.basis === "total") out.basis = "total";
    return out;
  });
  const type: BenchmarkTypeDef = { ...draft, name: draft.name.trim(), fields };
  const primary = primaryField(resolveFields({ unit: draft.unit, fields }, defs));
  if (primary) type.unit = primary.unit;
  if (!type.group?.trim()) delete type.group;
  else type.group = type.group.trim();
  if (!type.protocol?.trim()) delete type.protocol;
  if (type.direction !== "lower") delete type.direction;
  if (!type.score || type.score === "raw") delete type.score;
  return type;
}

/** The tests by folder: folders in the order they first appear, ungrouped last. */
export function groupTypes<T extends { group?: string }>(types: T[]): { group: string; types: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const t of types) {
    const g = t.group?.trim() ?? "";
    if (!map.has(g)) {
      map.set(g, []);
      if (g) order.push(g);
    }
    map.get(g)!.push(t);
  }
  if (map.has("")) order.push("");
  return order.map((g) => ({ group: g, types: map.get(g)! }));
}

/** A result as shown in a list: "Max Hang · 20 mm" and "45 kg" (the primary result, in the unit setting). */
export function describeResult(b: Benchmark, types: readonly BenchmarkTypeDef[], defs: readonly ValueDef[], weight: WeightUnit): { title: string; value: string } {
  const type = types.find((t) => t.id === b.typeId);
  if (!type) return { title: b.type, value: `${b.value} ${b.unit}`.trim() };
  const fields = resolveFields(type, defs);
  const primary = primaryField(fields);
  const where = conditionsText(b, fields, weight);
  return {
    title: where ? `${type.name} · ${where}` : type.name,
    value: primary ? formatFieldValue(primary, b.value, weight) : `${b.value} ${b.unit}`.trim(),
  };
}
