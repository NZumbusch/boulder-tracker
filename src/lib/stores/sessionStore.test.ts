import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionStore } from "./sessionStore.svelte";
import { ACTIVE_SESSION_KEY } from "../session/persistSession";
import type { ExerciseSlot, Workout } from "../types";

/**
 * Covers the reactive/persisted wrapper specifically - the parts that
 * `activeSession.test.ts` can't reach because they're about storage, the
 * one-session-at-a-time invariant, and the ticker's lifecycle.
 */

/** Minimal in-memory localStorage - the store only uses get/set/remove. */
function installLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

function slot(id: string): ExerciseSlot {
  return { id, typeId: `type-${id}`, prescribed: { duration: 20 } };
}

function workout(id = "w1", exercises = [slot("a"), slot("b")]): Workout {
  return {
    id,
    status: "planned",
    date: null,
    weekId: "2026-W39",
    notes: "Session",
    loadFactor: 0,
    exercises,
  };
}

let store: Map<string, string>;

beforeEach(() => {
  store = installLocalStorage();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the one-session-at-a-time invariant", () => {
  it("starts with no session", () => {
    const s = new SessionStore();
    expect(s.isActive).toBe(false);
    expect(s.session).toBeNull();
  });

  it("starts a session and opens the modal", () => {
    const s = new SessionStore();
    expect(s.start(workout())).toBe(true);
    expect(s.isActive).toBe(true);
    expect(s.isModalOpen).toBe(true);
  });

  it("refuses a second session rather than replacing the first", () => {
    const s = new SessionStore();
    s.start(workout("first"), { sourceWorkoutId: "first" });
    s.logExercise("a", { duration: 25 });

    expect(s.start(workout("second"))).toBe(false);
    expect(s.session!.workout.id).toBe("first");
    // The logged work is still there - this is the whole point of refusing.
    expect(s.session!.workout.exercises[0].logged).toEqual({ duration: 25 });
  });

  it("allows a new session once the previous one is discarded", () => {
    const s = new SessionStore();
    s.start(workout("first"));
    s.discard();
    expect(s.isActive).toBe(false);
    expect(s.start(workout("second"))).toBe(true);
    expect(s.session!.workout.id).toBe("second");
  });

  it("recognises the running session by its own id and by its source id", () => {
    const s = new SessionStore();
    s.start(workout("w1"), { sourceWorkoutId: "planned-7" });
    expect(s.isRunning("w1")).toBe(true);
    expect(s.isRunning("planned-7")).toBe(true);
    expect(s.isRunning("something-else")).toBe(false);
  });

  it("reports nothing as running when no session is active", () => {
    expect(new SessionStore().isRunning("w1")).toBe(false);
  });
});

describe("persistence", () => {
  it("writes the session to localStorage on start", () => {
    new SessionStore().start(workout());
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(true);
  });

  it("persists every edit, not just the start", () => {
    const s = new SessionStore();
    s.start(workout());
    s.logExercise("a", { duration: 31 });

    const stored = JSON.parse(store.get(ACTIVE_SESSION_KEY)!);
    expect(stored.workout.exercises[0].logged).toEqual({ duration: 31 });
  });

  it("restores a session a fresh store finds in storage", () => {
    const first = new SessionStore();
    first.start(workout("w1"), { sourceWorkoutId: "w1" });
    first.logExercise("a", { duration: 31 });
    first.skipExercise("b");

    const restored = new SessionStore();
    expect(restored.isActive).toBe(true);
    expect(restored.session!.workout.exercises[0].logged).toEqual({ duration: 31 });
    expect(restored.session!.workout.exercises[1].skipped).toBe(true);
    expect(restored.isRunning("w1")).toBe(true);
  });

  it("clears storage when the session is discarded", () => {
    const s = new SessionStore();
    s.start(workout());
    s.discard();
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(false);
    expect(new SessionStore().isActive).toBe(false);
  });

  it("does not restore the modal open - a restart lands on the normal screen", () => {
    new SessionStore().start(workout());
    expect(new SessionStore().isModalOpen).toBe(false);
  });

  it("starts clean rather than throwing when storage holds garbage", () => {
    store.set(ACTIVE_SESSION_KEY, "{not json");
    expect(() => new SessionStore()).not.toThrow();
    expect(new SessionStore().isActive).toBe(false);
  });

  it("keeps working when localStorage writes throw", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => {},
    });
    const s = new SessionStore();
    expect(() => s.start(workout())).not.toThrow();
    expect(s.isActive).toBe(true);
    expect(() => s.logExercise("a", { duration: 20 })).not.toThrow();
    expect(s.session!.workout.exercises[0].logged).toEqual({ duration: 20 });
  });
});

describe("derived readouts", () => {
  it("reports progress as exercises are settled", () => {
    const s = new SessionStore();
    s.start(workout());
    expect(s.progress).toEqual({ done: 0, skipped: 0, settled: 0, total: 2 });

    s.logExercise("a", { duration: 20 });
    expect(s.progress.settled).toBe(1);
    expect(s.isComplete).toBe(false);

    s.skipExercise("b");
    expect(s.progress).toEqual({ done: 1, skipped: 1, settled: 2, total: 2 });
    expect(s.isComplete).toBe(true);
  });

  it("reports zeroes with no session rather than throwing", () => {
    const s = new SessionStore();
    expect(s.progress).toEqual({ done: 0, skipped: 0, settled: 0, total: 0 });
    expect(s.elapsedMinutes).toBe(0);
    expect(s.expectedMinutes).toBe(0);
    expect(s.isComplete).toBe(false);
    expect(s.isPaused).toBe(false);
    expect(s.currentSlot).toBeUndefined();
    expect(s.workout).toBeNull();
    expect(s.exercises).toEqual([]);
  });

  it("estimates the expected length from the exercises", () => {
    const s = new SessionStore();
    s.start(workout());
    expect(s.expectedMinutes).toBe(40);
  });

  it("advances the current slot as exercises are logged", () => {
    const s = new SessionStore();
    s.start(workout());
    expect(s.currentSlot?.id).toBe("a");
    s.logExercise("a", { duration: 20 });
    expect(s.currentSlot?.id).toBe("b");
  });
});

describe("the clock and its ticker", () => {
  it("counts elapsed time as the ticker fires", () => {
    const s = new SessionStore();
    s.start(workout());
    expect(s.elapsedMinutes).toBe(0);

    vi.advanceTimersByTime(5 * 60_000);
    expect(s.elapsedMinutes).toBe(5);
  });

  it("stops counting while paused and resumes cleanly", () => {
    const s = new SessionStore();
    s.start(workout());

    vi.advanceTimersByTime(10 * 60_000);
    s.togglePause();
    expect(s.isPaused).toBe(true);

    vi.advanceTimersByTime(60 * 60_000);
    expect(s.elapsedMinutes).toBe(10);

    s.togglePause();
    vi.advanceTimersByTime(5 * 60_000);
    expect(s.elapsedMinutes).toBe(15);
  });

  it("runs no timer while paused, and none at all once the session ends", () => {
    const s = new SessionStore();
    s.start(workout());
    expect(vi.getTimerCount()).toBe(1);

    s.pause();
    expect(vi.getTimerCount()).toBe(0);

    s.resume();
    expect(vi.getTimerCount()).toBe(1);

    s.discard();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resumes a restored session's clock from where it left off", () => {
    const first = new SessionStore();
    first.start(workout());
    vi.advanceTimersByTime(12 * 60_000);
    first.pause();

    const restored = new SessionStore();
    expect(restored.elapsedMinutes).toBe(12);
    expect(restored.isPaused).toBe(true);
  });
});

describe("finishing", () => {
  it("builds a completed workout without ending the session", () => {
    const s = new SessionStore();
    s.start(workout());
    s.logExercise("a", { duration: 25 });
    vi.advanceTimersByTime(47 * 60_000);

    const finished = s.buildCompletedWorkout()!;
    expect(finished.status).toBe("completed");
    expect(finished.actualDuration).toBe(47);
    expect(finished.exercises[0].logged).toEqual({ duration: 25 });

    // Still running - the caller clears it only once the save succeeded.
    expect(s.isActive).toBe(true);
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(true);
  });

  it("honours an overridden duration", () => {
    const s = new SessionStore();
    s.start(workout());
    vi.advanceTimersByTime(200 * 60_000);
    expect(s.buildCompletedWorkout({ actualDuration: 90 })!.actualDuration).toBe(90);
  });

  it("returns null with no session running", () => {
    expect(new SessionStore().buildCompletedWorkout()).toBeNull();
  });
});

describe("modal vs bubble", () => {
  it("minimising leaves the session running", () => {
    const s = new SessionStore();
    s.start(workout());
    s.minimize();
    expect(s.isModalOpen).toBe(false);
    expect(s.isActive).toBe(true);
    vi.advanceTimersByTime(3 * 60_000);
    expect(s.elapsedMinutes).toBe(3);
  });

  it("reopens to the same session", () => {
    const s = new SessionStore();
    s.start(workout());
    s.minimize();
    s.openModal();
    expect(s.isModalOpen).toBe(true);
    expect(s.session!.workout.id).toBe("w1");
  });
});

describe("editing through the store", () => {
  it("adds an exercise as extra under the default preference", () => {
    const s = new SessionStore();
    s.start(workout());
    s.addExercise({ id: "x", typeId: "pullups", values: { sets: 3, reps: 8 } }, "none");

    const added = s.exercises.at(-1)!;
    expect(added.logged).toEqual({ sets: 3, reps: 8 });
    expect(added.prescribed).toBeUndefined();
  });

  it("adds an exercise as planned under 'mirror'", () => {
    const s = new SessionStore();
    s.start(workout());
    s.addExercise({ id: "x", typeId: "pullups", values: { sets: 3, reps: 8 } }, "mirror");
    expect(s.exercises.at(-1)!.prescribed).toEqual({ sets: 3, reps: 8 });
  });

  it("removes and reorders exercises", () => {
    const s = new SessionStore();
    s.start(workout("w1", [slot("a"), slot("b"), slot("c")]));

    s.reorderExercises([s.exercises[2], s.exercises[0], s.exercises[1]]);
    expect(s.exercises.map((e) => e.id)).toEqual(["c", "a", "b"]);

    s.removeExercise("a");
    expect(s.exercises.map((e) => e.id)).toEqual(["c", "b"]);
  });

  it("un-finishes an exercise back to pending and focuses it", () => {
    const s = new SessionStore();
    s.start(workout());
    s.logExercise("a", { duration: 25 });
    expect(s.currentSlot?.id).toBe("b");

    s.unfinishExercise("a");
    expect(s.exercises[0].logged).toBeUndefined();
    expect(s.currentSlot?.id).toBe("a");
  });

  it("ignores edits when no session is running", () => {
    const s = new SessionStore();
    expect(() => {
      s.logExercise("a", {});
      s.skipExercise("a");
      s.removeExercise("a");
      s.focusExercise(2);
      s.updateWorkout({ notes: "x" });
      s.togglePause();
    }).not.toThrow();
    expect(s.isActive).toBe(false);
  });
});
