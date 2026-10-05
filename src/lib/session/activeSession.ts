import type { ExerciseGroup, ExerciseSlot, ExerciseValues, ParameterBlock, Workout } from "../types";
import type { AddedExerciseTarget } from "../preferences/migrate";
import { estimateSessionDuration } from "../planning/sessionDuration";

/**
 * A training session that is happening *right now*.
 *
 * Pure data and pure functions over it - no `$state`, no storage, no
 * clock of its own (every time-dependent function takes `now`), so all of
 * this is directly testable. `SessionStore` is the reactive, persisted
 * wrapper; this module is the behaviour.
 *
 * The session holds its own working copy of the workout rather than
 * mutating the stored one. Nothing reaches the workout table until the
 * session is finished, so abandoning a session leaves the plan exactly as
 * it was, and a half-done session can never be mistaken for a completed
 * one by analytics.
 *
 * **Invariant: at most one of these exists at a time.** It's enforced by
 * `SessionStore` holding a single nullable field rather than a collection -
 * there is deliberately no "list of active sessions" anywhere to get out
 * of sync.
 */
export interface ActiveSession {
  /** The live working copy. Only written to storage when the session finishes. */
  workout: Workout;
  /** Wall-clock start, ISO - what the session *began* at, independent of pauses. */
  startedAt: string;
  /** Running time banked from previous unpaused stretches, in ms. */
  accumulatedMs: number;
  /** Epoch ms the current running stretch began, or `null` while paused. */
  runningSince: number | null;
  /** Which exercise is in focus. Clamped to the exercise list by every function here. */
  currentIndex: number;
  /**
   * The stored planned workout this was started from, if any. Kept so
   * finishing updates that row in place (rather than creating a duplicate
   * beside the plan), and so discarding can leave it untouched and planned.
   * `null` for a session started from scratch.
   */
  sourceWorkoutId: string | null;
  /**
   * Time spent on each exercise, banked when the user moves off it, keyed by slot
   * id. Only counts while the session is running, so a session pause stops
   * it too. See `syncSlotClock`.
   */
  slotMs?: Record<string, number>;
  /** The exercise currently being timed and since when (epoch ms); both null while paused or when nothing is pending. */
  slotClock?: { slotId: string | null; since: number | null };
}

/** Where a slot stands in a running session. */
export type SlotStatus = "done" | "skipped" | "pending";

export interface SessionProgress {
  /** Slots with a `logged` block - actually performed. */
  done: number;
  /** Slots explicitly passed over. */
  skipped: number;
  /** done + skipped - everything that no longer needs doing. This is the "3" in "3/5". */
  settled: number;
  total: number;
}

// --- Reading a session -------------------------------------------------

export function slotStatus(slot: ExerciseSlot): SlotStatus {
  if (slot.skipped) return "skipped";
  return slot.logged !== undefined ? "done" : "pending";
}

/**
 * Progress through the session. `settled` drives the "3/5" readout
 * because a skipped exercise is resolved - it is not still waiting for
 * the user - while `done` stays available for anything that cares only about
 * work actually performed.
 */
export function sessionProgress(session: ActiveSession): SessionProgress {
  const exercises = session.workout.exercises ?? [];
  let done = 0;
  let skipped = 0;
  for (const slot of exercises) {
    const status = slotStatus(slot);
    if (status === "done") done++;
    else if (status === "skipped") skipped++;
  }
  return { done, skipped, settled: done + skipped, total: exercises.length };
}

/** True once nothing is left pending (and there was something to do in the first place). */
export function isSessionComplete(session: ActiveSession): boolean {
  const { settled, total } = sessionProgress(session);
  return total > 0 && settled === total;
}

export function isPaused(session: ActiveSession): boolean {
  return session.runningSince === null;
}

/** Accumulated *running* time in ms - paused stretches never count toward it. */
export function elapsedMs(session: ActiveSession, now: number): number {
  const live = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince);
  return session.accumulatedMs + live;
}

/** `elapsedMs` in whole minutes, rounded - the unit `Workout.actualDuration` is in. */
export function elapsedMinutes(session: ActiveSession, now: number): number {
  return Math.round(elapsedMs(session, now) / 60_000);
}

/** How long an exercise has been worked on so far, in ms - banked time plus the current stretch. */
export function slotElapsedMs(session: ActiveSession, slotId: string, now: number): number {
  const banked = session.slotMs?.[slotId] ?? 0;
  const clock = session.slotClock;
  const live = clock && clock.slotId === slotId && clock.since !== null ? Math.max(0, now - clock.since) : 0;
  return banked + live;
}

/**
 * Keeps the per-exercise clock in step with the session after any change:
 * banks the time of whichever exercise was being timed, then starts timing
 * whichever is current now - but only while the session runs and that
 * exercise is still pending. Applied after every session change in one
 * place (the store), so pausing, resuming, finishing, skipping, jumping to
 * another exercise and reopening one all come out right without each of
 * those functions knowing about it.
 */
export function syncSlotClock(before: ActiveSession, after: ActiveSession, now: number): ActiveSession {
  const slotMs = { ...(after.slotMs ?? before.slotMs ?? {}) };
  const clock = before.slotClock;
  if (clock?.slotId && clock.since !== null) {
    slotMs[clock.slotId] = (slotMs[clock.slotId] ?? 0) + Math.max(0, now - clock.since);
  }
  const current = currentSlot(after);
  const timing = after.runningSince !== null && current !== undefined && slotStatus(current) === "pending";
  return {
    ...after,
    slotMs,
    slotClock: { slotId: timing ? current!.id : null, since: timing ? now : null },
  };
}

/** What the session was expected to take, for the "50/100 min" readout. */
export function expectedMinutes(session: ActiveSession): number {
  return estimateSessionDuration(session.workout);
}

/** The slot in focus, or `undefined` for an empty session. */
export function currentSlot(session: ActiveSession): ExerciseSlot | undefined {
  return session.workout.exercises?.[session.currentIndex];
}

/**
 * The next slot still needing attention at or after `from`, wrapping
 * around to catch anything skipped over earlier in the list. `-1` when
 * everything is settled.
 */
export function nextPendingIndex(session: ActiveSession, from: number): number {
  const exercises = session.workout.exercises ?? [];
  if (exercises.length === 0) return -1;
  for (let offset = 0; offset < exercises.length; offset++) {
    const index = (from + offset) % exercises.length;
    if (slotStatus(exercises[index]) === "pending") return index;
  }
  return -1;
}

// --- Starting, pausing, finishing --------------------------------------

/**
 * Begins a session from a workout - a planned one, or a freshly built
 * empty one for a spontaneous session.
 *
 * The workout is deep-copied, so the caller's object (a store row, a
 * projected provisional session) is never mutated by what happens next.
 * Focus starts on the first slot that still needs doing, which matters
 * when re-starting a session whose exercises were already partly logged.
 */
export function startSession(
  workout: Workout,
  now: number,
  options: { sourceWorkoutId?: string | null } = {},
): ActiveSession {
  const copy = deepCopy(workout);
  const session: ActiveSession = {
    workout: copy,
    startedAt: new Date(now).toISOString(),
    accumulatedMs: 0,
    runningSince: now,
    currentIndex: 0,
    sourceWorkoutId: options.sourceWorkoutId ?? null,
  };
  const firstPending = nextPendingIndex(session, 0);
  session.currentIndex = firstPending === -1 ? 0 : firstPending;
  return syncSlotClock(session, session, now);
}

/** Banks the current running stretch and stops the clock. No-op if already paused. */
export function pause(session: ActiveSession, now: number): ActiveSession {
  if (session.runningSince === null) return session;
  return {
    ...session,
    accumulatedMs: elapsedMs(session, now),
    runningSince: null,
  };
}

/** Restarts the clock. No-op if already running. */
export function resume(session: ActiveSession, now: number): ActiveSession {
  if (session.runningSince !== null) return session;
  return { ...session, runningSince: now };
}

export function togglePause(session: ActiveSession, now: number): ActiveSession {
  return isPaused(session) ? resume(session, now) : pause(session, now);
}

/**
 * The workout to persist when the session ends.
 *
 * Pending slots are kept as-is rather than dropped: stopping early means
 * "save what I did", and an unlogged slot with its `prescribed` intact is
 * exactly how adherence records "3 of 5 logged". Dropping them would
 * silently rewrite the plan to match what happened.
 *
 * `startTime` is filled from the actual start only when the workout had
 * none - a planned session keeps the time it was scheduled for, so the
 * plan stays comparable against what happened.
 */
export function toCompletedWorkout(
  session: ActiveSession,
  now: number,
  overrides: { actualDuration?: number } = {},
): Workout {
  const minutes = overrides.actualDuration ?? elapsedMinutes(session, now);
  const startedAt = new Date(session.startedAt);
  return {
    ...deepCopy(session.workout),
    status: "completed",
    date: new Date(now).toISOString(),
    startTime: session.workout.startTime || toHHmm(startedAt),
    actualDuration: minutes > 0 ? minutes : undefined,
  };
}

// --- Editing the session's exercises ------------------------------------

/** Replaces a slot's `logged` block and moves focus to whatever is still pending. */
export function logSlot(session: ActiveSession, slotId: string, values: ExerciseValues): ActiveSession {
  const next = mapSlot(session, slotId, (slot) => {
    const { skipped: _skipped, ...rest } = slot;
    return { ...rest, logged: { ...values } };
  });
  return advanceFrom(next, slotId);
}

/** Marks a slot deliberately not done, keeping its plan, and moves on. */
export function skipSlot(session: ActiveSession, slotId: string): ActiveSession {
  const next = mapSlot(session, slotId, (slot) => {
    const { logged: _logged, ...rest } = slot;
    return { ...rest, skipped: true as const };
  });
  return advanceFrom(next, slotId);
}

/** Puts a logged or skipped slot back to pending and focuses it, for fixing a number mid-session. */
export function unfinishSlot(session: ActiveSession, slotId: string): ActiveSession {
  // Reopened: its clock carries on from the duration logged for it
  // (which may be a corrected number), not from zero.
  const loggedMinutes = Number(session.workout.exercises.find((s) => s.id === slotId)?.logged?.duration);
  const withTime = Number.isFinite(loggedMinutes) && loggedMinutes > 0
    ? { ...session, slotMs: { ...(session.slotMs ?? {}), [slotId]: loggedMinutes * 60_000 } }
    : session;
  const next = mapSlot(withTime, slotId, (slot) => {
    const { logged: _logged, skipped: _skipped, ...rest } = slot;
    return rest;
  });
  const index = next.workout.exercises.findIndex((s) => s.id === slotId);
  return index === -1 ? next : { ...next, currentIndex: index };
}

/**
 * Appends an exercise the user did that wasn't in the plan.
 *
 * It lands **done**, not pending: adding something mid-session is how the user
 * record the extra set they threw in, so the values entered are what was
 * done. Un-finish it if it was meant as an upcoming target instead.
 *
 * `target` decides whether it also counts as *planned*. Under "none" (the
 * default) `prescribed` is left unset, so `workoutPlannedLoad` excludes it
 * and the work lands as load on top of the plan rather than inside it -
 * an honest account of something that was never planned. Under "mirror"
 * the same values are copied into `prescribed`, so the session still
 * reports full adherence.
 */
export function addSlot(
  session: ActiveSession,
  slot: { id: string; typeId: string; categoryId?: string; activeParameters?: ParameterBlock[]; values: ExerciseValues },
  target: AddedExerciseTarget,
): ActiveSession {
  const added: ExerciseSlot = {
    id: slot.id,
    typeId: slot.typeId,
    categoryId: slot.categoryId,
    activeParameters: slot.activeParameters,
    logged: { ...slot.values },
    prescribed: target === "mirror" ? { ...slot.values } : undefined,
  };
  return withExercises(session, [...session.workout.exercises, added]);
}

/** Edits a slot's plan/type in place - the tucked-away "edit session" path, not the finish path. */
export function updateSlot(
  session: ActiveSession,
  slotId: string,
  changes: { typeId: string; categoryId?: string; activeParameters?: ParameterBlock[]; values: ExerciseValues },
  bucket: "prescribed" | "logged",
): ActiveSession {
  return mapSlot(session, slotId, (slot) => ({
    ...slot,
    typeId: changes.typeId,
    categoryId: changes.categoryId,
    activeParameters: changes.activeParameters,
    [bucket]: { ...changes.values },
  }));
}

/** Drops a slot, keeping focus on a sensible neighbour rather than jumping to the top. */
export function removeSlot(session: ActiveSession, slotId: string): ActiveSession {
  const exercises = session.workout.exercises.filter((s) => s.id !== slotId);
  return withExercises(session, exercises);
}

/**
 * Applies a reordered exercise list (drag and drop).
 *
 * Focus follows the *slot*, not the position: reordering the list while
 * exercise 3 is in focus must not silently make a different exercise the
 * current one.
 */
export function reorderSlots(session: ActiveSession, exercises: ExerciseSlot[]): ActiveSession {
  const focused = currentSlot(session);
  const next = withExercises(session, exercises);
  if (!focused) return next;
  const index = exercises.findIndex((s) => s.id === focused.id);
  return index === -1 ? next : { ...next, currentIndex: index };
}

/**
 * Applies a grouping change (make / dissolve a circuit, take a member out):
 * the new exercise list and groups together. Focus stays on the same slot.
 */
export function regroupSlots(session: ActiveSession, next: { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] }): ActiveSession {
  const focused = currentSlot(session);
  const moved = withExercises(session, next.exercises);
  const grouped = { ...moved, workout: { ...moved.workout, groups: next.groups } };
  if (!focused) return grouped;
  const index = next.exercises.findIndex((s) => s.id === focused.id);
  return index === -1 ? grouped : { ...grouped, currentIndex: index };
}

/** Moves focus, ignoring an out-of-range index rather than throwing. */
export function focusSlot(session: ActiveSession, index: number): ActiveSession {
  const exercises = session.workout.exercises ?? [];
  if (index < 0 || index >= exercises.length) return session;
  return { ...session, currentIndex: index };
}

/** Applies an edit to the session's workout-level fields (name, notes, planned duration). */
export function updateWorkout(session: ActiveSession, changes: Partial<Workout>): ActiveSession {
  return { ...session, workout: { ...session.workout, ...changes } };
}

// --- Internals ----------------------------------------------------------

function mapSlot(
  session: ActiveSession,
  slotId: string,
  fn: (slot: ExerciseSlot) => ExerciseSlot,
): ActiveSession {
  const exercises = session.workout.exercises.map((slot) => (slot.id === slotId ? fn(slot) : slot));
  return { ...session, workout: { ...session.workout, exercises } };
}

/** Replaces the exercise list and re-clamps focus, so `currentIndex` can never point past the end. */
function withExercises(session: ActiveSession, exercises: ExerciseSlot[]): ActiveSession {
  const currentIndex = exercises.length === 0 ? 0 : Math.min(session.currentIndex, exercises.length - 1);
  return { ...session, workout: { ...session.workout, exercises }, currentIndex };
}

/** After settling `slotId`, focus the next thing that still needs doing (staying put if nothing does). */
function advanceFrom(session: ActiveSession, slotId: string): ActiveSession {
  const index = session.workout.exercises.findIndex((s) => s.id === slotId);
  const searchFrom = index === -1 ? session.currentIndex : index + 1;
  const next = nextPendingIndex(session, searchFrom);
  return next === -1 ? session : { ...session, currentIndex: next };
}

function toHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * JSON round-trip rather than `structuredClone`: the callers hand this
 * Svelte `$state` proxies, which `structuredClone` refuses outright but
 * JSON reads straight through - the same discipline, and for the same
 * reason, as `storage/persistence.ts`'s `toPlain`.
 */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
