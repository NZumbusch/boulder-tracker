import { describe, it, expect } from "vitest";
import {
  estimateExerciseDuration,
  estimateSlotDuration,
  estimateSessionDuration,
  sessionDuration,
  DEFAULT_EXERCISE_MINUTES,
  DEFAULT_SESSION_MINUTES,
} from "./sessionDuration";
import { repsPerSet } from "./sessionDuration";
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

describe("rest fields as real data uses them", () => {
  // An exercise type only offers the parameters it lists, and
  // `weighted-pullups` lists `timeOff` without `restTime` - so a rest
  // between *sets* lands in `timeOff` because there is nowhere else for it.
  const pullups: ExerciseValues = { sets: 4, reps: 6, timeOff: 180 };

  it("reads a rest as between-sets when reps have no duration", () => {
    // 3 rests of 180s between 4 sets = 540s -> 9 min. Read literally as a
    // between-reps rest it was 5 x 180s inside every set = 60 min.
    expect(estimateExerciseDuration(pullups)).toBe(9);
  });

  it("still reads it as between-reps when reps do have a duration", () => {
    // Max hangs: 7s on, 3s off between reps, 180s between sets.
    const maxHangs: ExerciseValues = { sets: 5, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 };
    expect(estimateExerciseDuration(maxHangs)).toBe(17);
  });

  it("prefers an explicit timeBetweenSets over reinterpreting timeOff", () => {
    const both: ExerciseValues = { sets: 3, reps: 4, timeOff: 10, timeBetweenSets: 60 };
    // No timeOn, so timeOff stays a between-reps rest only because an
    // explicit set rest already exists: 3 x (3 x 10) + 2 x 60 = 210s -> 4 min.
    expect(estimateExerciseDuration(both)).toBe(4);
  });
});

describe("per-set reps, as real exports record them", () => {
  it("treats an array as the set count and the reps in each", () => {
    // [6, 6, 5, 5, 4] is five sets, not the four that `sets` still claims.
    expect(repsPerSet({ sets: 4, reps: [6, 6, 5, 5, 4] } as unknown as ExerciseValues)).toEqual([6, 6, 5, 5, 4]);
  });

  it("spreads a plain number across the sets", () => {
    expect(repsPerSet({ sets: 3, reps: 5 })).toEqual([5, 5, 5]);
  });

  it("defaults to one set of one rep when nothing is given", () => {
    expect(repsPerSet({})).toEqual([1]);
  });

  it("drops junk entries and falls back if the array is unusable", () => {
    expect(repsPerSet({ sets: 2, reps: [5, null, "x", 3] } as unknown as ExerciseValues)).toEqual([5, 3]);
    expect(repsPerSet({ sets: 2, reps: [] } as unknown as ExerciseValues)).toEqual([1, 1]);
  });

  it("sums per-set reps rather than counting one rep per set", () => {
    // 5 sets totalling 28 reps at 3s each, 240s between sets:
    // 28 x 3 = 84s work + 4 x 240 = 960s rest -> 1044s -> 18 min
    const values = { reps: [7, 6, 6, 5, 4], timeOn: 3, timeBetweenSets: 240 } as unknown as ExerciseValues;
    expect(estimateExerciseDuration(values)).toBe(18);
  });
});
