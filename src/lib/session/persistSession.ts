import type { ActiveSession } from "./activeSession";
import type { ExerciseSlot, Workout } from "../types";

/**
 * Reading a running session back after the app was closed.
 *
 * A session has to survive the app being killed mid-workout - phones
 * background and evict aggressively, and losing an hour of logged sets to
 * a swipe-away would make the whole feature untrustworthy. It lives in
 * `localStorage` rather than the main `localforage` database on purpose:
 * it is transient, device-local, and must never appear in a backup export
 * or be replayed into another device by an import.
 *
 * `parseStoredSession` is total - anything it can't vouch for comes back
 * as `null` and the app simply starts with no session, which is the safe
 * failure. It never throws, so a corrupt blob can't brick startup.
 */
export const ACTIVE_SESSION_KEY = "boulder_tracker_active_session";

export function serializeSession(session: ActiveSession): string {
  return JSON.stringify(session);
}

/**
 * Validates an unknown value as an `ActiveSession`.
 *
 * Deliberately strict about the *shape* it needs to operate (a workout
 * with an exercise array, a start time, a clock) and permissive about
 * everything inside it - an exercise slot's values are the app's own data
 * and are already tolerated as partial everywhere else. Times that don't
 * parse are repaired rather than rejected: a session with a broken clock
 * is still an hour of logged work worth keeping.
 */
export function parseStoredSession(raw: string | null): ActiveSession | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const c = parsed as Record<string, unknown>;

  const workout = validateWorkout(c.workout);
  if (!workout) return null;

  const startedAt = typeof c.startedAt === "string" && !Number.isNaN(Date.parse(c.startedAt))
    ? c.startedAt
    : new Date().toISOString();

  const accumulatedMs = nonNegativeNumber(c.accumulatedMs) ?? 0;

  // Taken at face value, including a value ahead of the current clock:
  // `elapsedMs` already floors at zero, so a device whose clock jumped
  // backwards shows a stalled timer that heals itself rather than a
  // negative one. Clamping here against `Date.now()` instead would make
  // this parse impure and would silently discard real banked time.
  const runningSince = typeof c.runningSince === "number" && Number.isFinite(c.runningSince)
    ? c.runningSince
    : null;

  const rawIndex = nonNegativeNumber(c.currentIndex) ?? 0;
  const currentIndex = workout.exercises.length === 0
    ? 0
    : Math.min(Math.floor(rawIndex), workout.exercises.length - 1);

  return {
    workout,
    startedAt,
    accumulatedMs,
    runningSince,
    currentIndex,
    sourceWorkoutId: typeof c.sourceWorkoutId === "string" ? c.sourceWorkoutId : null,
    slotMs: parseSlotMs(c.slotMs),
    slotClock: parseSlotClock(c.slotClock),
  };
}

/** Per-exercise banked times; bad entries are dropped, not the session. */
function parseSlotMs(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, ms] of Object.entries(raw as Record<string, unknown>)) {
    const n = nonNegativeNumber(ms);
    if (n !== undefined) out[id] = n;
  }
  return out;
}

function parseSlotClock(raw: unknown): { slotId: string | null; since: number | null } {
  if (typeof raw !== "object" || raw === null) return { slotId: null, since: null };
  const c = raw as Record<string, unknown>;
  const slotId = typeof c.slotId === "string" ? c.slotId : null;
  const since = slotId !== null && typeof c.since === "number" && Number.isFinite(c.since) ? c.since : null;
  return { slotId: since === null ? null : slotId, since };
}

function validateWorkout(raw: unknown): Workout | null {
  if (typeof raw !== "object" || raw === null) return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.id !== "string" || typeof w.weekId !== "string") return null;
  if (!Array.isArray(w.exercises)) return null;

  const exercises = w.exercises.filter(isSlotLike) as ExerciseSlot[];

  return {
    ...(w as unknown as Workout),
    exercises,
    // A stored session is by definition not finished, whatever the blob
    // claims, and a projected session's transient flag must not come back
    // to life and start suppressing writes.
    status: "planned",
    provisional: undefined,
  };
}

function isSlotLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === "string" && typeof s.typeId === "string";
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
