import { describe, it, expect } from "vitest";
import {
  startSession,
  pause,
  resume,
  togglePause,
  isPaused,
  elapsedMs,
  elapsedMinutes,
  expectedMinutes,
  sessionProgress,
  isSessionComplete,
  slotStatus,
  currentSlot,
  nextPendingIndex,
  logSlot,
  skipSlot,
  unfinishSlot,
  addSlot,
  updateSlot,
  removeSlot,
  reorderSlots,
  regroupSlots,
  focusSlot,
  updateWorkout,
  toCompletedWorkout,
  type ActiveSession,
} from "./activeSession";
import type { ExerciseSlot, Workout } from "../types";
import { workoutPlannedLoad } from "../analytics/load";

const T0 = Date.parse("2026-09-22T18:00:00.000Z");
const MIN = 60_000;

function slot(id: string, prescribed?: Record<string, unknown>): ExerciseSlot {
  return { id, typeId: `type-${id}`, prescribed: prescribed as ExerciseSlot["prescribed"] };
}

function workout(exercises: ExerciseSlot[], extra: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    status: "planned",
    date: null,
    weekId: "2026-W39",
    notes: "Hangboard + Bouldering",
    loadFactor: 0,
    exercises,
    ...extra,
  };
}

function threeSlotSession(): ActiveSession {
  return startSession(
    workout([slot("a", { duration: 20 }), slot("b", { duration: 40 }), slot("c", { duration: 15 })]),
    T0,
  );
}

describe("startSession", () => {
  it("starts running, at the first exercise, with a clean clock", () => {
    const s = threeSlotSession();
    expect(isPaused(s)).toBe(false);
    expect(s.currentIndex).toBe(0);
    expect(elapsedMs(s, T0)).toBe(0);
    expect(s.startedAt).toBe(new Date(T0).toISOString());
  });

  it("deep-copies the workout so the caller's object is never mutated", () => {
    const source = workout([slot("a", { duration: 20 })]);
    const s = logSlot(startSession(source, T0), "a", { duration: 25 });
    expect(source.exercises[0].logged).toBeUndefined();
    expect(s.workout.exercises[0].logged).toEqual({ duration: 25 });
  });

  it("records the source workout id when started from a planned session", () => {
    const s = startSession(workout([]), T0, { sourceWorkoutId: "planned-1" });
    expect(s.sourceWorkoutId).toBe("planned-1");
  });

  it("defaults sourceWorkoutId to null for a spontaneous session", () => {
    expect(startSession(workout([]), T0).sourceWorkoutId).toBeNull();
  });

  it("focuses the first unfinished exercise when resuming a partly logged workout", () => {
    const partly = workout([
      { ...slot("a"), logged: { duration: 20 } },
      { ...slot("b"), skipped: true },
      slot("c"),
    ]);
    expect(startSession(partly, T0).currentIndex).toBe(2);
  });

  it("falls back to index 0 when everything is already settled", () => {
    const done = workout([{ ...slot("a"), logged: { duration: 20 } }]);
    expect(startSession(done, T0).currentIndex).toBe(0);
  });
});

describe("the clock", () => {
  it("counts running time forward", () => {
    const s = threeSlotSession();
    expect(elapsedMinutes(s, T0 + 50 * MIN)).toBe(50);
  });

  it("stops counting while paused", () => {
    const s = pause(threeSlotSession(), T0 + 10 * MIN);
    expect(elapsedMinutes(s, T0 + 10 * MIN)).toBe(10);
    expect(elapsedMinutes(s, T0 + 90 * MIN)).toBe(10);
    expect(isPaused(s)).toBe(true);
  });

  it("resumes from where it stopped, excluding the paused stretch", () => {
    let s = pause(threeSlotSession(), T0 + 10 * MIN);
    s = resume(s, T0 + 40 * MIN);
    expect(elapsedMinutes(s, T0 + 45 * MIN)).toBe(15);
  });

  it("survives several pause/resume cycles", () => {
    let s = threeSlotSession();
    s = pause(s, T0 + 5 * MIN);
    s = resume(s, T0 + 15 * MIN);
    s = pause(s, T0 + 20 * MIN);
    s = resume(s, T0 + 60 * MIN);
    expect(elapsedMinutes(s, T0 + 70 * MIN)).toBe(20);
  });

  it("ignores a redundant pause or resume", () => {
    const running = threeSlotSession();
    expect(resume(running, T0 + MIN)).toBe(running);
    const paused = pause(running, T0 + 10 * MIN);
    expect(pause(paused, T0 + 20 * MIN)).toBe(paused);
    expect(elapsedMinutes(paused, T0 + 99 * MIN)).toBe(10);
  });

  it("toggles between the two", () => {
    let s = togglePause(threeSlotSession(), T0 + 10 * MIN);
    expect(isPaused(s)).toBe(true);
    s = togglePause(s, T0 + 20 * MIN);
    expect(isPaused(s)).toBe(false);
    expect(elapsedMinutes(s, T0 + 25 * MIN)).toBe(15);
  });

  it("never runs backwards if the clock jumps behind the session start", () => {
    const s = threeSlotSession();
    expect(elapsedMs(s, T0 - 60 * MIN)).toBe(0);
  });
});

describe("expectedMinutes", () => {
  it("sums the exercises when the session has no planned duration", () => {
    expect(expectedMinutes(threeSlotSession())).toBe(75);
  });

  it("uses the session's planned duration when it has one", () => {
    const s = startSession(workout([slot("a", { duration: 20 })], { plannedDuration: 100 }), T0);
    expect(expectedMinutes(s)).toBe(100);
  });
});

describe("progress", () => {
  it("counts nothing settled at the start", () => {
    expect(sessionProgress(threeSlotSession())).toEqual({ done: 0, skipped: 0, settled: 0, total: 3 });
  });

  it("counts a logged exercise as done and settled", () => {
    const s = logSlot(threeSlotSession(), "a", { duration: 22 });
    expect(sessionProgress(s)).toEqual({ done: 1, skipped: 0, settled: 1, total: 3 });
  });

  it("counts a skipped exercise as settled but not done", () => {
    const s = skipSlot(threeSlotSession(), "a");
    expect(sessionProgress(s)).toEqual({ done: 0, skipped: 1, settled: 1, total: 3 });
  });

  it("reports completion only once nothing is pending", () => {
    let s = threeSlotSession();
    expect(isSessionComplete(s)).toBe(false);
    s = logSlot(s, "a", {});
    s = skipSlot(s, "b");
    expect(isSessionComplete(s)).toBe(false);
    s = logSlot(s, "c", {});
    expect(isSessionComplete(s)).toBe(true);
  });

  it("does not call an empty session complete", () => {
    expect(isSessionComplete(startSession(workout([]), T0))).toBe(false);
  });
});

describe("linear progression", () => {
  it("advances to the next exercise when one is logged", () => {
    const s = logSlot(threeSlotSession(), "a", { duration: 22 });
    expect(s.currentIndex).toBe(1);
    expect(currentSlot(s)?.id).toBe("b");
  });

  it("advances past a skipped exercise too", () => {
    const s = skipSlot(threeSlotSession(), "a");
    expect(s.currentIndex).toBe(1);
  });

  it("wraps back to an earlier exercise left pending", () => {
    let s = threeSlotSession();
    s = focusSlot(s, 2);
    s = logSlot(s, "c", {});
    // Nothing after "c", so focus wraps to the first still-pending one.
    expect(currentSlot(s)?.id).toBe("a");
  });

  it("stays put when the last pending exercise is logged", () => {
    let s = threeSlotSession();
    s = logSlot(s, "a", {});
    s = logSlot(s, "b", {});
    const before = s.currentIndex;
    s = logSlot(s, "c", {});
    expect(s.currentIndex).toBe(before);
  });

  it("finds no pending index once everything is settled", () => {
    let s = threeSlotSession();
    s = logSlot(s, "a", {});
    s = logSlot(s, "b", {});
    s = logSlot(s, "c", {});
    expect(nextPendingIndex(s, 0)).toBe(-1);
  });

  it("lets you jump to any exercise", () => {
    const s = focusSlot(threeSlotSession(), 2);
    expect(currentSlot(s)?.id).toBe("c");
  });

  it("ignores an out-of-range jump rather than throwing", () => {
    const s = threeSlotSession();
    expect(focusSlot(s, 9)).toBe(s);
    expect(focusSlot(s, -1)).toBe(s);
  });
});

describe("logging, skipping and un-finishing", () => {
  it("writes only the logged bucket, never the plan", () => {
    const s = logSlot(threeSlotSession(), "a", { duration: 25 });
    expect(s.workout.exercises[0].logged).toEqual({ duration: 25 });
    expect(s.workout.exercises[0].prescribed).toEqual({ duration: 20 });
  });

  it("clears a skip when the same exercise is later logged", () => {
    let s = skipSlot(threeSlotSession(), "a");
    expect(slotStatus(s.workout.exercises[0])).toBe("skipped");
    s = logSlot(s, "a", { duration: 25 });
    expect(s.workout.exercises[0].skipped).toBeUndefined();
    expect(slotStatus(s.workout.exercises[0])).toBe("done");
  });

  it("clears a log when the same exercise is later skipped", () => {
    let s = logSlot(threeSlotSession(), "a", { duration: 25 });
    s = skipSlot(s, "a");
    expect(s.workout.exercises[0].logged).toBeUndefined();
    expect(slotStatus(s.workout.exercises[0])).toBe("skipped");
  });

  it("keeps the plan intact when skipping", () => {
    const s = skipSlot(threeSlotSession(), "a");
    expect(s.workout.exercises[0].prescribed).toEqual({ duration: 20 });
  });

  it("un-finishes back to pending and focuses the exercise", () => {
    let s = logSlot(threeSlotSession(), "a", { duration: 25 });
    expect(s.currentIndex).toBe(1);
    s = unfinishSlot(s, "a");
    expect(slotStatus(s.workout.exercises[0])).toBe("pending");
    expect(s.workout.exercises[0].logged).toBeUndefined();
    expect(s.currentIndex).toBe(0);
  });

  it("un-finishes a skipped exercise too", () => {
    let s = skipSlot(threeSlotSession(), "b");
    s = unfinishSlot(s, "b");
    expect(slotStatus(s.workout.exercises[1])).toBe("pending");
  });

  it("ignores an unknown slot id", () => {
    const s = threeSlotSession();
    expect(logSlot(s, "nope", {}).workout.exercises).toEqual(s.workout.exercises);
  });
});

describe("adding an exercise mid-session", () => {
  const added = { id: "x", typeId: "pullups", values: { sets: 3, reps: 8, duration: 10 } };

  it("lands already done, with what you did", () => {
    const s = addSlot(threeSlotSession(), added, "none");
    const slot = s.workout.exercises.at(-1)!;
    expect(slotStatus(slot)).toBe("done");
    expect(slot.logged).toEqual({ sets: 3, reps: 8, duration: 10 });
  });

  it("under 'none' carries no target, so it adds no planned load", () => {
    const s = addSlot(threeSlotSession(), added, "none");
    const slot = s.workout.exercises.at(-1)!;
    expect(slot.prescribed).toBeUndefined();
    // The three planned exercises' load is unchanged by the addition.
    expect(workoutPlannedLoad(s.workout.exercises)).toBe(
      workoutPlannedLoad(threeSlotSession().workout.exercises),
    );
  });

  it("under 'mirror' copies what you did into the plan, so it counts as planned", () => {
    const s = addSlot(threeSlotSession(), added, "mirror");
    const slot = s.workout.exercises.at(-1)!;
    expect(slot.prescribed).toEqual({ sets: 3, reps: 8, duration: 10 });
    expect(workoutPlannedLoad(s.workout.exercises)).toBeGreaterThan(
      workoutPlannedLoad(threeSlotSession().workout.exercises),
    );
  });

  it("as still-to-do it lands pending, right after the focused exercise", () => {
    const s = addSlot(threeSlotSession(), added, "mirror", { pending: true });
    expect(s.workout.exercises.map((e) => e.id)).toEqual(["a", "x", "b", "c"]);
    expect(slotStatus(s.workout.exercises[1])).toBe("pending");
    expect(s.workout.exercises[1].prescribed).toEqual({ sets: 3, reps: 8, duration: 10 });
    expect(s.currentIndex).toBe(0);
  });

  it("finishing the focused exercise moves on to the one added as next", () => {
    const s = logSlot(addSlot(threeSlotSession(), added, "mirror", { pending: true }), "a", { duration: 20 });
    expect(s.currentIndex).toBe(1);
  });

  it("as still-to-do it goes after a whole circuit, not into it", () => {
    const base = threeSlotSession();
    const grouped = {
      ...base,
      workout: { ...base.workout, exercises: base.workout.exercises.map((e, i) => (i < 2 ? { ...e, groupId: "g" } : e)) },
    };
    const s = addSlot(grouped, added, "mirror", { pending: true });
    expect(s.workout.exercises.map((e) => e.id)).toEqual(["a", "b", "x", "c"]);
  });

  it("with the session all done, the to-do one takes focus", () => {
    let s = threeSlotSession();
    for (const id of ["a", "b", "c"]) s = logSlot(s, id, {});
    s = addSlot(s, added, "mirror", { pending: true });
    expect(s.workout.exercises.at(-1)!.id).toBe("x");
    expect(s.currentIndex).toBe(3);
  });

  it("under 'none' a to-do exercise drops its target once logged, so it counts as extra", () => {
    const s = addSlot(threeSlotSession(), added, "none", { pending: true });
    const done = logSlot(s, "x", { sets: 4, reps: 8, duration: 10 });
    const slot = done.workout.exercises.find((e) => e.id === "x")!;
    expect(slot.prescribed).toBeUndefined();
    expect(slot.addedExtra).toBeUndefined();
    expect(slot.logged).toEqual({ sets: 4, reps: 8, duration: 10 });
  });

  it("under 'mirror' a to-do exercise keeps its target once logged", () => {
    const s = addSlot(threeSlotSession(), added, "mirror", { pending: true });
    const done = logSlot(s, "x", { sets: 4, reps: 8, duration: 10 });
    expect(done.workout.exercises.find((e) => e.id === "x")!.prescribed).toEqual({ sets: 3, reps: 8, duration: 10 });
  });

  it("mirrors by value, so editing the log afterwards does not rewrite the target", () => {
    const s = addSlot(threeSlotSession(), added, "mirror");
    const edited = logSlot(s, "x", { sets: 5, reps: 8, duration: 10 });
    expect(edited.workout.exercises.at(-1)!.prescribed).toEqual({ sets: 3, reps: 8, duration: 10 });
  });

  it("can be turned back into an upcoming target by un-finishing it", () => {
    let s = addSlot(threeSlotSession(), added, "none");
    s = unfinishSlot(s, "x");
    expect(slotStatus(s.workout.exercises.at(-1)!)).toBe("pending");
  });
});

describe("editing the session's exercise list", () => {
  it("updates a slot's type and chosen bucket in place", () => {
    const s = updateSlot(threeSlotSession(), "a", { typeId: "campus", values: { duration: 30 } }, "prescribed");
    expect(s.workout.exercises[0].typeId).toBe("campus");
    expect(s.workout.exercises[0].prescribed).toEqual({ duration: 30 });
  });

  it("removes a slot", () => {
    const s = removeSlot(threeSlotSession(), "b");
    expect(s.workout.exercises.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("clamps focus when removing the last exercise while it is current", () => {
    let s = focusSlot(threeSlotSession(), 2);
    s = removeSlot(s, "c");
    expect(s.currentIndex).toBe(1);
    expect(currentSlot(s)?.id).toBe("b");
  });

  it("keeps focus on the same exercise across a reorder", () => {
    let s = focusSlot(threeSlotSession(), 1); // "b"
    const [a, b, c] = s.workout.exercises;
    s = reorderSlots(s, [c, b, a]);
    expect(currentSlot(s)?.id).toBe("b");
    expect(s.currentIndex).toBe(1);
  });

  it("follows a focused exercise that a reorder moved to a different position", () => {
    let s = focusSlot(threeSlotSession(), 0); // "a"
    const [a, b, c] = s.workout.exercises;
    s = reorderSlots(s, [b, c, a]);
    expect(currentSlot(s)?.id).toBe("a");
    expect(s.currentIndex).toBe(2);
  });

  it("regroups slots without moving focus off the exercise it was on", () => {
    let s = focusSlot(threeSlotSession(), 2); // "c"
    const [a, b, c] = s.workout.exercises;
    const group = { id: "g", rounds: 2, transition: 15, roundRest: 60 };
    s = regroupSlots(s, { exercises: [{ ...b, groupId: "g" }, { ...c, groupId: "g" }, a], groups: [group] });
    expect(s.workout.groups).toEqual([group]);
    expect(currentSlot(s)?.id).toBe("c");
    s = regroupSlots(s, { exercises: s.workout.exercises.map(({ groupId: _g, ...rest }) => rest), groups: undefined });
    expect(s.workout.groups).toBeUndefined();
    expect(s.workout.exercises.some((e) => e.groupId)).toBe(false);
  });

  it("survives an empty exercise list without an out-of-range index", () => {
    const s = removeSlot(removeSlot(removeSlot(threeSlotSession(), "a"), "b"), "c");
    expect(s.workout.exercises).toEqual([]);
    expect(s.currentIndex).toBe(0);
    expect(currentSlot(s)).toBeUndefined();
  });

  it("edits workout-level fields", () => {
    const s = updateWorkout(threeSlotSession(), { notes: "Renamed", plannedDuration: 90 });
    expect(s.workout.notes).toBe("Renamed");
    expect(expectedMinutes(s)).toBe(90);
  });
});

describe("toCompletedWorkout", () => {
  it("marks the workout completed and dated, with the running time as actualDuration", () => {
    const s = logSlot(threeSlotSession(), "a", { duration: 22 });
    const finished = toCompletedWorkout(s, T0 + 63 * MIN);
    expect(finished.status).toBe("completed");
    expect(finished.date).toBe(new Date(T0 + 63 * MIN).toISOString());
    expect(finished.actualDuration).toBe(63);
  });

  it("excludes paused time from actualDuration", () => {
    let s = threeSlotSession();
    s = pause(s, T0 + 20 * MIN);
    s = resume(s, T0 + 80 * MIN);
    expect(toCompletedWorkout(s, T0 + 100 * MIN).actualDuration).toBe(40);
  });

  it("honours an edited duration over the measured one", () => {
    const s = threeSlotSession();
    expect(toCompletedWorkout(s, T0 + 200 * MIN, { actualDuration: 95 }).actualDuration).toBe(95);
  });

  it("leaves actualDuration unset for a zero-length session, so the estimate takes over", () => {
    const s = threeSlotSession();
    expect(toCompletedWorkout(s, T0).actualDuration).toBeUndefined();
  });

  it("keeps pending exercises rather than dropping them, so adherence stays honest", () => {
    const s = logSlot(threeSlotSession(), "a", { duration: 22 });
    const finished = toCompletedWorkout(s, T0 + 30 * MIN);
    expect(finished.exercises).toHaveLength(3);
    expect(finished.exercises[1].logged).toBeUndefined();
    expect(finished.exercises[1].prescribed).toEqual({ duration: 40 });
  });

  it("keeps a planned session's scheduled start time", () => {
    const s = startSession(workout([slot("a")], { startTime: "17:30" }), T0);
    expect(toCompletedWorkout(s, T0 + 60 * MIN).startTime).toBe("17:30");
  });

  it("fills in the actual start time for a session that had none", () => {
    const s = startSession(workout([slot("a")]), T0);
    const expected = new Date(T0);
    const hhmm = `${String(expected.getHours()).padStart(2, "0")}:${String(expected.getMinutes()).padStart(2, "0")}`;
    expect(toCompletedWorkout(s, T0 + 60 * MIN).startTime).toBe(hhmm);
  });

  it("does not mutate the session it was given", () => {
    const s = threeSlotSession();
    toCompletedWorkout(s, T0 + 60 * MIN);
    expect(s.workout.status).toBe("planned");
    expect(s.workout.date).toBeNull();
  });
});
