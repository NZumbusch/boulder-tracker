/**
 * What the Android timer service should show and play, for a given timer
 * state - the whole future of a running timer, handed over in one go.
 *
 * The page can't make a sound or tick a notification while the phone is
 * locked, so on Android the timer runs a small native service
 * (`plugins/timer-service`) with an ongoing notification and the beeps.
 * This module turns the widget's state into that service's schedule:
 *
 * - `segments`: what the notification says over time. Each one either
 *   counts down to `endsAt` or up from `startedAt` - Android's own
 *   notification clock does the ticking, the app doesn't have to be awake.
 * - `cues`: every beep, at its exact time - phase changes, the optional
 *   3-2-1 and 15 s warning, the finish - the same cues the page plays.
 *
 * Pure: state and clock in, schedule out. The service re-plans whenever
 * the timer changes (pause, skip, a finished set), so the schedule only
 * has to describe "if nothing else happens".
 */
import { type IntervalSpec, buildTimeline, clampSpec, phaseLabel, stepStartSeconds, timelineSeconds } from "./intervalTimer";
import { type Clock, clockElapsedMs, countdownRemainingMs } from "./clock";
import { type SetRunState, isResting, restRemainingSeconds, setRunPhase } from "./setRun";

export type CueKind = "work" | "rest" | "setRest" | "leadIn" | "done" | "tick" | "warn";

export interface LiveSegment {
  /** Count down to this epoch ms... */
  endsAt?: number;
  /** ...or up from this one. Neither = a frozen display (paused). */
  startedAt?: number;
  title: string;
  body: string;
}

export interface LiveCue {
  at: number;
  kind: CueKind;
}

export type LiveAction = "pause" | "resume" | "add30";

export interface LiveTimerConfig {
  segments: LiveSegment[];
  cues: LiveCue[];
  actions: LiveAction[];
  /** Shown once everything has run out, then the notification can be dismissed. */
  finishedTitle: string;
}

export interface LiveInput {
  mode: "stopwatch" | "timer" | "interval";
  targetSeconds: number;
  basic: Clock;
  spec: IntervalSpec;
  intervalClock: Clock;
  selfPaced: boolean;
  setRun: SetRunState;
  /** Beep the last three seconds of phases/rests/countdowns. */
  ticks: boolean;
  /** Seconds before an end to warn at; 0 = off. */
  warningSeconds: number;
  /** Name of the exercise, for the notification. */
  label: string;
  workLabel: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 3-2-1 before `end`, only those still ahead. */
function ticksBefore(end: number, now: number): LiveCue[] {
  return [3000, 2000, 1000].map((d) => ({ at: end - d, kind: "tick" as const })).filter((c) => c.at > now);
}

/**
 * The service schedule for the current state, or `null` when there is
 * nothing to run in the background (no timer going, or a finished one).
 */
export function buildLiveTimer(input: LiveInput, now: number): LiveTimerConfig | null {
  const body = input.label;

  // --- Stopwatch / countdown
  if (input.mode !== "interval") {
    const running = input.basic.runningSince !== null;
    if (input.mode === "stopwatch") {
      if (!running) return null;
      return {
        segments: [{ startedAt: now - clockElapsedMs(input.basic, now), title: "Stopwatch", body }],
        cues: [],
        actions: ["pause"],
        finishedTitle: "Stopwatch",
      };
    }
    const remaining = countdownRemainingMs(input.targetSeconds, input.basic, now);
    if (remaining <= 0) return null;
    if (!running) {
      // Paused part-way: keep the notification, frozen, with Resume.
      if (input.basic.bankedMs === 0) return null;
      return { segments: [{ title: `Countdown paused · ${fmt(remaining)} left`, body }], cues: [], actions: ["resume"], finishedTitle: "Time's up" };
    }
    const end = now + remaining;
    const cues: LiveCue[] = [];
    if (input.warningSeconds > 0 && remaining > input.warningSeconds * 1000) cues.push({ at: end - input.warningSeconds * 1000, kind: "warn" });
    if (input.ticks) cues.push(...ticksBefore(end, now));
    cues.push({ at: end, kind: "done" });
    return { segments: [{ endsAt: end, title: "Countdown", body }], cues, actions: ["pause", "add30"], finishedTitle: "Time's up" };
  }

  const spec = clampSpec(input.spec);
  const running = input.intervalClock.runningSince !== null;

  // --- Self-paced sets: you end each set; only the rests are on a clock.
  if (input.selfPaced) {
    const run = input.setRun;
    if (run.done || !running) return null;
    const setText = `Set ${run.currentSet} of ${spec.sets}`;
    if (setRunPhase(run) === "leadIn") {
      const end = now + run.leadInRemainingMs;
      return {
        segments: [{ endsAt: end, title: "Get ready", body: `${setText} · ${body}` }, { startedAt: end, title: setText, body }],
        cues: [...(input.ticks ? ticksBefore(end, now) : []), { at: end, kind: "work" }],
        actions: [],
        finishedTitle: setText,
      };
    }
    if (isResting(run)) {
      const left = restRemainingSeconds(run, spec) * 1000;
      const restStart = now - run.sinceLastSetMs;
      if (left <= 0) {
        return { segments: [{ startedAt: restStart, title: `Rest over · ${setText}`, body }], cues: [], actions: [], finishedTitle: setText };
      }
      const end = now + left;
      const cues: LiveCue[] = [];
      if (input.warningSeconds > 0 && left > input.warningSeconds * 1000) cues.push({ at: end - input.warningSeconds * 1000, kind: "warn" });
      if (input.ticks) cues.push(...ticksBefore(end, now));
      cues.push({ at: end, kind: "work" });
      return {
        segments: [{ endsAt: end, title: `Rest · next: ${setText}`, body }, { startedAt: end, title: `Rest over · ${setText}`, body }],
        cues,
        actions: [],
        finishedTitle: setText,
      };
    }
    // In a set: nothing will beep until you finish it in the app.
    return { segments: [{ startedAt: now - run.sinceLastSetMs, title: setText, body }], cues: [], actions: [], finishedTitle: setText };
  }

  // --- Timed interval protocol
  const timeline = buildTimeline(spec);
  const total = timelineSeconds(timeline);
  const elapsedS = clockElapsedMs(input.intervalClock, now) / 1000;
  if (elapsedS >= total) return null;
  if (!running) {
    if (elapsedS === 0) return null;
    return { segments: [{ title: "Interval paused", body }], cues: [], actions: ["resume"], finishedTitle: "Interval done" };
  }

  const at = (seconds: number) => now + (seconds - elapsedS) * 1000;
  const segments: LiveSegment[] = [];
  const cues: LiveCue[] = [];
  timeline.forEach((step, i) => {
    const start = stepStartSeconds(timeline, i);
    const end = start + step.seconds;
    if (end <= elapsedS) return;
    const where = step.phase === "leadIn" ? `Set 1/${spec.sets}` : `Set ${step.set}/${spec.sets}${step.rep ? ` · Rep ${step.rep}/${spec.reps}` : ""}`;
    segments.push({ endsAt: at(end), title: `${phaseLabel(step.phase, input.workLabel)} · ${where}`, body });
    if (start > elapsedS) cues.push({ at: at(start), kind: step.phase });
    if (input.ticks) cues.push(...ticksBefore(at(end), now));
    if (step.phase === "setRest" && input.warningSeconds > 0 && step.seconds > input.warningSeconds + 3) {
      const warnAt = at(end) - input.warningSeconds * 1000;
      if (warnAt > now) cues.push({ at: warnAt, kind: "warn" });
    }
  });
  cues.push({ at: at(total), kind: "done" });

  return { segments, cues: cues.sort((a, b) => a.at - b.at), actions: ["pause"], finishedTitle: "Interval done" };
}
