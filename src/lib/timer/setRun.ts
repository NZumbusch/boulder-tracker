import type { ExerciseValues } from "../types";
import type { IntervalSpec } from "./intervalTimer";
import { clampSpec } from "./intervalTimer";

/**
 * The self-paced half of the timer: sets you perform at your own pace,
 * with the rest between them on the clock.
 *
 * A counted-down protocol is wrong for strength work. Nobody paces six
 * pull-ups off a seven-second-per-rep clock, and a rest that starts on
 * schedule rather than when you actually racked is worse than no timer -
 * before this, `{ sets: 4, reps: 6, timeOff: 180 }` produced six invented
 * 7-second "work" phases per set. So here the work phase has no duration
 * at all: you do the set, say so, and the rest starts from that moment.
 *
 * The model is deliberately smaller than `intervalTimer`'s timeline.
 * There is one user action - "finished set" - and the rest is simply the
 * time since the last one, so the whole run is a set counter, a list of
 * what each set achieved, and one stopwatch.
 */

export type SetRunPhase = "leadIn" | "set" | "done";

/** Which timing model an exercise gets: decided from its own data, or forced. */
export type SetTimingMode = "auto" | "timed" | "selfPaced";

/**
 * Whether to run an exercise as self-paced sets rather than a counted-down
 * protocol.
 *
 * The rule is the same one the duration estimate already uses: a per-rep
 * duration (`timeOn`) is what makes rep-level timing meaningful. A
 * hangboard hang is 7 seconds whether or not you like it, so it counts
 * down; a pull-up takes as long as it takes, so it doesn't.
 */
export function isSelfPaced(values: ExerciseValues | undefined, mode: SetTimingMode = "auto"): boolean {
  if (mode === "timed") return false;
  if (mode === "selfPaced") return true;
  const timeOn = Number(values?.timeOn);
  return !(Number.isFinite(timeOn) && timeOn > 0);
}

export interface SetRunState {
  /** 1-based set you are on - about to do, doing, or resting before. */
  currentSet: number;
  /** Reps recorded for each set already finished, in order. */
  completed: number[];
  /**
   * Milliseconds since the previous set ended, which is the rest. Also
   * counts before the first set (as time since the run began), where it
   * is elapsed time rather than rest - see `isResting`.
   */
  sinceLastSetMs: number;
  /** Milliseconds still to run on the lead-in, or 0 once it is over. */
  leadInRemainingMs: number;
  done: boolean;
}

export function startSetRun(spec: IntervalSpec): SetRunState {
  const clamped = clampSpec(spec);
  return {
    currentSet: 1,
    completed: [],
    sinceLastSetMs: 0,
    leadInRemainingMs: clamped.leadInSeconds * 1000,
    done: false,
  };
}

export function setRunPhase(state: SetRunState): SetRunPhase {
  if (state.done) return "done";
  return state.leadInRemainingMs > 0 ? "leadIn" : "set";
}

/**
 * Only true between sets. Before the first set there is nothing to have
 * rested from, so the clock is running but it is not a rest - showing
 * "rest 4:12" before you have lifted anything would be nonsense.
 */
export function isResting(state: SetRunState): boolean {
  return !state.done && state.currentSet > 1 && state.leadInRemainingMs <= 0;
}

/** Advances the clock. The only thing that ever ends a set is `finishSet`. */
export function tickSetRun(state: SetRunState, deltaMs: number): SetRunState {
  if (state.done || deltaMs <= 0) return state;

  if (state.leadInRemainingMs > 0) {
    const leadInRemainingMs = Math.max(0, state.leadInRemainingMs - deltaMs);
    const spill = Math.max(0, deltaMs - state.leadInRemainingMs);
    // Time past the end of the lead-in belongs to the first set, not to
    // a rest that hasn't happened - `isResting` keeps that distinction.
    return { ...state, leadInRemainingMs, sinceLastSetMs: state.sinceLastSetMs + spill };
  }

  return { ...state, sinceLastSetMs: state.sinceLastSetMs + deltaMs };
}

/**
 * Records a finished set and starts the rest.
 *
 * `reps` is what was actually managed, which is the point of asking: a
 * descending series like `[10, 7, 8, 8]` is the useful record, and one
 * averaged number would throw away exactly the information that makes it
 * worth logging.
 */
export function finishSet(state: SetRunState, spec: IntervalSpec, reps: number): SetRunState {
  if (state.done) return state;

  const clamped = clampSpec(spec);
  const recorded = Number.isFinite(reps) && reps > 0 ? Math.round(reps) : clamped.reps;
  const completed = [...state.completed, recorded];

  // Skipping the rest of the lead-in is the right reading of "I'm done" -
  // you clearly didn't need the rest of the countdown.
  if (completed.length >= clamped.sets) {
    return { ...state, completed, currentSet: clamped.sets, sinceLastSetMs: 0, leadInRemainingMs: 0, done: true };
  }

  return {
    ...state,
    completed,
    currentSet: completed.length + 1,
    sinceLastSetMs: 0,
    leadInRemainingMs: 0,
    done: false,
  };
}

/** Undoes the last finished set, putting its rest back where it was. */
export function undoLastSet(state: SetRunState): SetRunState {
  if (state.completed.length === 0) return state;
  const completed = state.completed.slice(0, -1);
  return {
    ...state,
    completed,
    currentSet: completed.length + 1,
    sinceLastSetMs: 0,
    done: false,
  };
}

/** Ends the lead-in early, for when you are already on the bar. */
export function skipLeadIn(state: SetRunState): SetRunState {
  return state.leadInRemainingMs > 0 ? { ...state, leadInRemainingMs: 0 } : state;
}

/**
 * Seconds left of the target rest - negative once it is overrun.
 *
 * Overrun rather than stopping at zero: a rest that reads 0:00 whether
 * you took three minutes or eight tells you nothing, and the honest
 * number is what you actually rested.
 */
export function restRemainingSeconds(state: SetRunState, spec: IntervalSpec): number {
  const target = clampSpec(spec).setRestSeconds;
  return target - state.sinceLastSetMs / 1000;
}

/** True the moment the target rest has just been passed, for firing the cue once. */
export function hasRestElapsed(state: SetRunState, spec: IntervalSpec): boolean {
  return isResting(state) && restRemainingSeconds(state, spec) <= 0;
}

/** Total time the run has been going, for the header readout. */
export function setRunProgress(state: SetRunState, spec: IntervalSpec) {
  const clamped = clampSpec(spec);
  return {
    setsCompleted: state.completed.length,
    totalSets: clamped.sets,
    repsCompleted: state.completed.reduce((sum, reps) => sum + reps, 0),
    currentSet: Math.min(state.currentSet, clamped.sets),
  };
}

/**
 * What a run implies for the log.
 *
 * `reps` comes back as the per-set array whenever the sets differed, and
 * as a single number when they didn't - there is no point storing
 * `[6, 6, 6, 6]` when `6` says the same thing. `sets` is what was
 * actually done, not what was planned.
 */
export function setRunLoggedValues(
  spec: IntervalSpec,
  state: SetRunState,
): Pick<ExerciseValues, "sets" | "reps" | "timeBetweenSets"> {
  const clamped = clampSpec(spec);
  const completed = state.completed.length > 0 ? state.completed : [clamped.reps];
  const uniform = completed.every((reps) => reps === completed[0]);

  return {
    sets: completed.length,
    reps: uniform ? completed[0] : [...completed],
    timeBetweenSets: clamped.setRestSeconds,
  };
}
