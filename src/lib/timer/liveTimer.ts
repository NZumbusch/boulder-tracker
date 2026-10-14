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
import { type Clock, clockElapsedMs, countdownRemainingMs } from "./clock";

export type CueKind = "work" | "rest" | "setRest" | "leadIn" | "done" | "tick" | "warn";

export interface LiveSegment {
  /** Count down to this epoch ms... */
  endsAt?: number;
  /** ...or up from this one. Neither = a frozen display (paused). */
  startedAt?: number;
  title: string;
  body: string;
  /** Buttons for this segment only (the session's, shown once a timer has run out); otherwise the plan's. */
  actions?: LiveAction[];
}

export interface LiveCue {
  at: number;
  /** A beep pattern, or "speak": say `text` aloud (text-to-speech). */
  kind: CueKind | "speak";
  text?: string;
}

/** `done` / `skip` end the current step of a circuit or timer run from the notification (the page applies them - it owns the run). */
export type LiveAction = "pause" | "resume" | "add30" | "done" | "skip" | "sessionPause" | "sessionResume";

export interface LiveTimerConfig {
  segments: LiveSegment[];
  cues: LiveCue[];
  actions: LiveAction[];
  /** Shown once everything has run out, then the notification can be dismissed. */
  finishedTitle: string;
}

export interface LiveInput {
  mode: "stopwatch" | "timer";
  targetSeconds: number;
  basic: Clock;
  /** Beep the last three seconds of a countdown. */
  ticks: boolean;
  /** Seconds before the end to warn at; 0 = off. */
  warningSeconds: number;
  /** The notification's second line. */
  label: string;
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
 * The service schedule for the stopwatch or countdown, or `null` when there
 * is nothing to run in the background (no timer going, or a finished one).
 * Intervals, sets and the pacer are runs of the circuit engine, which makes
 * its own schedule (`buildCircuitLive`).
 */
export function buildLiveTimer(input: LiveInput, now: number): LiveTimerConfig | null {
  const body = input.label;
  const running = input.basic.runningSince !== null;
  if (input.mode === "stopwatch") {
    if (!running) {
      // Paused part-way: keep the notification, frozen, with Resume.
      const elapsed = clockElapsedMs(input.basic, now);
      if (elapsed === 0) return null;
      return { segments: [{ title: `Stopwatch paused · ${fmt(elapsed)}`, body }], cues: [], actions: ["resume"], finishedTitle: "Stopwatch" };
    }
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
