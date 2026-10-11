import type { Circuit, ExerciseGroup, ExerciseSlot } from "../types";
import { addToGroup, groupSlots, normaliseGroups, workoutItems } from "./groups";

/**
 * Saved circuits: a library of reusable groups. Going in either direction
 * is a **copy** - saving a group makes a library entry from its plan, and
 * adding a circuit gives the workout its own group and exercises (the
 * group remembers `circuitId`). Nothing links back, so editing the library
 * never rewrites a session, and logging a session never edits the library.
 */

type Grouped = { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] };

/**
 * A library entry from one of a workout's groups: its timing, and its
 * members' plans (or what was done, for a member that was never planned).
 * Keeps `id` and `description` from `base` when updating an existing circuit.
 */
export function circuitFromGroup(
  workout: Grouped,
  groupId: string,
  base: { id: string; name?: string; description?: string },
  newId: () => string,
): Circuit | undefined {
  const item = workoutItems(workout).find((i) => i.kind === "group" && i.group.id === groupId);
  if (!item || item.kind !== "group") return undefined;
  const { group } = item;
  return {
    id: base.id,
    name: (base.name ?? group.name ?? "").trim() || "Circuit",
    ...(base.description ? { description: base.description } : {}),
    rounds: group.rounds,
    ...(group.transition !== undefined ? { transition: group.transition } : {}),
    ...(group.roundRest !== undefined ? { roundRest: group.roundRest } : {}),
    exercises: item.members.map(({ slot }) => planOnly(slot, newId())),
  };
}

/**
 * Adds a circuit to the end of a workout or template as a new group of its
 * own. `into` adds its exercises to an existing group instead (a circuit
 * dropped into a superset's rest), keeping that group's timing.
 */
export function insertCircuit<T extends Grouped>(workout: T, circuit: Circuit, newId: () => string, into?: string): T {
  const slots = circuit.exercises.map((slot) => planOnly(slot, newId()));
  if (slots.length === 0) return workout;
  if (into) {
    return slots.reduce((w, slot) => addToGroup(w, into, slot), workout);
  }
  const group: ExerciseGroup = {
    id: newId(),
    name: circuit.name,
    rounds: circuit.rounds,
    ...(circuit.transition !== undefined ? { transition: circuit.transition } : {}),
    ...(circuit.roundRest !== undefined ? { roundRest: circuit.roundRest } : {}),
    circuitId: circuit.id,
  };
  const appended = { ...workout, exercises: [...(workout.exercises ?? []), ...slots] };
  return groupSlots(appended, slots.map((s) => s.id), group);
}

/** A circuit's exercises and timing as a workout-shaped value, for the shared timing/display helpers. */
export function circuitAsWorkout(circuit: Circuit): Grouped & { groups: ExerciseGroup[] } {
  const group: ExerciseGroup = { id: "circuit", name: circuit.name, rounds: circuit.rounds, transition: circuit.transition, roundRest: circuit.roundRest };
  return normaliseGroups({
    exercises: circuit.exercises.map((s) => ({ ...s, groupId: "circuit" })),
    groups: [group],
  }) as Grouped & { groups: ExerciseGroup[] };
}

/** A slot as a plan: its prescription (or what was done, if it had none), no log, no grouping, a fresh id. */
function planOnly(slot: ExerciseSlot, id: string): ExerciseSlot {
  const { logged, skipped: _skipped, groupId: _groupId, prescribed, ...rest } = slot;
  const plan = prescribed ?? logged;
  return { ...rest, id, ...(plan ? { prescribed: { ...plan } } : {}) };
}
