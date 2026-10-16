import type { Circuit, ExerciseSlot, ExerciseTypeDef, ExerciseValues, ParameterBlock } from "../types";
import { toRepsArray } from "./reps";

/*
 * What the circuit builder works with: a `Circuit` being drafted, whose exercises each have one amount - a number of
 * reps (counted) or of seconds (timed). The rounds are the circuit's; a member takes part in every round, so it needs no
 * sets of its own. Pure: the screens call these and save the result.
 */

export type AmountKind = "reps" | "time";

export const DEFAULT_REPS = 8;
export const DEFAULT_SECONDS = 30;

/** A new, empty circuit: three rounds, 15 s between exercises, a minute between rounds - the same defaults as everywhere. */
export function blankCircuit(id: string): Circuit {
  return { id, name: "", rounds: 3, transition: 15, roundRest: 60, exercises: [] };
}

/** The one amount an exercise has in a circuit: seconds when it is timed (`timeOn`), else reps. */
export function amountOf(values: ExerciseValues | undefined): { kind: AmountKind; n: number } {
  const timeOn = Number(values?.timeOn);
  if (Number.isFinite(timeOn) && timeOn > 0) return { kind: "time", n: Math.round(timeOn) };
  const perSet = toRepsArray(values?.reps);
  if (perSet) return { kind: "reps", n: perSet[0] };
  const reps = Number(values?.reps);
  return { kind: "reps", n: Number.isFinite(reps) && reps > 0 ? Math.round(reps) : DEFAULT_REPS };
}

/** The values with the amount set: reps clears any timed set, seconds clears reps and sets (the circuit's rounds replace them). */
export function withAmount(values: ExerciseValues | undefined, kind: AmountKind, n: number): ExerciseValues {
  const { reps: _r, timeOn: _t, sets: _s, ...rest } = values ?? {};
  const amount = Math.max(1, Math.round(n) || 1);
  return kind === "time" ? { ...rest, timeOn: amount } : { ...rest, reps: amount };
}

/** What the slot tracks must include the amount's parameter, or the number is stored but the exercise doesn't show it. */
function withParam(active: readonly ParameterBlock[] | undefined, kind: AmountKind): ParameterBlock[] {
  const key: ParameterBlock = kind === "time" ? "timeOn" : "reps";
  const drop: ParameterBlock = kind === "time" ? "reps" : "timeOn";
  return [...(active ?? []).filter((p) => p !== drop && p !== "sets"), ...(active?.includes(key) ? [] : [key])];
}

/** The slot for a chosen exercise: timed when the type is timed (a duration or hold, no reps), else counted. */
export function slotForType(type: ExerciseTypeDef, id: string): ExerciseSlot {
  const tracked = type.parameters ?? [];
  const timed = (tracked.includes("timeOn") || tracked.includes("duration")) && !tracked.includes("reps");
  const kind: AmountKind = timed ? "time" : "reps";
  return {
    id,
    typeId: type.id,
    activeParameters: withParam(tracked, kind),
    prescribed: withAmount(undefined, kind, timed ? DEFAULT_SECONDS : DEFAULT_REPS),
  };
}

/** The slot changed to another kind of amount (reps <-> seconds), keeping its number where that makes sense. */
export function slotWithAmount(slot: ExerciseSlot, kind: AmountKind, n: number): ExerciseSlot {
  return { ...slot, activeParameters: withParam(slot.activeParameters, kind), prescribed: withAmount(slot.prescribed, kind, n) };
}

/** "3 reps" / "39 s". */
export function amountText(values: ExerciseValues | undefined): string {
  const a = amountOf(values);
  return a.kind === "time" ? `${a.n} s` : `${a.n} rep${a.n === 1 ? "" : "s"}`;
}

/** "6 rounds: 3 reps Pull-ups, 39 s Face pulls". */
export function circuitLine(circuit: Circuit, nameOf: (slot: ExerciseSlot) => string): string {
  const parts = circuit.exercises.map((s) => `${amountText(s.prescribed)} ${nameOf(s)}`);
  return `${circuit.rounds} round${circuit.rounds === 1 ? "" : "s"}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

/** Saved circuits matching a search (name, description, its exercises' names), best first: a name that starts with it, then any match. */
export function searchCircuits(circuits: readonly Circuit[], query: string, nameOf: (slot: ExerciseSlot) => string): Circuit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...circuits];
  const score = (c: Circuit): number => {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    if (c.exercises.some((s) => nameOf(s).toLowerCase().includes(q))) return 2;
    if ((c.description ?? "").toLowerCase().includes(q)) return 3;
    return -1;
  };
  return circuits
    .map((c) => ({ c, s: score(c) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

/** A saved circuit as a draft to adjust before adding it: a copy, so the saved one is not touched until you say so. */
export function draftFromSaved(circuit: Circuit): Circuit {
  return structuredClone(circuit);
}
