import type { ExerciseGroup, ExerciseValues } from "../types";
import { groupTiming, memberRounds, restBetweenRounds, type GroupMember } from "../exercise/groups";
import { toRepsArray } from "../exercise/reps";
import { restSeconds } from "../exercise/rest";
import type { LiveCue, LiveSegment, LiveTimerConfig } from "./liveTimer";

/**
 * Running a circuit or superset live: one timeline across its members,
 * round by round (see `lib/exercise/groups.ts` for the rules it follows).
 *
 * Steps are one of:
 * - **work** - a member's set. Timed (`seconds`) counts down and moves on
 *   by itself; counted (no `seconds`) stays open until you tap Done.
 * - **transition** - the pause between members inside a round.
 * - **roundRest** - the rest after a round.
 * - **leadIn** - a few seconds to get into position at the start.
 *
 * Pure: the view ticks it with elapsed milliseconds and applies taps; no
 * clock of its own, so it is directly testable and survives the app being
 * killed (the view persists the state and replays the gap on return).
 */

export const CIRCUIT_LEAD_IN_SECONDS = 5;

export type CircuitStep =
  | { kind: "leadIn"; seconds: number }
  | { kind: "work"; slotId: string; member: number; round: number; seconds?: number; reps?: number }
  | { kind: "transition"; seconds: number; round: number; next: number }
  | { kind: "roundRest"; seconds: number; round: number; next: number };

export interface CircuitRunState {
  stepIndex: number;
  /** Time spent in the current step, in ms. */
  stepElapsedMs: number;
  /**
   * What each member did, per round, by slot id: reps for a counted set,
   * seconds for a timed one, `null` for a set that was skipped.
   */
  results: Record<string, (number | null)[]>;
  done: boolean;
}

/** The whole run, in order. Rests of zero seconds are left out. */
export function circuitSteps(group: ExerciseGroup, members: GroupMember[], leadIn = CIRCUIT_LEAD_IN_SECONDS): CircuitStep[] {
  const { roundMembers } = groupTiming(group, members);
  const transition = Math.max(0, Number(group.transition) || 0);
  const roundRest = restBetweenRounds(group);
  const steps: CircuitStep[] = [];
  if (leadIn > 0) steps.push({ kind: "leadIn", seconds: leadIn });

  roundMembers.forEach((active, round) => {
    active.forEach((member, i) => {
      const values = members[member].values;
      steps.push({ kind: "work", slotId: members[member].slot.id, member, round, ...workTarget(values, round, members[member], group) });
      if (i < active.length - 1 && transition > 0) steps.push({ kind: "transition", seconds: transition, round, next: active[i + 1] });
    });
    const next = roundMembers[round + 1];
    if (next && roundRest > 0) steps.push({ kind: "roundRest", seconds: roundRest, round, next: next[0] });
  });
  return steps;
}

/**
 * A timed set is `timeOn` (with any reps and the rest between them inside
 * it - a repeater set counts down as one), or a share of a plain
 * `duration`. Anything else is counted: open, with its reps as the target.
 */
function workTarget(values: ExerciseValues, round: number, m: GroupMember, group: ExerciseGroup): { seconds?: number; reps?: number } {
  const reps = repsAt(values, round);
  const timeOn = Number(values.timeOn);
  if (Number.isFinite(timeOn) && timeOn > 0) {
    const n = reps ?? 1;
    return { seconds: n * timeOn + Math.max(0, n - 1) * restSeconds(values).betweenReps, ...(reps !== undefined ? { reps } : {}) };
  }
  if (reps !== undefined) return { reps };
  const duration = Number(values.duration);
  if (Number.isFinite(duration) && duration > 0) return { seconds: Math.round((duration * 60) / Math.max(1, memberRounds(m.values, group))) };
  return {};
}

function repsAt(values: ExerciseValues, round: number): number | undefined {
  const perSet = toRepsArray(values.reps);
  if (perSet) return perSet[Math.min(round, perSet.length - 1)];
  const n = Number(values.reps);
  return typeof values.reps === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function startCircuitRun(): CircuitRunState {
  return { stepIndex: 0, stepElapsedMs: 0, results: {}, done: false };
}

export function currentStep(steps: CircuitStep[], state: CircuitRunState): CircuitStep | undefined {
  return state.done ? undefined : steps[state.stepIndex];
}

/** Seconds left in the current step, or `undefined` for an open (counted) set. */
export function stepRemainingSeconds(steps: CircuitStep[], state: CircuitRunState): number | undefined {
  const step = currentStep(steps, state);
  if (!step || step.kind === "work" && step.seconds === undefined) return undefined;
  const seconds = step.kind === "work" ? step.seconds! : step.seconds;
  return Math.max(0, seconds - state.stepElapsedMs / 1000);
}

/**
 * Moves time on. Timed steps end by themselves - a timed set is recorded
 * as done in full - and any time left over carries into the next step, so
 * a long gap (the phone was locked) lands where the clock really is. An
 * open counted set just keeps counting.
 */
export function tickCircuitRun(steps: CircuitStep[], state: CircuitRunState, deltaMs: number): CircuitRunState {
  if (state.done || deltaMs <= 0) return state;
  let next = { ...state, stepElapsedMs: state.stepElapsedMs + deltaMs };
  for (;;) {
    const step = steps[next.stepIndex];
    if (!step) return { ...next, done: true };
    const seconds = step.kind === "work" ? step.seconds : step.seconds;
    if (seconds === undefined || next.stepElapsedMs < seconds * 1000) return next;
    const carry = next.stepElapsedMs - seconds * 1000;
    if (step.kind === "work") next = record(next, step, seconds);
    next = advance(steps, next, carry);
    if (next.done) return next;
  }
}

/**
 * "Done" on the current step: a counted set is recorded with `reps` (its
 * target if none given), a timed set ended early with the time it ran, and
 * a rest is cut short.
 */
export function finishCircuitStep(steps: CircuitStep[], state: CircuitRunState, reps?: number): CircuitRunState {
  const step = currentStep(steps, state);
  if (!step) return state;
  let next = state;
  if (step.kind === "work") {
    const value = step.seconds !== undefined ? Math.round(state.stepElapsedMs / 1000) : (reps ?? step.reps ?? 0);
    next = record(state, step, value);
  }
  return advance(steps, next, 0);
}

/** Skips the current step; a skipped set is recorded as not done. */
export function skipCircuitStep(steps: CircuitStep[], state: CircuitRunState): CircuitRunState {
  const step = currentStep(steps, state);
  if (!step) return state;
  const next = step.kind === "work" ? record(state, step, null) : state;
  return advance(steps, next, 0);
}

/** Corrects what a set recorded - the reps stepper on the rest after it. */
export function setCircuitResult(state: CircuitRunState, slotId: string, round: number, value: number | null): CircuitRunState {
  const list = [...(state.results[slotId] ?? [])];
  list[round] = value;
  return { ...state, results: { ...state.results, [slotId]: list } };
}

/** The last work step before the current one - what the rest after a set lets you correct. */
export function previousWork(steps: CircuitStep[], state: CircuitRunState): Extract<CircuitStep, { kind: "work" }> | undefined {
  const upTo = state.done ? steps.length : state.stepIndex;
  for (let i = upTo - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind === "work") return s;
  }
  return undefined;
}

/** The next work step from here (the current one if it is work) - "next: Side plank". */
export function upcomingWork(steps: CircuitStep[], state: CircuitRunState): Extract<CircuitStep, { kind: "work" }> | undefined {
  for (let i = state.stepIndex; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "work") return s;
  }
  return undefined;
}

export interface CircuitProgress {
  round: number;
  rounds: number;
  /** Work steps settled / all work steps. */
  sets: number;
  totalSets: number;
}

export function circuitProgress(steps: CircuitStep[], state: CircuitRunState): CircuitProgress {
  const work = steps.filter((s): s is Extract<CircuitStep, { kind: "work" }> => s.kind === "work");
  const rounds = work.reduce((m, s) => Math.max(m, s.round + 1), 0);
  const settled = work.filter((s) => state.results[s.slotId]?.[s.round] !== undefined).length;
  const here = upcomingWork(steps, state) ?? work[work.length - 1];
  return { round: state.done ? rounds : (here?.round ?? 0) + 1, rounds, sets: settled, totalSets: work.length };
}

/**
 * What to log for each member, by slot id: the planned values with the
 * sets actually done, and for counted sets the reps of each (a per-set
 * array, as the self-paced set timer writes). `undefined` for a member
 * that did no set at all - the caller skips it.
 */
export function circuitLoggedValues(members: GroupMember[], state: CircuitRunState): Record<string, ExerciseValues | undefined> {
  const out: Record<string, ExerciseValues | undefined> = {};
  for (const { slot, values } of members) {
    const done = (state.results[slot.id] ?? []).filter((v): v is number => v !== null && v !== undefined);
    if (done.length === 0) {
      out[slot.id] = undefined;
      continue;
    }
    const timed = Number(values.timeOn) > 0 || (!values.reps && Number(values.duration) > 0);
    const logged: ExerciseValues = { ...values, sets: done.length };
    if (!timed) logged.reps = done;
    out[slot.id] = logged;
  }
  return out;
}

// --- Background (Android service) --------------------------------------

export interface CircuitLiveInput {
  steps: CircuitStep[];
  state: CircuitRunState;
  running: boolean;
  name: string;
  /** Display name of a member by index. */
  memberName: (member: number) => string;
  ticks: boolean;
  warningSeconds: number;
}

/**
 * The service schedule for a running circuit: every step from now until
 * the next open (counted) set, which only you can end - the plan is simply
 * re-made when you do. Same shape as the interval timer's, so the session
 * notification and the beeps work the same way.
 */
export function buildCircuitLive(input: CircuitLiveInput, now: number): LiveTimerConfig | null {
  const { steps, state } = input;
  if (state.done) return null;
  const rounds = circuitProgress(steps, state).rounds;
  if (!input.running) {
    return { segments: [{ title: `${input.name} paused`, body: describe(steps[state.stepIndex], input, rounds) }], cues: [], actions: ["resume"], finishedTitle: input.name };
  }
  const segments: LiveSegment[] = [];
  const cues: LiveCue[] = [];
  let t = now - state.stepElapsedMs;
  for (let i = state.stepIndex; i < steps.length; i++) {
    const step = steps[i];
    const title = describe(step, input, rounds);
    const seconds = step.kind === "work" ? step.seconds : step.seconds;
    if (i > state.stepIndex) cues.push({ at: t, kind: step.kind === "work" ? "work" : step.kind === "leadIn" ? "leadIn" : "rest" });
    if (seconds === undefined) {
      segments.push({ startedAt: t, title, body: input.name });
      return { segments, cues: cues.filter((c) => c.at > now), actions: ["pause"], finishedTitle: input.name };
    }
    const end = t + seconds * 1000;
    segments.push({ endsAt: end, title, body: input.name });
    if (input.ticks) cues.push(...[3000, 2000, 1000].map((d) => ({ at: end - d, kind: "tick" as const })));
    if (step.kind === "roundRest" && input.warningSeconds > 0 && seconds > input.warningSeconds + 3) cues.push({ at: end - input.warningSeconds * 1000, kind: "warn" });
    t = end;
  }
  cues.push({ at: t, kind: "done" });
  return { segments, cues: cues.filter((c) => c.at > now).sort((a, b) => a.at - b.at), actions: ["pause"], finishedTitle: `${input.name} done` };
}

function describe(step: CircuitStep | undefined, input: CircuitLiveInput, rounds: number): string {
  if (!step) return input.name;
  if (step.kind === "leadIn") return "Get ready";
  if (step.kind === "work") {
    const what = step.seconds === undefined && step.reps ? ` · ${step.reps} reps` : "";
    return `Round ${step.round + 1}/${rounds} · ${input.memberName(step.member)}${what}`;
  }
  return `${step.kind === "roundRest" ? "Rest" : "Switch"} · next: ${input.memberName(step.next)}`;
}

// --- Helpers ----------------------------------------------------------

function record(state: CircuitRunState, step: Extract<CircuitStep, { kind: "work" }>, value: number | null): CircuitRunState {
  return setCircuitResult(state, step.slotId, step.round, value);
}

function advance(steps: CircuitStep[], state: CircuitRunState, carryMs: number): CircuitRunState {
  const stepIndex = state.stepIndex + 1;
  if (stepIndex >= steps.length) return { ...state, stepIndex: steps.length, stepElapsedMs: 0, done: true };
  return { ...state, stepIndex, stepElapsedMs: carryMs };
}
