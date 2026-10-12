/**
 * The stopwatch / countdown, saved so it survives Android closing the app in
 * the background - the same promise the running session itself already keeps
 * (see `session/persistSession.ts`).
 *
 * Everything time-related is stored as timestamps (`Clock`), so a restored
 * timer is exactly where it would have been.
 *
 * Parsing is total - anything it can't vouch for comes back `null` and the
 * timer simply starts fresh. It never throws. (A snapshot from before the
 * interval timer became a run of the circuit engine still parses: its
 * stopwatch or countdown is kept, an interval in it is dropped.)
 */
import type { Clock } from "./clock";

export const ACTIVE_TIMER_KEY = "boulder_tracker_active_timer";

export interface TimerSnapshot {
  mode: "stopwatch" | "timer";
  targetSeconds: number;
  basic: Clock;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function clock(v: unknown): Clock | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const c = v as Record<string, unknown>;
  const bankedMs = num(c.bankedMs);
  if (bankedMs === undefined) return undefined;
  const runningSince = c.runningSince === null ? null : num(c.runningSince);
  if (runningSince === undefined) return undefined;
  return { bankedMs, runningSince };
}

export function serializeTimer(snapshot: TimerSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseStoredTimer(raw: string | null): TimerSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const c = parsed as Record<string, unknown>;
  const targetSeconds = num(c.targetSeconds);
  const basic = clock(c.basic);
  if (targetSeconds === undefined || !basic) return null;
  if (c.mode === "interval") return { mode: "stopwatch", targetSeconds, basic: { bankedMs: 0, runningSince: null } };
  if (c.mode !== "stopwatch" && c.mode !== "timer") return null;
  return { mode: c.mode, targetSeconds, basic };
}
