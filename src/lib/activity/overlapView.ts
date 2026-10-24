import { trainingState } from "../state.svelte";
import { findOverlaps, daysAround, type Overlap } from "./overlap";
import type { ExternalActivity } from "../types";

/** What an imported activity overlaps right now: other imports, logged sessions, planned sessions. */
export function overlapsFor(a: ExternalActivity): Overlap[] {
  return findOverlaps(a, {
    activities: trainingState.externalActivities,
    workouts: trainingState.workoutsOnDays(daysAround(a)),
    label: (w) => w.notes || "Session",
    text: (w) => trainingState.sessionText(w),
  });
}

/** One line for an overlap: "Logged session: Lunch run". */
export function overlapSentence(o: Overlap): string {
  const what = o.kind === "activity" ? "Imported activity" : o.kind === "logged" ? "Logged session" : "Planned session";
  return `${what}: ${o.label}${o.how === "day" ? " (same day, same kind)" : ""}`;
}

/** The short tag a list row carries, or undefined when nothing overlaps. */
export function overlapTag(found: Overlap[]): string | undefined {
  const top = found[0];
  if (!top) return undefined;
  if (top.kind === "activity") return "Also imported";
  if (top.kind === "logged") return top.how === "time" ? "Also logged" : "Same day as a logged session";
  return top.how === "time" ? "Was planned" : "Same day as a planned session";
}
