import type { ExerciseGroup, ExerciseValues } from "../types";
import { restSeconds } from "../exercise/rest";

/**
 * A single exercise (or a made-up quick timer) as a run of the circuit
 * engine - so there is one timer, not two. A "circuit of one": its sets are
 * the rounds, the rest between sets is the round rest, nothing is switched.
 *
 * - **Repeater / timed** (`timeOn`): each round is one timed set (with its
 *   reps and the rest between them inside it).
 * - **Counted** (reps, no `timeOn`): each round is an open set, ended with
 *   Done; with no reps either it is a plain stopwatch.
 * - **Pacer** (`cadence`, no `timeOn`, no reps): each round is one problem
 *   that lasts `cadence` minutes - a repeating countdown for free climbing.
 *
 * Pure, like the engine.
 */

export const SOLO_GROUP_ID = "solo";
/** What one round of a pacer is called. */
export const PACER_LABEL = "Problem";
/** Problems a pacer runs when neither a duration nor a count was given. */
export const DEFAULT_PACER_PROBLEMS = 10;
/** Seconds of "get ready" before a single exercise starts, when nothing else says. */
export const DEFAULT_SOLO_LEAD_IN = 10;
/** Rest between sets when the exercise names none (and has more than one set) - Settings can change it. */
export const DEFAULT_SOLO_SET_REST = 120;

const positive = (v: unknown): number | undefined => {
  const n = Number(v);
  return v !== undefined && v !== null && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** A pacer: a time per problem, and nothing that makes it a timed or counted set. */
export function isPacer(values: ExerciseValues | undefined): boolean {
  if (!values) return false;
  const reps = Array.isArray(values.reps) ? values.reps.length > 0 : positive(values.reps) !== undefined;
  return positive(values.cadence) !== undefined && positive(values.timeOn) === undefined && !reps;
}

/** Whether an exercise carries what the run needs: a repeater's or set's numbers, or a pacer's cadence. */
export function hasRunnableTiming(values: ExerciseValues | undefined): boolean {
  const v = values ?? {};
  return [v.timeOn, v.timeOff, v.timeBetweenSets, v.sets, v.cadence].some((n) => positive(n) !== undefined) || (Array.isArray(v.reps) ? v.reps.length > 0 : positive(v.reps) !== undefined);
}

export interface SoloRun {
  group: ExerciseGroup;
  /** The member's numbers with every default filled in - what the run really does. */
  values: ExerciseValues;
  /** Seconds of "get ready". */
  leadIn: number;
  kind: "pacer" | "timed" | "counted";
}

/** The pacer's problem count: the plan's `sets`, else the duration over the cadence, else a default. */
export function pacerProblems(values: ExerciseValues): number {
  const sets = positive(values.sets);
  if (sets) return Math.floor(sets);
  const cadence = positive(values.cadence);
  const duration = positive(values.duration);
  if (cadence && duration) return Math.max(1, Math.round((duration) / cadence));
  return DEFAULT_PACER_PROBLEMS;
}

/**
 * The run for an exercise's values. `leadIn` and `setRest` are the settings'
 * defaults; what the exercise itself says wins over them.
 */
export function soloRun(values: ExerciseValues | undefined, opts: { name?: string; leadIn?: number; setRest?: number } = {}): SoloRun {
  const v = values ?? {};
  const leadIn = Math.max(0, Math.round(positive(v.leadIn) ?? (v.leadIn === 0 ? 0 : opts.leadIn ?? DEFAULT_SOLO_LEAD_IN)));
  if (isPacer(v)) {
    const rounds = pacerProblems(v);
    const { duration: _kept, ...rest } = v;
    return { group: { id: SOLO_GROUP_ID, name: opts.name, rounds, transition: 0, roundRest: 0 }, values: { ...rest, sets: rounds, cadence: positive(v.cadence) }, leadIn, kind: "pacer" };
  }
  const timed = positive(v.timeOn) !== undefined;
  const rest = restSeconds(v);
  const sets = Math.max(1, Math.floor(positive(Array.isArray(v.reps) ? v.reps.length : v.sets) ?? positive(v.sets) ?? 1));
  // An explicit 0 means "no rest"; only a rest that was never given falls back to the setting.
  const restGiven = v.timeBetweenSets !== undefined || (!timed && v.timeOff !== undefined);
  const setRest = rest.betweenSets > 0 || restGiven || sets < 2 ? rest.betweenSets : Math.max(0, Math.round(opts.setRest ?? DEFAULT_SOLO_SET_REST));
  const member: ExerciseValues = { ...v, sets };
  if (timed) {
    member.timeOff = rest.betweenReps;
    if (member.reps === undefined) member.reps = 1;
  }
  // The rest the engine uses is the group's; the member's own is cleared so it can't be read twice.
  delete member.timeBetweenSets;
  if (!timed) delete member.timeOff;
  return { group: { id: SOLO_GROUP_ID, name: opts.name, rounds: sets, transition: 0, roundRest: setRest }, values: member, leadIn, kind: timed ? "timed" : "counted" };
}
