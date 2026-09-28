/**
 * The one owner of the Android session notification (`plugins/timer-service`).
 *
 * Two things want to be in it: the running session (always, while one
 * runs - "Session · Limit boulders", its clock, how far through) and the
 * session timer when one runs (its countdown and beeps). The timer widget
 * publishes its plan here (`live.timerPlan`); the session modal combines
 * that with the session (`composeLive`) and is the only caller that sends
 * or stops. The session is appended as the last, open-ended segment, so
 * once a timer runs out the notification falls back to the session by
 * itself, without the page having to wake.
 *
 * Starting the service with the session - while the app is on screen -
 * also means later timer plans only update a running service; Android
 * refuses to start one from the background.
 *
 * Notification button presses arrive here too, numbered: from the event
 * while the page is open, and collected (`collectLiveActions`) when it
 * wakes, before anything catches up on time. Each is handed once to the
 * handlers - the timer's (pause/resume/+30 s) and the session's.
 */
import type { LiveTimerConfig, LiveSegment } from "../timer/liveTimer";
import { onLiveTimerAction, takeLiveActions, type LiveAction } from "./timerService";

export const live = $state<{
  /** The timer's current plan, or null when no timer runs (or it isn't handed to the service). */
  timerPlan: LiveTimerConfig | null;
  /** The timer ran out by itself - the service finishes it on its own, so nothing should be stopped. */
  timerFinished: boolean;
  /** False when Android refused the service - the page then plays its own cues again. */
  serviceOk: boolean;
  /** A circuit is running (`CircuitRunner`): it publishes the timer plan, and the timer widget stays out of it. */
  circuitRunning: boolean;
}>({ timerPlan: null, timerFinished: false, serviceOk: true, circuitRunning: false });

type Handler = (action: LiveAction) => void;
const handlers = new Set<Handler>();
let lastSeq = 0;
let listening = false;

function dispatch(action: LiveAction) {
  if (action.seq <= lastSeq) return;
  lastSeq = action.seq;
  for (const h of handlers) h(action);
}

export function onLiveAction(handler: Handler): () => void {
  handlers.add(handler);
  if (!listening) {
    listening = true;
    void onLiveTimerAction(dispatch);
  }
  return () => handlers.delete(handler);
}

/** Applies every press made while the page was asleep. */
export async function collectLiveActions(): Promise<void> {
  for (const action of await takeLiveActions()) dispatch(action);
}

export interface SessionInfo {
  name: string;
  /** The current exercise, if any. */
  exercise?: string;
  done: number;
  total: number;
  running: boolean;
  elapsedMs: number;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** The session as a notification segment: counting up while it runs, frozen while paused. */
export function sessionSegment(session: SessionInfo, now: number): LiveSegment {
  const body = [session.exercise, `${session.done}/${session.total} done`].filter(Boolean).join(" · ");
  return session.running
    ? { startedAt: now - session.elapsedMs, title: `Session · ${session.name}`, body, actions: ["sessionPause"] }
    : { title: `Session paused · ${session.name}`, body: `${fmt(session.elapsedMs)} · ${body}`, actions: ["sessionResume"] };
}

/**
 * What the notification should carry: the timer's plan with the session
 * after it, the session alone, or nothing. Pure.
 */
export function composeLive(
  timerPlan: LiveTimerConfig | null,
  session: SessionInfo | null,
  options: { sessionNotification: boolean },
  now: number,
): LiveTimerConfig | null {
  const tail = session && options.sessionNotification ? sessionSegment(session, now) : null;
  if (timerPlan) {
    return tail ? { ...timerPlan, segments: [...timerPlan.segments, tail] } : timerPlan;
  }
  if (!tail) return null;
  return { segments: [tail], cues: [], actions: [], finishedTitle: `Session · ${session!.name}` };
}
