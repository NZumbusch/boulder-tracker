import type { Circuit, ExerciseSlot, ExerciseTypeDef, ExerciseValues, ParameterBlock } from "../types";
import { toRepsArray } from "./reps";

/*
 * What the circuit builder works with: a `Circuit` being drafted, whose exercises each have one amount - a number of
 * reps (counted) or of seconds (timed). The rounds are the circuit's; a member takes part in every round, so it needs no
 * sets of its own. Pure: the screens call these and save the result.
 */

export type AmountKind = "reps" | "time" | "hang";

export const DEFAULT_REPS = 8;
export const DEFAULT_SECONDS = 30;
/** A new repeater: 7 s on, 3 s off - the usual hangboard split. */
export const DEFAULT_ON = 7;
export const DEFAULT_OFF = 3;

/** A new, empty circuit: three rounds, 15 s between exercises, a minute between rounds - the same defaults as everywhere. */
export function blankCircuit(id: string): Circuit {
  return { id, name: "", rounds: 3, transition: 15, roundRest: 60, exercises: [] };
}

export interface Amount {
  kind: AmountKind;
  /** Reps (reps, hang) or seconds (time). */
  n: number;
  /** Hang only: seconds on / off per rep. */
  on?: number;
  off?: number;
}

const positiveInt = (v: unknown): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The one amount an exercise has in a circuit: reps, seconds (`timeOn` alone), or a repeater (reps of `timeOn` seconds on, `timeOff` off). */
export function amountOf(values: ExerciseValues | undefined): Amount {
  const timeOn = positiveInt(values?.timeOn);
  const perSet = toRepsArray(values?.reps);
  const reps = perSet ? perSet[0] : positiveInt(values?.reps);
  if (timeOn !== undefined && reps !== undefined) return { kind: "hang", n: reps, on: timeOn, off: Math.max(0, Math.round(Number(values?.timeOff)) || 0) };
  if (timeOn !== undefined) return { kind: "time", n: timeOn };
  return { kind: "reps", n: reps ?? DEFAULT_REPS };
}

/**
 * The values with the amount set. The other kinds' numbers are cleared, and so are `sets` (the circuit's rounds replace
 * them). Switching to a repeater keeps a timeOn/timeOff already there, else 7 s on / 3 s off.
 */
export function withAmount(values: ExerciseValues | undefined, kind: AmountKind, n: number, on?: number, off?: number): ExerciseValues {
  const { reps: _r, timeOn: oldOn, timeOff: oldOff, sets: _s, ...rest } = values ?? {};
  const amount = Math.max(1, Math.round(n) || 1);
  if (kind === "time") return { ...rest, timeOn: amount };
  if (kind === "reps") return { ...rest, reps: amount };
  return { ...rest, reps: amount, timeOn: Math.max(1, Math.round(on ?? oldOn ?? DEFAULT_ON) || 1), timeOff: Math.max(0, Math.round(off ?? oldOff ?? DEFAULT_OFF) || 0) };
}

/** What the slot tracks must include the amount's parameters, or the numbers are stored but the exercise doesn't show them. */
function withParam(active: readonly ParameterBlock[] | undefined, kind: AmountKind): ParameterBlock[] {
  const need: ParameterBlock[] = kind === "time" ? ["timeOn"] : kind === "reps" ? ["reps"] : ["reps", "timeOn", "timeOff"];
  const drop: ParameterBlock[] = kind === "time" ? ["reps", "timeOff"] : kind === "reps" ? ["timeOn", "timeOff"] : [];
  const kept = (active ?? []).filter((p) => !drop.includes(p) && p !== "sets");
  return [...kept, ...need.filter((p) => !kept.includes(p))];
}

/** The added weight in kg, if the slot has one. */
export function weightOf(values: ExerciseValues | undefined): number | undefined {
  const w = Number(values?.weight);
  return Number.isFinite(w) && w > 0 ? w : undefined;
}

/** The values with the added weight (kg) set; undefined or 0 removes it. */
export function withWeight(values: ExerciseValues | undefined, kg: number | undefined): ExerciseValues {
  const { weight: _w, ...rest } = values ?? {};
  return kg !== undefined && kg > 0 ? { ...rest, weight: kg } : rest;
}

/** The slot tracks weight (so the field shows even while empty): the type offers it, or it already has one. */
export function tracksWeight(slot: ExerciseSlot): boolean {
  return !!slot.activeParameters?.includes("weight") || weightOf(slot.prescribed) !== undefined;
}

/** The slot for a chosen exercise: timed when the type is timed (a duration or hold, no reps), else counted. */
export function slotForType(type: ExerciseTypeDef, id: string): ExerciseSlot {
  const tracked = type.parameters ?? [];
  const hang = tracked.includes("reps") && tracked.includes("timeOn");
  const timed = !hang && (tracked.includes("timeOn") || tracked.includes("duration")) && !tracked.includes("reps");
  const kind: AmountKind = hang ? "hang" : timed ? "time" : "reps";
  return {
    id,
    typeId: type.id,
    activeParameters: withParam(tracked, kind),
    prescribed: withAmount(undefined, kind, timed ? DEFAULT_SECONDS : hang ? 6 : DEFAULT_REPS),
  };
}

/** The slot changed to another kind of amount (reps <-> seconds), keeping its number where that makes sense. */
export function slotWithAmount(slot: ExerciseSlot, kind: AmountKind, n: number, on?: number, off?: number): ExerciseSlot {
  return { ...slot, activeParameters: withParam(slot.activeParameters, kind), prescribed: withAmount(slot.prescribed, kind, n, on, off) };
}

/** "3 reps" / "39 s" / "6 × 7 s on, 3 s off", with " +10 kg" when it has added weight (shown in kg unless `weight` says otherwise). */
export function amountText(values: ExerciseValues | undefined, weight?: (kg: number) => string): string {
  const a = amountOf(values);
  const base = a.kind === "time" ? `${a.n} s` : a.kind === "hang" ? `${a.n} × ${a.on} s on${a.off ? `, ${a.off} s off` : ""}` : `${a.n} rep${a.n === 1 ? "" : "s"}`;
  const kg = weightOf(values);
  return kg === undefined ? base : `${base} +${weight ? weight(kg) : `${kg} kg`}`;
}

/** "6 rounds: 3 reps Pull-ups, 39 s Face pulls". */
export function circuitLine(circuit: Circuit, nameOf: (slot: ExerciseSlot) => string, weight?: (kg: number) => string): string {
  const parts = circuit.exercises.map((s) => `${amountText(s.prescribed, weight)} ${nameOf(s)}`);
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
