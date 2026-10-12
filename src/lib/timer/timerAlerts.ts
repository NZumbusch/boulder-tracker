/**
 * What to notify about while the app is in the background.
 *
 * A backgrounded or locked phone can't beep from the page, so when the app
 * is hidden the timer hands its upcoming moments to Android as scheduled
 * local notifications, and takes them back when it returns:
 *
 * - a countdown ending,
 * - optionally, a warning some seconds before it.
 *
 * (Runs of the circuit engine - intervals, sets, the pacer - are covered by
 * the Android service's own schedule.)
 *
 * Pure: the widget passes its state and the clock in.
 */
import { type Clock, countdownRemainingMs } from "./clock";

export interface TimerAlert {
  /** Epoch ms to fire at. */
  atMs: number;
  kind: "end" | "warning";
  title: string;
  body: string;
}

export interface AlertInput {
  mode: "stopwatch" | "timer";
  /** Countdown length, seconds. */
  targetSeconds: number;
  /** The stopwatch/countdown clock. */
  basic: Clock;
  /** Seconds before an end to warn at; 0 = no warnings. */
  warningSeconds: number;
}

/** More than this many upcoming alerts is a very long protocol; the rest are scheduled on the next return. */
export const MAX_ALERTS = 16;

function withWarning(alerts: TimerAlert[], end: TimerAlert, warningSeconds: number, now: number) {
  if (warningSeconds > 0) {
    const at = end.atMs - warningSeconds * 1000;
    if (at > now) alerts.push({ atMs: at, kind: "warning", title: `${warningSeconds} s left`, body: end.title });
  }
  alerts.push(end);
}

export function upcomingAlerts(input: AlertInput, now: number): TimerAlert[] {
  const alerts: TimerAlert[] = [];

  if (input.mode === "timer" && input.basic.runningSince !== null) {
    const remaining = countdownRemainingMs(input.targetSeconds, input.basic, now);
    if (remaining > 0) {
      withWarning(alerts, { atMs: now + remaining, kind: "end", title: "Time's up", body: "Countdown finished" }, input.warningSeconds, now);
    }
  }

  return alerts.sort((a, b) => a.atMs - b.atMs).slice(0, MAX_ALERTS);
}
