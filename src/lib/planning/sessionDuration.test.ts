import { describe, it, expect } from "vitest";
import {
  estimateExerciseDuration,
  estimateSlotDuration,
  estimateSessionDuration,
  sessionDuration,
  DEFAULT_EXERCISE_MINUTES,
  DEFAULT_SESSION_MINUTES,
} from "./sessionDuration";
import type { ExerciseSlot, ExerciseValues, Workout } from "../types";

function slot(id: string, prescribed?: ExerciseValues, logged?: ExerciseValues): ExerciseSlot {
  return { id, typeId: "t1", prescribed, logged };
}

function workout(exercises: ExerciseSlot[], extra: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    status: "planned",
    date: null,
    weekId: "2026-W20",
    loadFactor: 0,
    exercises,
    ...extra,
  };
}

describe("estimateExerciseDuration", () => {
  it("returns an explicit duration unchanged", () => {
    expect(estimateExerciseDuration({ duration: 45 })).toBe(45);
  });

  it("prefers an explicit duration over a derivable set structure", () => {
    expect(estimateExerciseDuration({ duration: 45, sets: 5, reps: 6, timeOn: 7, timeBetweenSets: 180 })).toBe(45);
  });

  it("derives from sets/reps/timeOn, excluding rest after the last rep and last set", () => {
    // 5 sets x 6 reps x 7s on, 3s off between reps, 180s between sets.
    // per set = 6*7 + 5*3 = 57s; total = 5*57 + 4*180 = 285 + 720 = 1005s -> 17 min
    expect(estimateExerciseDuration({ sets: 5, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 })).toBe(17);
  });

  it("handles a single set with no inter-set rest applied", () => {
    // 1 set x 10 reps x 30s on, 30s off = 10*30 + 9*30 = 570s -> 10 min (ceil of 9.5)
    expect(estimateExerciseDuration({ sets: 1, reps: 10, timeOn: 30, timeOff: 30, timeBetweenSets: 600 })).toBe(10);
  });

  it("counts inter-set rest for a sets-only exercise with no per-rep timing", () => {
    // reps defaults to 1, timeOn 0 -> only the 3 rests between 4 sets = 540s -> 9 min
    expect(estimateExerciseDuration({ sets: 4, timeBetweenSets: 180 })).toBe(9);
  });

  it("rounds a sub-minute derivation up to one minute rather than zero", () => {
    expect(estimateExerciseDuration({ sets: 1, reps: 2, timeOn: 10 })).toBe(1);
  });

  it("returns undefined when nothing can be derived", () => {
    expect(estimateExerciseDuration({})).toBeUndefined();
    expect(estimateExerciseDuration({ sets: 3, reps: 5 })).toBeUndefined();
    expect(estimateExerciseDuration({ minGrade: "6A", maxGrade: "7A" })).toBeUndefined();
  });

  it("treats a zero or negative duration as absent rather than as an answer", () => {
    expect(estimateExerciseDuration({ duration: 0 })).toBeUndefined();
    expect(estimateExerciseDuration({ duration: -30 })).toBeUndefined();
    expect(estimateExerciseDuration({ duration: 0, sets: 2, timeBetweenSets: 60 })).toBe(1);
  });

  it("survives non-numeric junk without producing NaN", () => {
    expect(estimateExerciseDuration({ duration: NaN })).toBeUndefined();
    expect(estimateExerciseDuration({ duration: undefined, sets: NaN, reps: 4, timeOn: 30 })).toBe(2);
  });
});

describe("estimateSlotDuration", () => {
  it("reads the log when present, the plan otherwise", () => {
    expect(estimateSlotDuration(slot("a", { duration: 30 }, { duration: 42 }))).toBe(42);
    expect(estimateSlotDuration(slot("a", { duration: 30 }))).toBe(30);
  });
});

describe("estimateSessionDuration", () => {
  it("uses plannedDuration when set, even against a longer exercise sum", () => {
    const w = workout([slot("a", { duration: 60 }), slot("b", { duration: 60 })], { plannedDuration: 90 });
    expect(estimateSessionDuration(w)).toBe(90);
  });

  it("sums the exercises when there is no plannedDuration", () => {
    expect(estimateSessionDuration(workout([slot("a", { duration: 20 }), slot("b", { duration: 35 })]))).toBe(55);
  });

  it("derives an exercise with no duration from its set structure rather than defaulting", () => {
    // 20 + (4 sets x 1 rep x 0s on + 3 x 180s) = 20 + 9 = 29
    const w = workout([slot("a", { duration: 20 }), slot("b", { sets: 4, timeBetweenSets: 180 })]);
    expect(estimateSessionDuration(w)).toBe(29);
  });

  it("falls back to the per-exercise default only when an exercise offers nothing", () => {
    const w = workout([slot("a", { duration: 20 }), slot("b", { minGrade: "6A" })]);
    expect(estimateSessionDuration(w)).toBe(20 + DEFAULT_EXERCISE_MINUTES);
  });

  it("falls back to the session default for an empty session", () => {
    expect(estimateSessionDuration(workout([]))).toBe(DEFAULT_SESSION_MINUTES);
  });

  it("ignores a zero or negative plannedDuration", () => {
    expect(estimateSessionDuration(workout([slot("a", { duration: 25 })], { plannedDuration: 0 }))).toBe(25);
  });
});

describe("sessionDuration", () => {
  it("uses the recorded actualDuration above everything else", () => {
    const w = workout([slot("a", undefined, { duration: 20 })], { actualDuration: 73, plannedDuration: 90 });
    expect(sessionDuration(w)).toBe(73);
  });

  it("sums the logged exercises when there is no actualDuration", () => {
    const w = workout(
      [slot("a", { duration: 30 }, { duration: 25 }), slot("b", { duration: 30 }, { duration: 40 })],
      { plannedDuration: 60 },
    );
    expect(sessionDuration(w)).toBe(65);
  });

  it("excludes skipped exercises from the actual total", () => {
    const skipped: ExerciseSlot = { ...slot("b", { duration: 30 }), skipped: true };
    const w = workout([slot("a", undefined, { duration: 25 }), skipped]);
    expect(sessionDuration(w)).toBe(25);
  });

  it("falls back to the estimate when nothing was logged with a duration", () => {
    const w = workout([slot("a", { minGrade: "6A" })], { plannedDuration: 80 });
    expect(sessionDuration(w)).toBe(80);
  });

  it("never reports zero for a session whose only exercise was skipped", () => {
    const skipped: ExerciseSlot = { ...slot("a", { duration: 30 }), skipped: true };
    expect(sessionDuration(workout([skipped], { plannedDuration: 45 }))).toBe(45);
  });
});
