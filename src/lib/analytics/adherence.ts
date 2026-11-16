/**
 * Done vs missed: what became of the planned sessions. Every session of the
 * plan stays in the app - a planned one that wasn't done is kept as it was
 * planned (only the phone calendar drops it, `lib/calendarSync`) - so these
 * numbers can be read back for any window.
 *
 * - done: logged (completed);
 * - skipped: every exercise marked skipped - a decision, so it doesn't count against you
 *   (the same rule as the "% of planned sessions done" finding, `insights.ts`);
 * - missed: still planned and its day is over;
 * - upcoming: still planned, today or later.
 *
 * "% done" is done / (done + missed).
 */
import type { DayOfWeek, Workout } from "../types";
import { sessionDay } from "../planning/calendarEvents";
import { isSkippedWorkout } from "../planning/weekStatus";
import { weekStartDay } from "./range";

export type SessionOutcome = "done" | "skipped" | "missed" | "upcoming";

/** What became of a session as of `today` (a day index). A planned session without a day is missed once its week is over. */
export function sessionOutcome(w: Workout, today: number): SessionOutcome {
  if (w.status === "completed") return "done";
  if (isSkippedWorkout(w)) return "skipped";
  const day = sessionDay(w);
  if (day !== null) return day < today ? "missed" : "upcoming";
  const start = weekStartDay(w.weekId);
  return start !== undefined && start + 6 < today ? "missed" : "upcoming";
}

export interface OutcomeCounts {
  done: number;
  skipped: number;
  missed: number;
  upcoming: number;
}

const zero = (): OutcomeCounts => ({ done: 0, skipped: 0, missed: 0, upcoming: 0 });

export function countOutcomes(workouts: Workout[], today: number): OutcomeCounts {
  const c = zero();
  for (const w of workouts) c[sessionOutcome(w, today)]++;
  return c;
}

/** done / (done + missed), or undefined when nothing was due. */
export function doneShare(c: Pick<OutcomeCounts, "done" | "missed">): number | undefined {
  return c.done + c.missed > 0 ? c.done / (c.done + c.missed) : undefined;
}

export interface AdherenceRow extends OutcomeCounts {
  key: string;
  label: string;
}

const WEEKDAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Where the misses fall: per weekday (Monday first, every day listed) and per session name (the ones missed most
 * first, then by how often they were planned; at most `maxKinds`, only names that were missed at least once).
 */
export function adherenceBreakdown(workouts: Workout[], today: number, maxKinds = 4): { byWeekday: AdherenceRow[]; byKind: AdherenceRow[] } {
  const days = new Map<string, AdherenceRow>(WEEKDAYS.map((d) => [d, { key: d, label: d.slice(0, 3), ...zero() }]));
  const kinds = new Map<string, AdherenceRow>();
  for (const w of workouts) {
    const outcome = sessionOutcome(w, today);
    if (outcome === "upcoming") continue;
    const dayIndex = sessionDay(w);
    const dayName = dayIndex === null ? w.dayOfWeek : WEEKDAYS[(((dayIndex + 3) % 7) + 7) % 7];
    if (dayName) days.get(dayName)![outcome]++;
    const name = w.notes?.trim() || "Session";
    const key = name.toLowerCase();
    if (!kinds.has(key)) kinds.set(key, { key, label: name, ...zero() });
    kinds.get(key)![outcome]++;
  }
  const byKind = [...kinds.values()]
    .filter((k) => k.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.done + b.missed - (a.done + a.missed) || a.label.localeCompare(b.label))
    .slice(0, maxKinds);
  return { byWeekday: [...days.values()], byKind };
}
