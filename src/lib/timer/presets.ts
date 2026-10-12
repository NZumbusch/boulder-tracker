import type { ExerciseValues } from "../types";
import { REP_LABELS, isRepLabel } from "../exercise/repLabel";

/**
 * A saved run: any timer set up once - a repeater, a rest-timed set, a
 * pacer, a countdown - kept under a name to start again from the Timer
 * sheet or Home. Just the numbers of one exercise and its get-ready time;
 * what runs is always `soloRun(values)`. Kept in the preferences (so it
 * travels with the settings), repaired on every load: nothing here throws.
 */

export type PresetVariant = "timed" | "counted" | "pacer";
export const PRESET_VARIANTS: PresetVariant[] = ["timed", "counted", "pacer"];
export const MAX_PRESETS = 30;

export interface TimerPreset {
  id: string;
  name: string;
  variant: PresetVariant;
  values: ExerciseValues;
  leadIn: number;
}

/** The numbers a preset can hold, with their limits. */
const NUMBER_FIELDS: { key: keyof ExerciseValues; min: number; max: number }[] = [
  { key: "sets", min: 1, max: 99 },
  { key: "reps", min: 1, max: 99 },
  { key: "timeOn", min: 1, max: 3600 },
  { key: "timeOff", min: 0, max: 3600 },
  { key: "timeBetweenSets", min: 0, max: 3600 },
  { key: "cadence", min: 0.5, max: 120 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Only the timing numbers, within limits; anything else (or junk) is dropped. */
export function cleanPresetValues(raw: unknown): ExerciseValues {
  const out: ExerciseValues = {};
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const f of NUMBER_FIELDS) {
    const v = r[f.key];
    if (typeof v === "number" && Number.isFinite(v)) (out as Record<string, number>)[f.key] = round2(Math.min(f.max, Math.max(f.min, v)));
  }
  if (isRepLabel(r.repLabel)) out.repLabel = r.repLabel;
  return out;
}

/** The variant a set of numbers is: a time per problem, a timed hold or repeater, or counted sets. */
export function variantOf(values: ExerciseValues): PresetVariant {
  if (values.timeOn !== undefined) return "timed";
  if (values.cadence !== undefined && values.reps === undefined) return "pacer";
  return "counted";
}

export function validateTimerPresets(raw: unknown): TimerPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TimerPreset[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) continue;
    const r = p as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 80 ? r.id : null;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
    if (!id || !name || seen.has(id)) continue;
    const values = cleanPresetValues(r.values);
    if (Object.keys(values).length === 0) continue;
    const variant = PRESET_VARIANTS.includes(r.variant as PresetVariant) ? (r.variant as PresetVariant) : variantOf(values);
    const leadIn = typeof r.leadIn === "number" && Number.isFinite(r.leadIn) ? Math.min(120, Math.max(0, Math.round(r.leadIn))) : 10;
    seen.add(id);
    out.push({ id, name, variant, values, leadIn });
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

/** A preset's one-line description for a list: "4 × 6 · 7 s on, 3 s off · 3:00 between", "Every 6 min · 10 problems". */
export function describePreset(p: Pick<TimerPreset, "variant" | "values">): string {
  const v = p.values;
  const t = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);
  if (p.variant === "pacer") return `Every ${v.cadence ?? "?"} min${v.sets ? ` · ${v.sets} problems` : ""}`;
  const parts: string[] = [];
  const side = v.repLabel && v.repLabel !== "Hold" && v.repLabel !== "Rep" && v.repLabel !== "Round" ? ` per ${v.repLabel.toLowerCase()}` : "";
  const reps = typeof v.reps === "number" ? v.reps : undefined;
  if (v.sets && v.sets > 1) parts.push(`${v.sets} × ${reps ?? 1}`);
  else if (reps && reps > 1) parts.push(`${reps} reps`);
  if (p.variant === "timed") parts.push(`${t(v.timeOn ?? 0)}${side} on${v.timeOff ? `, ${t(v.timeOff)} off` : ""}`);
  if (v.timeBetweenSets) parts.push(`${t(v.timeBetweenSets)} between`);
  return parts.join(" · ") || "Open stopwatch";
}

export { REP_LABELS };
