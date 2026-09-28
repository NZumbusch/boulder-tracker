import type { ExerciseTypeDef, Workout, WorkoutTemplate, Circuit } from "../types";

/**
 * The exercise library: groups, search and usage over `ExerciseTypeDef`s.
 * Pure - the Settings library, the exercise picker and the AI prompt all
 * read the same answers from here.
 */

/** Where an exercise sits in the library: its own group, else its analytics category's name. */
export function exerciseGroup(type: Pick<ExerciseTypeDef, "group" | "category">): string {
  return type.group?.trim() || type.category?.trim() || "Other";
}

export interface LibraryGroup {
  name: string;
  types: ExerciseTypeDef[];
}

/**
 * Types grouped for display, groups A-Z and types A-Z within them (a
 * caller can re-sort each group's types). Archived types are left out
 * unless `includeArchived`.
 */
export function groupTypes(types: ExerciseTypeDef[], { includeArchived = false } = {}): LibraryGroup[] {
  const groups = new Map<string, ExerciseTypeDef[]>();
  for (const t of types) {
    if (t.archived && !includeArchived) continue;
    const g = exerciseGroup(t);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(t);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([name, list]) => ({ name, types: [...list].sort(byName) }));
}

/** Every group name in use (archived types don't keep a group alive), A-Z. */
export function groupNames(types: ExerciseTypeDef[]): string[] {
  return groupTypes(types).map((g) => g.name);
}

const byName = (a: ExerciseTypeDef, b: ExerciseTypeDef) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Search by name, group, category and description. Every word of the
 * query has to appear somewhere; name matches rank first (a name starting
 * with the query first of all), then group/category, then description.
 */
export function searchTypes(types: ExerciseTypeDef[], query: string): ExerciseTypeDef[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...types];
  const q = fold(query.trim());
  const scored: { t: ExerciseTypeDef; score: number }[] = [];
  for (const t of types) {
    const name = fold(t.name);
    const meta = fold(`${exerciseGroup(t)} ${t.category ?? ""}`);
    const desc = fold(t.description ?? "");
    if (!words.every((w) => name.includes(w) || meta.includes(w) || desc.includes(w))) continue;
    const score = name.startsWith(q) ? 0
      : words.every((w) => name.includes(w)) ? 1
      : words.every((w) => name.includes(w) || meta.includes(w)) ? 2
      : 3;
    scored.push({ t, score });
  }
  return scored.sort((a, b) => a.score - b.score || byName(a.t, b.t)).map((s) => s.t);
}

export interface TypeUsage {
  /** Exercises of this type across dated sessions (planned and done). */
  count: number;
  /** The latest such session's day (YYYY-MM-DD) up to `today`, "" if none - planned ones ahead don't count as "used". */
  lastUsed: string;
}

/** How often and how recently each type appears in dated sessions. `today` is a YYYY-MM-DD day. */
export function typeUsage(workouts: Workout[], today = "9999-12-31"): Map<string, TypeUsage> {
  const usage = new Map<string, TypeUsage>();
  for (const w of workouts) {
    if (!w.date) continue;
    const day = w.date.slice(0, 10);
    for (const slot of w.exercises ?? []) {
      const entry = usage.get(slot.typeId) ?? { count: 0, lastUsed: "" };
      entry.count += 1;
      if (day <= today && day > entry.lastUsed) entry.lastUsed = day;
      usage.set(slot.typeId, entry);
    }
  }
  return usage;
}

/**
 * Whether anything still points at a type - a session (any, dated or
 * not), a phase's typical week or a saved circuit. A type in use can only
 * be archived: deleting it would leave those showing "Unknown".
 */
export function isTypeReferenced(
  typeId: string,
  refs: { workouts: Workout[]; templates: Record<string, WorkoutTemplate[]>; circuits: Circuit[] },
): boolean {
  const inSlots = (slots: { typeId: string }[] | undefined) => (slots ?? []).some((s) => s.typeId === typeId);
  return (
    refs.workouts.some((w) => inSlots(w.exercises)) ||
    Object.values(refs.templates).some((list) => list.some((t) => inSlots(t.exercises))) ||
    refs.circuits.some((c) => inSlots(c.exercises))
  );
}

/** The most recently used types, newest first - the picker's "Recent" row. */
export function recentTypes(types: ExerciseTypeDef[], usage: Map<string, TypeUsage>, limit = 6): ExerciseTypeDef[] {
  return types
    .filter((t) => !t.archived && (usage.get(t.id)?.lastUsed ?? "") !== "")
    .sort((a, b) => usage.get(b.id)!.lastUsed.localeCompare(usage.get(a.id)!.lastUsed) || usage.get(b.id)!.count - usage.get(a.id)!.count)
    .slice(0, limit);
}

/** Renames a group on every type in it (including archived ones, so restoring one puts it back in the same place). */
export function renameGroup(types: ExerciseTypeDef[], from: string, to: string): ExerciseTypeDef[] {
  const next = to.trim();
  if (!next || next === from) return types;
  return types.map((t) => (exerciseGroup(t) === from ? { ...t, group: next } : t));
}
