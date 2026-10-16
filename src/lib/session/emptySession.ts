import type { ExerciseSlot, ExerciseValues, Workout } from "../types";

/**
 * Is there any work in this session? Used to ask before saving one with none
 * (a live session finished too early, a hand-made session saved before its
 * exercises were added) - never to refuse. Pure.
 */

/** Logged values that describe the slot, not work done. */
const NOT_WORK: ReadonlySet<string> = new Set(["notes", "plannedLoad", "leadIn", "repLabel", "timeOff", "timeBetweenSets", "restAfter"]);

function meaningful(v: unknown): boolean {
  if (v === undefined || v === null || v === "" || v === 0 || v === false) return false;
  if (Array.isArray(v)) return v.some(meaningful);
  if (typeof v === "object") return Object.values(v as object).some(meaningful);
  return true;
}

/** Whether a slot has logged work: values besides notes and plan details. A test slot counts once it has any logged value. */
export function slotHasLoggedWork(slot: ExerciseSlot): boolean {
  if (slot.skipped || !slot.logged) return false;
  const logged = slot.logged as ExerciseValues & Record<string, unknown>;
  if (slot.test) return Object.keys(logged).length > 0;
  return Object.entries(logged).some(([key, value]) => !NOT_WORK.has(key) && meaningful(value));
}

export function hasLoggedWork(workout: Pick<Workout, "exercises">): boolean {
  return workout.exercises.some(slotHasLoggedWork);
}

/**
 * What to ask before saving, or null when nothing is wrong. A done session
 * needs logged work; a planned one needs exercises. `alreadyEmpty` skips the
 * question for a session that was empty when it was opened (re-saving it
 * changes nothing).
 */
export function emptySessionWarning(workout: Pick<Workout, "status" | "exercises">, alreadyEmpty = false): { title: string; text: string; ok: string } | null {
  if (alreadyEmpty) return null;
  if (workout.status === "completed") {
    if (hasLoggedWork(workout)) return null;
    return {
      title: "Save a session with nothing logged?",
      text: "No sets or other work are logged in this session. It will be saved as a done session with no load.",
      ok: "Save anyway",
    };
  }
  if (workout.exercises.length > 0) return null;
  return {
    title: "Save a session with no exercises?",
    text: "This session has no exercises yet.",
    ok: "Save anyway",
  };
}
