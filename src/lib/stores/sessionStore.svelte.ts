import type { ExerciseSlot, ExerciseValues, ParameterBlock, Workout } from '../types';
import type { AddedExerciseTarget } from '../preferences/migrate';
import {
  type ActiveSession,
  startSession,
  togglePause,
  pause,
  resume,
  isPaused,
  elapsedMs,
  elapsedMinutes,
  expectedMinutes,
  sessionProgress,
  isSessionComplete,
  currentSlot,
  logSlot,
  skipSlot,
  unfinishSlot,
  addSlot,
  updateSlot,
  removeSlot,
  reorderSlots,
  focusSlot,
  updateWorkout,
  toCompletedWorkout,
  syncSlotClock,
  slotElapsedMs,
} from '../session/activeSession';
import { ACTIVE_SESSION_KEY, serializeSession, parseStoredSession } from '../session/persistSession';

/**
 * The one running session, if there is one.
 *
 * **At most one session runs at a time**, enforced structurally: this is a
 * single nullable field, not a collection, so "two sessions at once" is
 * not a state the app can represent. `start()` refuses rather than
 * replacing, leaving it to the caller to finish or discard first.
 *
 * Reactive and persisted; all the actual behaviour lives in the pure
 * `lib/session/activeSession.ts`, which this delegates to and then writes
 * the result of. Keeping the logic out of here is what makes it testable
 * without a browser.
 */
export class SessionStore {
  /** `null` when nothing is running. */
  session = $state<ActiveSession | null>(null);

  /**
   * Whether the full-screen session modal is showing. Minimising the modal
   * leaves the session running and swaps it for the corner bubble, so this
   * is view state, not session state - it deliberately does **not**
   * persist: reopening the app lands on the normal screen with the
   * bubble showing, rather than trapping the user in the modal.
   */
  isModalOpen = $state(false);

  /**
   * Ticks while a session is running so every elapsed-time readout stays
   * reactive. One interval for the whole app, started only when a session
   * is actually running and torn down the moment it isn't - a timer that
   * keeps firing after the session ends is a battery cost for nothing.
   */
  now = $state(Date.now());
  #ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const stored = parseStoredSession(localStorage.getItem(ACTIVE_SESSION_KEY));
      // A restored session picks its exercise clock up where it left off
      // (the time the app was away counts, as it does for the session).
      this.session = stored ? syncSlotClock(stored, stored, Date.now()) : null;
    }
    this.#syncTicker();
  }

  // --- Derived readouts ---

  get isActive() {
    return this.session !== null;
  }

  get isPaused() {
    return this.session ? isPaused(this.session) : false;
  }

  /** Running time in ms, recomputed as `now` ticks. */
  get elapsedMs() {
    return this.session ? elapsedMs(this.session, this.now) : 0;
  }

  get elapsedMinutes() {
    return this.session ? elapsedMinutes(this.session, this.now) : 0;
  }

  /** What the session was expected to take - the denominator in "50/100 min". */
  get expectedMinutes() {
    return this.session ? expectedMinutes(this.session) : 0;
  }

  /** `{ done, skipped, settled, total }` - `settled/total` is the "3/5" readout. */
  get progress() {
    return this.session
      ? sessionProgress(this.session)
      : { done: 0, skipped: 0, settled: 0, total: 0 };
  }

  get isComplete() {
    return this.session ? isSessionComplete(this.session) : false;
  }

  get workout(): Workout | null {
    return this.session?.workout ?? null;
  }

  get exercises(): ExerciseSlot[] {
    return this.session?.workout.exercises ?? [];
  }

  get currentIndex() {
    return this.session?.currentIndex ?? 0;
  }

  /** Time spent on one exercise so far (ms), live - stops with the session pause. */
  slotElapsedMs(slotId: string): number {
    return this.session ? slotElapsedMs(this.session, slotId, this.now) : 0;
  }

  get currentSlot(): ExerciseSlot | undefined {
    return this.session ? currentSlot(this.session) : undefined;
  }

  /** True when this exact workout is the one currently running - drives "Resume" vs "Start" on a session row. */
  isRunning(workoutId: string): boolean {
    if (!this.session) return false;
    return this.session.sourceWorkoutId === workoutId || this.session.workout.id === workoutId;
  }

  // --- Lifecycle ---

  /**
   * Begins a session, unless one is already running.
   *
   * Returns `false` rather than replacing a running session: silently
   * throwing away an hour of logged work because a Start button was
   * tapped on a different day's session would be unrecoverable. The
   * caller surfaces the refusal (the Start buttons show "Resume" while a
   * session is live, so this is a backstop, not the normal path).
   */
  start(workout: Workout, options: { sourceWorkoutId?: string | null } = {}): boolean {
    if (this.session) return false;
    this.#commit(startSession(workout, Date.now(), options));
    this.isModalOpen = true;
    return true;
  }

  /** Ends the session with nothing saved. The source plan is left exactly as it was. */
  discard() {
    this.#commit(null);
    this.isModalOpen = false;
  }

  /**
   * The workout to persist, with the measured running time folded in
   * (or `actualDuration` overridden by an edit at the finish step).
   * Reading this does not end the session - the caller ends it with
   * `discard()` once the save has actually gone through, so a failed save
   * can't lose the session.
   */
  buildCompletedWorkout(overrides: { actualDuration?: number } = {}): Workout | null {
    return this.session ? toCompletedWorkout(this.session, Date.now(), overrides) : null;
  }

  togglePause() {
    this.#apply((s) => togglePause(s, Date.now()));
  }

  pause() {
    this.#apply((s) => pause(s, Date.now()));
  }

  resume() {
    this.#apply((s) => resume(s, Date.now()));
  }

  // --- Modal vs bubble ---

  openModal() {
    this.isModalOpen = true;
  }

  /** Minimises to the corner bubble. The session keeps running. */
  minimize() {
    this.isModalOpen = false;
  }

  // --- Editing ---

  logExercise(slotId: string, values: ExerciseValues) {
    this.#apply((s) => logSlot(s, slotId, values));
  }

  skipExercise(slotId: string) {
    this.#apply((s) => skipSlot(s, slotId));
  }

  unfinishExercise(slotId: string) {
    this.#apply((s) => unfinishSlot(s, slotId));
  }

  addExercise(
    slot: { id: string; typeId: string; categoryId?: string; activeParameters?: ParameterBlock[]; values: ExerciseValues },
    target: AddedExerciseTarget,
  ) {
    this.#apply((s) => addSlot(s, slot, target));
  }

  updateExercise(
    slotId: string,
    changes: { typeId: string; categoryId?: string; activeParameters?: ParameterBlock[]; values: ExerciseValues },
    bucket: 'prescribed' | 'logged',
  ) {
    this.#apply((s) => updateSlot(s, slotId, changes, bucket));
  }

  removeExercise(slotId: string) {
    this.#apply((s) => removeSlot(s, slotId));
  }

  reorderExercises(exercises: ExerciseSlot[]) {
    this.#apply((s) => reorderSlots(s, $state.snapshot(exercises) as ExerciseSlot[]));
  }

  focusExercise(index: number) {
    this.#apply((s) => focusSlot(s, index));
  }

  updateWorkout(changes: Partial<Workout>) {
    this.#apply((s) => updateWorkout(s, changes));
  }

  // --- Internals ---

  /** Runs a pure transition against the live session, if there is one. */
  #apply(fn: (session: ActiveSession) => ActiveSession) {
    if (!this.session) return;
    const before = $state.snapshot(this.session) as ActiveSession;
    this.#commit(syncSlotClock(before, fn(before), Date.now()));
  }

  /**
   * The single write path: every change to the session goes through here,
   * so persisting can't be forgotten at a call site and the ticker can't
   * be left running after the session ends.
   */
  #commit(session: ActiveSession | null) {
    this.session = session;
    this.#persist();
    this.#syncTicker();
  }

  #persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      if (this.session) {
        localStorage.setItem(ACTIVE_SESSION_KEY, serializeSession($state.snapshot(this.session) as ActiveSession));
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch {
      // A full or unavailable localStorage must not take the session down
      // with it - the in-memory session stays perfectly usable, it just
      // won't survive the app being killed. Same degrade-silently
      // discipline as the timer's vibrate/beep/wake-lock.
    }
  }

  /** Runs the 1s tick only while a session is actually running. */
  #syncTicker() {
    const shouldTick = this.session !== null && !isPaused(this.session);
    if (shouldTick && this.#ticker === null) {
      this.now = Date.now();
      this.#ticker = setInterval(() => { this.now = Date.now(); }, 1000);
    } else if (!shouldTick && this.#ticker !== null) {
      clearInterval(this.#ticker);
      this.#ticker = null;
      this.now = Date.now();
    }
  }
}
