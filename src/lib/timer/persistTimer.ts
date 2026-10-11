/**
 * The session timer's state, saved so a timer survives Android closing the
 * app in the background - the same promise the running session itself
 * already keeps (see `session/persistSession.ts`).
 *
 * Everything time-related is stored as timestamps (`Clock`), so a restored
 * timer is exactly where it would have been. The self-paced set run
 * advances by tick deltas, so the time of its last tick is kept too: the
 * first tick after a restore then covers the whole gap.
 *
 * Parsing is total - anything it can't vouch for comes back `null` and the
 * timer simply starts fresh. It never throws.
 */
import type { Clock } from "./clock";
import { type IntervalSpec, clampSpec } from "./intervalTimer";
import type { SetRunState, SetTimingMode } from "./setRun";

export const ACTIVE_TIMER_KEY = "boulder_tracker_active_timer";

export interface TimerSnapshot {
  mode: "stopwatch" | "timer" | "interval";
  targetSeconds: number;
  basic: Clock;
  spec: IntervalSpec;
  baseSpec: IntervalSpec;
  seededForSlotId: string | null;
  intervalClock: Clock;
  expanded: boolean;
  timingMode: SetTimingMode;
  setRun: SetRunState;
  stagedReps: number;
  lastTickAt: number;
}

const MODES = ["stopwatch", "timer", "interval"] as const;
const TIMING_MODES: SetTimingMode[] = ["auto", "timed", "selfPaced"];

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

function spec(v: unknown): IntervalSpec | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const s = v as Record<string, unknown>;
  const keys = ["sets", "reps", "workSeconds", "restSeconds", "setRestSeconds", "leadInSeconds"] as const;
  if (!keys.every((k) => num(s[k]) !== undefined)) return undefined;
  return clampSpec(s as unknown as IntervalSpec);
}

function setRun(v: unknown): SetRunState | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  const currentSet = num(r.currentSet);
  const sinceLastSetMs = num(r.sinceLastSetMs);
  const leadInRemainingMs = num(r.leadInRemainingMs);
  if (currentSet === undefined || sinceLastSetMs === undefined || leadInRemainingMs === undefined) return undefined;
  if (!Array.isArray(r.completed) || !r.completed.every((n) => num(n) !== undefined)) return undefined;
  return { currentSet, completed: r.completed as number[], sinceLastSetMs, leadInRemainingMs, done: r.done === true };
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

  const mode = MODES.find((m) => m === c.mode);
  const targetSeconds = num(c.targetSeconds);
  const basic = clock(c.basic);
  const intervalClock = clock(c.intervalClock);
  const s = spec(c.spec);
  const base = spec(c.baseSpec);
  const run = setRun(c.setRun);
  if (!mode || targetSeconds === undefined || !basic || !intervalClock || !s || !base || !run) return null;

  return {
    mode,
    targetSeconds,
    basic,
    spec: s,
    baseSpec: base,
    seededForSlotId: typeof c.seededForSlotId === "string" ? c.seededForSlotId : null,
    intervalClock,
    expanded: c.expanded === true,
    timingMode: TIMING_MODES.find((m) => m === c.timingMode) ?? "auto",
    setRun: run,
    stagedReps: num(c.stagedReps) ?? s.reps,
    lastTickAt: num(c.lastTickAt) ?? 0,
  };
}
