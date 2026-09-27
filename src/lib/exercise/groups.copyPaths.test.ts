import { describe, expect, it } from "vitest";
import type { ExerciseGroup, Workout, WorkoutTemplate } from "../types";
import { generateWorkoutsFromTemplate } from "../planning/generateWorkoutsFromTemplate";
import { copySessionsToWeek } from "../planning/copyWeek";
import { toStoredWorkout } from "../planning/weekProjection";
import { templateFromWorkout } from "../planning/planB";
import { workoutPlannedLoad } from "../analytics/load";

/**
 * Every place that copies a session's exercises must copy its groups too -
 * otherwise the circuit quietly turns back into plain exercises.
 */

const group: ExerciseGroup = { id: "g", name: "Core", rounds: 3, transition: 15, roundRest: 60 };
const exercises = [
  { id: "a", typeId: "t", prescribed: { timeOn: 60 }, groupId: "g" },
  { id: "b", typeId: "t", prescribed: { reps: 12 }, groupId: "g" },
];

describe("copy paths carry groups", () => {
  it("template -> workout, with load timed by the group", () => {
    const template: WorkoutTemplate = { id: "t1", name: "Core", exercises, groups: [group] };
    const [w] = generateWorkoutsFromTemplate("2026-W40", [template]);
    expect(w.groups).toEqual([group]);
    expect(w.groups![0]).not.toBe(group);
    expect(w.exercises.map((e) => e.groupId)).toEqual(["g", "g"]);
    expect(w.plannedLoad).toBe(workoutPlannedLoad(exercises, [group]));
  });

  it("copy week", () => {
    const source: Workout = { id: "w", status: "completed", date: "2026-09-21", weekId: "2026-W39", loadFactor: 10, exercises, groups: [group] };
    const [copy] = copySessionsToWeek([source], "2026-W40", undefined);
    expect(copy.groups).toEqual([group]);
    expect(copy.exercises.map((e) => e.groupId)).toEqual(["g", "g"]);
  });

  it("Plan B session from a workout", () => {
    const source: Workout = { id: "w", status: "planned", date: null, weekId: "2026-W40", loadFactor: 0, exercises, groups: [group] };
    expect(templateFromWorkout(source, "x").groups).toEqual([group]);
  });

  it("storage tidies grouping on the way in", () => {
    const stray: Workout = {
      id: "w", status: "planned", date: null, weekId: "2026-W40", loadFactor: 0,
      exercises: [{ id: "a", typeId: "t", groupId: "gone" }],
      groups: [],
    };
    const stored = toStoredWorkout(stray);
    expect(stored.exercises[0].groupId).toBeUndefined();
    expect("groups" in stored).toBe(false);
  });
});
