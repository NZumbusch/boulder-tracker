import type { ExerciseGroup, ExerciseValues } from "../types";
import { groupTiming, memberRounds, restBetweenRounds, switchSeconds, type GroupMember } from "../exercise/groups";
import { toRepsArray } from "../exercise/reps";
import { restSeconds } from "../exercise/rest";
import type { LiveCue, LiveSegment, LiveTimerConfig } from "./liveTimer";
import type { AnnounceRules } from "./timerCues";
import { type SpeechMeasure, START_MARGIN, exercisePhrase, nextText, planRestSpeech, targetSpeech } from "./announcePlan";

/**
 * Running a circuit or superset live: one timeline across its members,
 * round by round (see `lib/exercise/groups.ts` for the rules it follows).
 *
 * Steps are one of:
 * - **work** - a member's set. Timed (`seconds`) counts down and moves on
 *   by itself; counted (no `seconds`) stays open until the user taps Done.
 *   A repeater set (`interval`) is a timed set made of hang/rest repeats:
 *   still one step on the timeline, but shown and cued rep by rep.
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
  | { kind: "work"; slotId: string; member: number; round: number; seconds?: number; reps?: number; interval?: RepeaterSpec }
  | { kind: "transition"; seconds: number; round: number; next: number }
  | { kind: "roundRest"; seconds: number; round: number; next: number };

/** A repeater set: `reps` hangs of `on` seconds with `off` seconds between them (none after the last). */
export interface RepeaterSpec {
  reps: number;
  on: number;
  off: number;
}

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
  const roundRest = restBetweenRounds(group);
  const steps: CircuitStep[] = [];
  if (leadIn > 0) steps.push({ kind: "leadIn", seconds: leadIn });

  roundMembers.forEach((active, round) => {
    active.forEach((member, i) => {
      const values = members[member].values;
      steps.push({ kind: "work", slotId: members[member].slot.id, member, round, ...workTarget(values, round, members[member], group) });
      const transition = switchSeconds(group, values);
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
function workTarget(values: ExerciseValues, round: number, m: GroupMember, group: ExerciseGroup): { seconds?: number; reps?: number; interval?: RepeaterSpec } {
  const reps = repsAt(values, round);
  const timeOn = Number(values.timeOn);
  if (Number.isFinite(timeOn) && timeOn > 0) {
    const n = reps ?? 1;
    const off = restSeconds(values).betweenReps;
    return {
      seconds: n * timeOn + Math.max(0, n - 1) * off,
      ...(reps !== undefined ? { reps } : {}),
      ...(n > 1 ? { interval: { reps: n, on: timeOn, off } } : {}),
    };
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

export interface RepeaterPosition {
  /** 1-based hang the clock is in (or has just finished, during the rest after it). */
  rep: number;
  phase: "on" | "off";
  /** Seconds left in this hang or rest. */
  remaining: number;
  /** Seconds this hang or rest lasts. */
  length: number;
}

/** Where a repeater set stands `elapsedMs` into it: which hang, and whether it is hanging or resting. */
export function repeaterPosition(spec: RepeaterSpec, elapsedMs: number): RepeaterPosition {
  const t = Math.max(0, elapsedMs / 1000);
  const cycle = spec.on + spec.off;
  const rep = Math.min(spec.reps, Math.floor(t / cycle) + 1);
  const into = t - (rep - 1) * cycle;
  if (into < spec.on || rep === spec.reps) {
    const left = Math.max(0, spec.on - into);
    return { rep, phase: "on", remaining: left, length: spec.on };
  }
  return { rep, phase: "off", remaining: Math.max(0, cycle - into), length: spec.off };
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

/** Past this long into a step, Back restarts the step instead of leaving it (like a music player's). */
export const CIRCUIT_BACK_RESTART_MS = 3000;

/**
 * Back, as a music player has it: more than a few seconds into a step it
 * restarts that step; at the beginning of one it goes to the step before
 * (a set that was recorded there is taken back, to be done again). The
 * lead-in is never gone back to - at the first real step it just restarts.
 */
export function previousCircuitStep(steps: CircuitStep[], state: CircuitRunState): CircuitRunState {
  if (state.done) return state;
  const restart = { ...state, stepElapsedMs: 0 };
  const prevIndex = state.stepIndex - 1;
  const prev = steps[prevIndex];
  if (state.stepElapsedMs > CIRCUIT_BACK_RESTART_MS || !prev || prev.kind === "leadIn") return restart;
  let results = state.results;
  if (prev.kind === "work" && (results[prev.slotId]?.length ?? 0) > prev.round) {
    results = { ...results, [prev.slotId]: results[prev.slotId].slice(0, prev.round) };
  }
  return { ...state, stepIndex: prevIndex, stepElapsedMs: 0, results };
}

/** Corrects what a set recorded - the reps stepper on the rest after it. */
export function setCircuitResult(state: CircuitRunState, slotId: string, round: number, value: number | null): CircuitRunState {
  const list = [...(state.results[slotId] ?? [])];
  list[round] = value;
  return { ...state, results: { ...state.results, [slotId]: list } };
}

/** The last work step before the current one - what the rest after a set lets the user correct. */
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

/**
 * The run cut short after `round` (0-based): the steps up to and including
 * that round's last set, so the run ends there without the rest, or the
 * rounds, after it. Rounds that have not begun are dropped; a round that is
 * under way is kept in full up to its last set.
 */
export function stepsEndingAfterRound(steps: CircuitStep[], round: number): CircuitStep[] {
  let last = -1;
  steps.forEach((s, i) => {
    if (s.kind === "work" && s.round <= round) last = i;
  });
  return last < 0 ? steps : steps.slice(0, last + 1);
}

/** The round (0-based) the run is in: the next set's, or the last one's when it is over. */
export function currentRound(steps: CircuitStep[], state: CircuitRunState): number {
  return Math.max(0, circuitProgress(steps, state).round - 1);
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
    delete logged.notes; // the plan's note stays the plan's: "how it went" is the user's to write
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
  /** Spoken announcements of the exercises; off when absent or disabled. */
  announce?: AnnounceRules;
  /** The voice's speaking speed - Auto estimates how long the words take from it. */
  speechRate?: number;
  /** The speech engine's own timing of phrases (Android), when known. */
  measure?: SpeechMeasure;
}

/**
 * The service schedule for a running circuit: every step from now until
 * the next open (counted) set, which only the user can end - the plan is simply
 * re-made when they do. Same shape as the interval timer's, so the session
 * notification and the beeps work the same way.
 */
export function buildCircuitLive(input: CircuitLiveInput, now: number): LiveTimerConfig | null {
  const { steps, state } = input;
  if (state.done) return null;
  const rounds = circuitProgress(steps, state).rounds;
  const totalSets = steps.filter((s) => s.kind === "work").length;
  /** "Circuit · Round 2/3 · Set 4/6" - the line under the title. `at` is the step's index. */
  const where = (at: number) => {
    const step = steps[at];
    const round = step && step.kind !== "leadIn" ? step.round + 1 : 1;
    // A rest names the set it leads into: sets up to and including the next one.
    const set = steps.slice(0, at + 1).filter((s) => s.kind === "work").length + (step && step.kind !== "work" ? 1 : 0);
    return `${input.name} · Round ${Math.min(round, rounds)}/${rounds} · Set ${Math.min(set, totalSets)}/${totalSets}`;
  };
  if (!input.running) {
    return { segments: [{ title: `Paused · ${describe(steps[state.stepIndex], input)}`, body: where(state.stepIndex) }], cues: [], actions: ["resume"], finishedTitle: input.name };
  }
  const segments: LiveSegment[] = [];
  const cues: LiveCue[] = [];
  const say = input.announce?.enabled ? input.announce : null;
  const speak = (at: number, text: string) => {
    if (at >= now - 100) cues.push({ at, kind: "speak", text });
  };
  let covered = false;
  let t = now - state.stepElapsedMs;
  for (let i = state.stepIndex; i < steps.length; i++) {
    const step = steps[i];
    const title = describe(step, input);
    const seconds = step.seconds;
    if (i > state.stepIndex) cues.push({ at: t, kind: step.kind === "work" ? "work" : step.kind === "leadIn" ? "leadIn" : "rest" });
    if (say?.mode === "auto") {
      if (step.kind === "work") {
        // The rest before already named it, or there was none: say it as the set begins.
        if (!covered) speak(t + START_MARGIN * 1000, exercisePhrase(input.memberName(step.member), saidTarget(steps, i)));
        covered = false;
      } else {
        const nextStep = steps[i + 1];
        if (nextStep?.kind === "work" && seconds !== undefined) {
          const plan = planRestSpeech({
            kind: step.kind, seconds, name: input.memberName(nextStep.member), target: saidTarget(steps, i + 1),
            rate: input.speechRate ?? 1, measure: input.measure, trimmed: nextStep.round >= 1, ticks: input.ticks, warningSeconds: input.warningSeconds,
          });
          plan.cues.forEach((c) => speak(t + c.offset * 1000, c.text));
          covered = plan.covered;
        }
      }
    } else if (say) {
      if (step.kind === "work" && say.work) speak(t - say.workLead * 1000, input.memberName(step.member));
      if (step.kind !== "work" && say.restStart) {
        const first = step.kind === "leadIn" ? steps.find((s): s is Extract<CircuitStep, { kind: "work" }> => s.kind === "work") : undefined;
        const next = step.kind === "leadIn" ? first?.member : step.next;
        if (next !== undefined) speak(t + say.restStartDelay * 1000, `${step.kind === "roundRest" ? "Rest. " : step.kind === "leadIn" ? "Get ready. " : ""}${nextText(input.memberName(next))}`);
      }
      if (step.kind !== "work" && step.kind !== "leadIn" && say.restEnd > 0 && seconds !== undefined && seconds > say.restEnd + say.restStartDelay + 4) {
        speak(t + seconds * 1000 - say.restEnd * 1000, nextText(input.memberName(step.next)));
      }
    }
    if (seconds === undefined) {
      segments.push({ startedAt: t, title, body: where(i) });
      return { segments, cues: cues.filter((c) => c.kind === "speak" || c.at > now), actions: ["pause"], finishedTitle: input.name };
    }
    const end = t + seconds * 1000;
    if (step.kind === "work" && step.interval) {
      // A repeater set: hang, rest, hang ... each its own stretch of the notification, with the switch beeps between.
      const { reps, on, off } = step.interval;
      const name = input.memberName(step.member);
      let at = t;
      for (let rep = 1; rep <= reps; rep++) {
        if (rep > 1) cues.push({ at, kind: "work" });
        const hangEnd = at + on * 1000;
        if (hangEnd > now) segments.push({ endsAt: hangEnd, title: `Hang ${rep}/${reps} · ${name}`, body: where(i) });
        if (input.ticks) cues.push(...[3000, 2000, 1000].map((d) => ({ at: hangEnd - d, kind: "tick" as const })));
        at = hangEnd;
        if (rep < reps && off > 0) {
          cues.push({ at, kind: "rest" });
          const restEnd = at + off * 1000;
          if (restEnd > now) segments.push({ endsAt: restEnd, title: `Rest ${rep}/${reps} · next hang`, body: where(i) });
          if (input.ticks) cues.push(...[3000, 2000, 1000].map((d) => ({ at: restEnd - d, kind: "tick" as const })));
          at = restEnd;
        }
      }
      t = end;
      continue;
    }
    segments.push({ endsAt: end, title, body: where(i) });
    if (input.ticks) cues.push(...[3000, 2000, 1000].map((d) => ({ at: end - d, kind: "tick" as const })));
    if (step.kind === "roundRest" && input.warningSeconds > 0 && seconds > input.warningSeconds + 3) cues.push({ at: end - input.warningSeconds * 1000, kind: "warn" });
    t = end;
  }
  cues.push({ at: t, kind: "done" });
  return { segments, cues: cues.filter((c) => c.kind === "speak" || c.at > now).sort((a, b) => a.at - b.at), actions: ["pause"], finishedTitle: `${input.name} done` };
}

/**
 * The target to say for the work step at `at`: always in the first round; later
 * ones only when it differs from what that member did the round before.
 */
function saidTarget(steps: CircuitStep[], at: number): string {
  const step = steps[at];
  if (step?.kind !== "work") return "";
  const target = targetSpeech(step);
  if (step.round === 0) return target;
  const before = steps.find((s) => s.kind === "work" && s.slotId === step.slotId && s.round === step.round - 1);
  return before?.kind === "work" && targetSpeech(before) === target ? "" : target;
}

/** The title: the phase and the exercise - "Go · Twists", "Rest · next: Push-ups". */
function describe(step: CircuitStep | undefined, input: CircuitLiveInput): string {
  if (!step) return input.name;
  if (step.kind === "leadIn") return "Get ready";
  if (step.kind === "work") {
    const what = step.seconds === undefined && step.reps ? ` · ${step.reps} reps` : "";
    return `Go · ${input.memberName(step.member)}${what}`;
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

/**
 * Rounds of a run that were done in full: every one of its sets settled
 * (a skipped set counts as settled, as the person chose not to do it).
 * `planned` is how many the circuit was set up for - "2 of 4 rounds".
 */
export function roundsDone(steps: CircuitStep[], state: CircuitRunState, planned = 0): { done: number; planned: number } {
  const work = steps.filter((s): s is Extract<CircuitStep, { kind: "work" }> => s.kind === "work");
  const rounds = work.reduce((m, s) => Math.max(m, s.round + 1), 0);
  let done = 0;
  for (let r = 0; r < Math.max(rounds, planned); r++) {
    const inRound = work.filter((s) => s.round === r);
    if (inRound.length === 0 || !inRound.every((s) => state.results[s.slotId]?.[r] !== undefined)) break;
    done++;
  }
  return { done, planned: Math.max(planned, rounds) };
}
