import type { ExerciseGroup, ExerciseSlot } from "../types";
import { normaliseGroups } from "./groups";

type Grouped = { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] };

/**
 * Puts a removed exercise back into a session that may have changed since
 * (a saved session whose editor is long gone): at its old place, or at the
 * end if the list got shorter, with the circuit it belonged to when that
 * circuit no longer exists. A session that already has it is returned as is.
 */
export function reinsertSlot<T extends Grouped>(workout: T, slot: ExerciseSlot, index: number, groups?: ExerciseGroup[]): T {
  if (workout.exercises.some((e) => e.id === slot.id)) return workout;
  const exercises = [...workout.exercises];
  exercises.splice(Math.min(Math.max(index, 0), exercises.length), 0, slot);
  const have = workout.groups ?? [];
  const missing = (groups ?? []).filter((g) => g.id === slot.groupId && !have.some((h) => h.id === g.id));
  return normaliseGroups({ ...workout, exercises, groups: missing.length ? [...have, ...missing] : workout.groups });
}

/** `item` back into a list at its old place (the end if the list got shorter); a list that has it is returned as is. */
export function reinsertById<T extends { id: string }>(list: T[], item: T, index: number): T[] {
  if (list.some((x) => x.id === item.id)) return list;
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}
