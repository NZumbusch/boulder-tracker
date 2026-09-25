/**
 * What to notify about while the app is in the background.
 *
 * A backgrounded or locked phone can't beep from the page, so when the app
 * is hidden the timer hands its upcoming moments to Android as scheduled
 * local notifications, and takes them back when it returns:
 *
 * - a countdown ending,
 * - a rest between sets ending - the set rests of an interval protocol,
 *   and the rest of a self-paced strength set,
 * - an interval protocol finishing,
 * - optionally, a warning some seconds before each of those.
 *
 * The short on/off rests *inside* a hangboard set (7 on, 3 off) are left
 * out on purpose: nobody pockets their phone mid-repeater, and a
 * notification every few seconds would be noise.
 *
 * Pure: the widget passes its state and the clock in.
 */
import type { IntervalSpec } from "./intervalTimer";
import { buildTimeline, clampSpec, stepStartSeconds, timelineSeconds } from "./intervalTimer";
import { type Clock, clockElapsedMs, countdownRemainingMs } from "./clock";
import { type SetRunState, isResting, restRemainingSeconds } from "./setRun";

export interface TimerAlert {
  /** Epoch ms to fire at. */
  atMs: number;
  kind: "end" | "warning";
  title: string;
  body: string;
}

export interface AlertInput {
  mode: "stopwatch" | "timer" | "interval";
  /** Countdown length, seconds. */
  targetSeconds: number;
  /** The stopwatch/countdown clock. */
  basic: Clock;
  spec: IntervalSpec;
  /** The interval (and self-paced) clock. */
  intervalClock: Clock;
  selfPaced: boolean;
  setRun: SetRunState;
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

  if (input.mode === "interval" && input.intervalClock.runningSince !== null) {
    if (input.selfPaced) {
      const run = input.setRun;
      if (isResting(run)) {
        const left = restRemainingSeconds(run, input.spec) * 1000;
        if (left > 0) {
          withWarning(alerts, { atMs: now + left, kind: "end", title: "Rest over", body: `Set ${run.currentSet} of ${clampSpec(input.spec).sets}` }, input.warningSeconds, now);
        }
      }
    } else {
      const timeline = buildTimeline(input.spec);
      const elapsed = clockElapsedMs(input.intervalClock, now) / 1000;
      for (let i = 1; i < timeline.length; i++) {
        const step = timeline[i];
        if (step.phase !== "work" || timeline[i - 1].phase !== "setRest") continue;
        const startsAt = stepStartSeconds(timeline, i);
        if (startsAt <= elapsed) continue;
        withWarning(alerts, {
          atMs: now + (startsAt - elapsed) * 1000,
          kind: "end",
          title: "Rest over",
          body: `Set ${step.set} of ${clampSpec(input.spec).sets}`,
        }, input.warningSeconds, now);
      }
      const total = timelineSeconds(timeline);
      if (total > elapsed) {
        alerts.push({ atMs: now + (total - elapsed) * 1000, kind: "end", title: "Interval done", body: "All sets finished" });
      }
    }
  }

  return alerts.sort((a, b) => a.atMs - b.atMs).slice(0, MAX_ALERTS);
}
