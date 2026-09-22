import type { ExerciseValues, ParameterBlock } from "../types";
import { repsPerSet, setsFromReps, repsRepresentative } from "../exercise/reps";

/**
 * The protocol behind the timer's interval mode.
 *
 * A hangboard repeater is sets x reps x (hang -> rest) with a longer rest
 * between sets, which is the same shape as a weights circuit or a campus
 * ladder - so there is one engine rather than a hangboard-specific mode
 * and a generic one beside it. The exercise's own
 * `sets`/`reps`/`timeOn`/`timeOff`/`timeBetweenSets` seed it directly.
 *
 * Everything here is pure: a spec expands to a flat timeline of steps, and
 * a position in that timeline is a function of elapsed seconds. No clock,
 * no audio, no state - which is what makes the awkward parts (where the
 * rests go, what "sets completed" means when you stop mid-set) testable.
 */

export type IntervalPhase = "leadIn" | "work" | "rest" | "setRest";

export interface IntervalSpec {
  sets: number;
  reps: number;
  /** Seconds of work per rep - the hang. */
  workSeconds: number;
  /** Seconds of rest between reps within a set. */
  restSeconds: number;
  /** Seconds of rest between sets. */
  setRestSeconds: number;
  /** "Get ready" seconds before the first rep, so you're on the holds when it starts. */
  leadInSeconds: number;
}

export interface IntervalStep {
  phase: IntervalPhase;
  seconds: number;
  /** 1-based set this step belongs to; 0 for the lead-in. */
  set: number;
  /** 1-based rep within the set; 0 for the lead-in and for set rests. */
  rep: number;
}

/** A classic 7-on/3-off repeater, used when the exercise says nothing useful. */
export const DEFAULT_SPEC: IntervalSpec = {
  sets: 5,
  reps: 6,
  workSeconds: 7,
  restSeconds: 3,
  setRestSeconds: 180,
  leadInSeconds: 10,
};

/** Guard rails: a spec that would produce an empty or infinite timeline is not runnable. */
export function clampSpec(spec: IntervalSpec): IntervalSpec {
  return {
    sets: clampInt(spec.sets, 1, 99, DEFAULT_SPEC.sets),
    reps: clampInt(spec.reps, 1, 99, DEFAULT_SPEC.reps),
    // Work is the one phase that cannot be zero - a rep with no duration
    // would make the timeline a list of rests.
    workSeconds: clampInt(spec.workSeconds, 1, 3600, DEFAULT_SPEC.workSeconds),
    restSeconds: clampInt(spec.restSeconds, 0, 3600, DEFAULT_SPEC.restSeconds),
    setRestSeconds: clampInt(spec.setRestSeconds, 0, 3600, DEFAULT_SPEC.setRestSeconds),
    leadInSeconds: clampInt(spec.leadInSeconds, 0, 600, DEFAULT_SPEC.leadInSeconds),
  };
}

/**
 * Seeds a spec from an exercise's own numbers, falling back per field.
 *
 * Per-field rather than all-or-nothing: an exercise that specifies
 * `sets`/`reps` but no rest timings should keep its sets and reps and take
 * sensible rests, not be discarded wholesale for a default protocol.
 * `leadInSeconds` never comes from the exercise - it is about the person
 * getting to the holds, not about the training.
 */
export function specFromExercise(
  values: ExerciseValues | undefined,
  fallback: IntervalSpec = DEFAULT_SPEC,
): IntervalSpec {
  const v = values ?? {};

  // Per-set reps (`[6, 6, 5, 5, 4]`) appear in real exports. The array's
  // length is the true set count; the protocol itself is uniform, so the
  // reps average out into one editable number.
  const perSetCount = setsFromReps(v.reps);
  const averageReps = repsRepresentative(v.reps);

  // Same rest-field ambiguity `sessionDuration` untangles: an exercise
  // whose type offers `timeOff` but not `restTime` records its *set* rest
  // there, and reading it as a between-reps rest would put three minutes
  // between every pull-up.
  // Only reassigns a rest that is actually recorded: with no `timeOff` at
  // all there is nothing to reinterpret, and the per-field fallbacks below
  // should supply the defaults as usual.
  const timeOn = firstNumber(v.timeOn, 0);
  const timeOff = firstNumber(v.timeOff, 0);
  const restIsBetweenSets = timeOff > 0 && timeOn <= 0 && firstNumber(v.timeBetweenSets, 0) <= 0;

  return clampSpec({
    sets: perSetCount ?? firstNumber(v.sets, fallback.sets),
    reps: perSetCount ? (averageReps ?? fallback.reps) : firstNumber(repsRepresentative(v.reps), fallback.reps),
    workSeconds: firstNumber(v.timeOn, fallback.workSeconds),
    restSeconds: restIsBetweenSets ? 0 : firstNumber(v.timeOff, fallback.restSeconds),
    setRestSeconds: restIsBetweenSets
      ? firstNumber(v.timeOff, fallback.setRestSeconds)
      : firstNumber(v.timeBetweenSets, fallback.setRestSeconds),
    leadInSeconds: fallback.leadInSeconds,
  });
}

/** True when an exercise carries enough of its own timing to be worth running as an interval. */
export function hasIntervalTiming(values: ExerciseValues | undefined): boolean {
  const v = values ?? {};
  return [v.timeOn, v.timeOff, v.timeBetweenSets, v.sets, repsRepresentative(v.reps)].some(
    (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
}

/**
 * Expands a spec into the flat list of steps to run.
 *
 * Trailing rests are dropped at both levels: there is no rest after the
 * last rep of a set (the set rest follows instead), and none after the
 * last set (the protocol is over). Leaving them in is the classic interval
 * timer bug - it ends a hangboard session three minutes after the work is
 * actually done.
 */
export function buildTimeline(rawSpec: IntervalSpec): IntervalStep[] {
  const spec = clampSpec(rawSpec);
  const steps: IntervalStep[] = [];

  if (spec.leadInSeconds > 0) {
    steps.push({ phase: "leadIn", seconds: spec.leadInSeconds, set: 0, rep: 0 });
  }

  for (let set = 1; set <= spec.sets; set++) {
    for (let rep = 1; rep <= spec.reps; rep++) {
      steps.push({ phase: "work", seconds: spec.workSeconds, set, rep });
      if (spec.restSeconds > 0 && rep < spec.reps) {
        steps.push({ phase: "rest", seconds: spec.restSeconds, set, rep });
      }
    }
    if (spec.setRestSeconds > 0 && set < spec.sets) {
      steps.push({ phase: "setRest", seconds: spec.setRestSeconds, set, rep: 0 });
    }
  }

  return steps;
}

/** Total runtime of a timeline, in seconds. */
export function timelineSeconds(timeline: IntervalStep[]): number {
  return timeline.reduce((total, step) => total + step.seconds, 0);
}

export interface IntervalPosition {
  /** Index into the timeline, or `timeline.length` once finished. */
  index: number;
  step: IntervalStep | null;
  /** Whole seconds left in the current step, rounded up so it reads 1 until it is actually 0. */
  remaining: number;
  /** Seconds elapsed within the current step. */
  elapsedInStep: number;
  done: boolean;
}

/** Where a run is after `elapsedSeconds` of running time. */
export function positionAt(timeline: IntervalStep[], elapsedSeconds: number): IntervalPosition {
  const elapsed = Math.max(0, elapsedSeconds);
  let consumed = 0;

  for (let index = 0; index < timeline.length; index++) {
    const step = timeline[index];
    if (elapsed < consumed + step.seconds) {
      const elapsedInStep = elapsed - consumed;
      return {
        index,
        step,
        remaining: Math.max(0, Math.ceil(step.seconds - elapsedInStep)),
        elapsedInStep,
        done: false,
      };
    }
    consumed += step.seconds;
  }

  return { index: timeline.length, step: null, remaining: 0, elapsedInStep: 0, done: true };
}

/** The elapsed-seconds mark where a step begins - what a skip/back control seeks to. */
export function stepStartSeconds(timeline: IntervalStep[], index: number): number {
  const bounded = Math.max(0, Math.min(index, timeline.length));
  let total = 0;
  for (let i = 0; i < bounded; i++) total += timeline[i].seconds;
  return total;
}

/** Seek target for "skip this phase" - the start of the next step, or the very end. */
export function skipToNextSeconds(timeline: IntervalStep[], elapsedSeconds: number): number {
  const { index, done } = positionAt(timeline, elapsedSeconds);
  if (done) return timelineSeconds(timeline);
  return stepStartSeconds(timeline, index + 1);
}

/**
 * Seek target for "back" - the start of the current step, or of the
 * previous one when already near the start of this one. Mirrors how a
 * music player's back button behaves, so a mis-tap doesn't skip a whole
 * phase backwards.
 */
export function backSeconds(timeline: IntervalStep[], elapsedSeconds: number): number {
  const { index, elapsedInStep, done } = positionAt(timeline, elapsedSeconds);
  if (done) return stepStartSeconds(timeline, Math.max(0, timeline.length - 1));
  if (elapsedInStep > 2) return stepStartSeconds(timeline, index);
  return stepStartSeconds(timeline, Math.max(0, index - 1));
}

export interface IntervalProgress {
  /** Sets fully finished - the last rep of the set has been completed. */
  setsCompleted: number;
  /** Reps fully finished within the current (unfinished) set. */
  repsCompletedInSet: number;
  /** Total reps fully finished across the whole run. */
  repsCompleted: number;
  /** 1-based set currently in progress, clamped to the spec. */
  currentSet: number;
  /** 1-based rep currently in progress. */
  currentRep: number;
}

/**
 * What has actually been finished at a point in the run - the numbers that
 * go into the log when a protocol is stopped early.
 *
 * A rep counts only once its work phase is over, so stopping halfway
 * through a hang does not claim it. The rest that follows a rep is part of
 * that rep's aftermath, not the next one's work.
 */
export function progressAt(
  timeline: IntervalStep[],
  spec: IntervalSpec,
  elapsedSeconds: number,
): IntervalProgress {
  const clamped = clampSpec(spec);
  const { index, step, done } = positionAt(timeline, elapsedSeconds);

  if (done) {
    return {
      setsCompleted: clamped.sets,
      repsCompletedInSet: 0,
      repsCompleted: clamped.sets * clamped.reps,
      currentSet: clamped.sets,
      currentRep: clamped.reps,
    };
  }

  let repsCompleted = 0;
  for (let i = 0; i < index; i++) {
    if (timeline[i].phase === "work") repsCompleted++;
  }

  const currentSet = step && step.set > 0 ? step.set : 1;
  const setsCompleted = Math.floor(repsCompleted / clamped.reps);
  const repsCompletedInSet = repsCompleted % clamped.reps;
  const currentRep = step?.phase === "work" ? step.rep : Math.min(clamped.reps, repsCompletedInSet + 1);

  return { setsCompleted, repsCompletedInSet, repsCompleted, currentSet, currentRep };
}

/**
 * The `ExerciseValues` a finished (or stopped) run implies, for prefilling
 * the log. Reports `sets` as whole sets completed, falling back to 1 so a
 * partial first set still logs as something rather than zero.
 */
export function loggedValuesFor(
  spec: IntervalSpec,
  progress: IntervalProgress,
): Pick<ExerciseValues, "sets" | "reps" | "timeOn" | "timeOff" | "timeBetweenSets"> {
  const clamped = clampSpec(spec);
  const partial = progress.repsCompletedInSet > 0;
  return {
    sets: Math.max(1, progress.setsCompleted + (partial ? 1 : 0)),
    reps: partial ? progress.repsCompletedInSet : clamped.reps,
    timeOn: clamped.workSeconds,
    timeOff: clamped.restSeconds,
    timeBetweenSets: clamped.setRestSeconds,
  };
}

/** True when the two specs differ - drives the "edited" marker and the Reset control. */
export function specsDiffer(a: IntervalSpec, b: IntervalSpec): boolean {
  const x = clampSpec(a);
  const y = clampSpec(b);
  return (
    x.sets !== y.sets ||
    x.reps !== y.reps ||
    x.workSeconds !== y.workSeconds ||
    x.restSeconds !== y.restSeconds ||
    x.setRestSeconds !== y.setRestSeconds ||
    x.leadInSeconds !== y.leadInSeconds
  );
}

/**
 * What to call the work phase. Hangboard-ish exercises say "Hang", which
 * is what the protocol is actually asking for; everything else says
 * "Work". Read from the slot's own tracked parameters rather than its
 * name, so a renamed exercise type doesn't change the wording.
 */
export function workPhaseLabel(activeParameters: ParameterBlock[] | undefined): string {
  const params = activeParameters ?? [];
  return params.includes("holdType") || params.includes("holdSize") ? "Hang" : "Work";
}

export function phaseLabel(phase: IntervalPhase, workLabel = "Work"): string {
  switch (phase) {
    case "leadIn":
      return "Get ready";
    case "work":
      return workLabel;
    case "rest":
      return "Rest";
    case "setRest":
      return "Set rest";
  }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function firstNumber(value: number | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n > 0 ? n : fallback;
}
