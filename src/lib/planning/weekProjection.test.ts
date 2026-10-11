import { describe, it, expect } from "vitest";
import {
  isWeekProvisional,
  projectWeekWorkouts,
  effectiveWorkoutsForWeek,
  provisionalPastWeeks,
  coveredWeekIds,
  toStoredWorkout,
  isProvisionalId,
  type WeekProjectionContext,
} from "./weekProjection";
import type { TrainingBlock, Workout, WorkoutTemplate } from "../types";

const TEMPLATES: WorkoutTemplate[] = [
  {
    id: "tpl-board",
    name: "Board Power",
    dayOfWeek: "Monday",
    startTime: "18:00",
    plannedDuration: 90,
    exercises: [{ id: "slot-a", typeId: "t1", activeParameters: [], prescribed: { duration: 30 } }],
  },
  {
    id: "tpl-endurance",
    name: "Endurance",
    dayOfWeek: "Thursday",
    exercises: [{ id: "slot-b", typeId: "t2", activeParameters: [], prescribed: { duration: 60 } }],
  },
];

const BLOCK: TrainingBlock = {
  id: "blk1",
  name: "Capacity",
  phaseId: "phase1",
  startWeekId: "2026-W20",
  endWeekId: "2026-W23",
};

function ctx(overrides: Partial<WeekProjectionContext> = {}): WeekProjectionContext {
  return {
    workouts: [],
    trainingBlocks: [BLOCK],
    templates: { phase1: TEMPLATES },
    weekOverrides: [],
    ...overrides,
  };
}

function storedWorkout(weekId: string, id = "w1"): Workout {
  return { id, status: "planned", date: null, weekId, loadFactor: 0, exercises: [] };
}

describe("isWeekProvisional", () => {
  it("is true for a week a phase covers that has nothing stored", () => {
    expect(isWeekProvisional(ctx(), "2026-W21")).toBe(true);
  });

  it("is false for a week outside every block", () => {
    expect(isWeekProvisional(ctx(), "2026-W30")).toBe(false);
  });

  it("is false once the week has any stored workout", () => {
    expect(isWeekProvisional(ctx({ workouts: [storedWorkout("2026-W21")] }), "2026-W21")).toBe(false);
  });

  it("is false when the user has hand-edited the week, even with nothing stored", () => {
    // Deleting the last session in a week leaves it empty *and* customized -
    // it must stay empty rather than springing back from the templates.
    const context = ctx({ weekOverrides: [{ weekId: "2026-W21", customized: true }] });
    expect(isWeekProvisional(context, "2026-W21")).toBe(false);
  });

  it("is false when the covering phase has no templates", () => {
    expect(isWeekProvisional(ctx({ templates: {} }), "2026-W21")).toBe(false);
    expect(isWeekProvisional(ctx({ templates: { phase1: [] } }), "2026-W21")).toBe(false);
  });

  it("never treats an existing hard-planned week as provisional (no migration needed)", () => {
    const legacy = ctx({ workouts: [storedWorkout("2026-W20"), storedWorkout("2026-W20", "w2")] });
    expect(isWeekProvisional(legacy, "2026-W20")).toBe(false);
    expect(effectiveWorkoutsForWeek(legacy, "2026-W20")).toHaveLength(2);
  });
});

describe("projectWeekWorkouts", () => {
  it("projects one session per template, carrying day, time and duration", () => {
    const projected = projectWeekWorkouts(ctx(), "2026-W21");
    expect(projected).toHaveLength(2);
    expect(projected[0].notes).toBe("Board Power");
    expect(projected[0].dayOfWeek).toBe("Monday");
    expect(projected[0].startTime).toBe("18:00");
    expect(projected[0].plannedDuration).toBe(90);
    expect(projected[0].weekId).toBe("2026-W21");
  });

  it("tags every projected session provisional and links it to its block", () => {
    for (const w of projectWeekWorkouts(ctx(), "2026-W21")) {
      expect(w.provisional).toBe(true);
      expect(w.blockId).toBe("blk1");
      expect(isProvisionalId(w.id)).toBe(true);
    }
  });

  it("is stable: projecting the same week twice gives the same ids", () => {
    const first = projectWeekWorkouts(ctx(), "2026-W21");
    const second = projectWeekWorkouts(ctx(), "2026-W21");
    expect(second.map((w) => w.id)).toEqual(first.map((w) => w.id));
    expect(second.flatMap((w) => w.exercises.map((e) => e.id)))
      .toEqual(first.flatMap((w) => w.exercises.map((e) => e.id)));
  });

  it("gives different weeks of the same phase distinct ids", () => {
    const w21 = projectWeekWorkouts(ctx(), "2026-W21").map((w) => w.id);
    const w22 = projectWeekWorkouts(ctx(), "2026-W22").map((w) => w.id);
    expect(w21.some((id) => w22.includes(id))).toBe(false);
  });

  it("carries the prescribed exercise values through", () => {
    const [board] = projectWeekWorkouts(ctx(), "2026-W21");
    expect(board.exercises[0].prescribed).toEqual({ duration: 30 });
    expect(board.plannedLoad).toBeGreaterThan(0);
  });

  it("returns nothing for a week that is not provisional", () => {
    expect(projectWeekWorkouts(ctx({ workouts: [storedWorkout("2026-W21")] }), "2026-W21")).toEqual([]);
  });
});

describe("effectiveWorkoutsForWeek", () => {
  it("shows projections while provisional", () => {
    expect(effectiveWorkoutsForWeek(ctx(), "2026-W21")).toHaveLength(2);
  });

  it("shows only stored workouts once the week is materialised, never both", () => {
    const context = ctx({ workouts: [storedWorkout("2026-W21")] });
    const effective = effectiveWorkoutsForWeek(context, "2026-W21");
    expect(effective).toHaveLength(1);
    expect(effective[0].provisional).toBeUndefined();
  });

  it("ignores other weeks' workouts", () => {
    const context = ctx({ workouts: [storedWorkout("2026-W22")] });
    expect(effectiveWorkoutsForWeek(context, "2026-W22")).toHaveLength(1);
    expect(effectiveWorkoutsForWeek(context, "2026-W21")).toHaveLength(2);
  });
});

describe("toStoredWorkout", () => {
  it("strips the transient provisional flag so it is never persisted", () => {
    const [projected] = projectWeekWorkouts(ctx(), "2026-W21");
    const stored = toStoredWorkout(projected);
    expect(stored.provisional).toBeUndefined();
    expect("provisional" in stored).toBe(false);
    expect(stored.id).toBe(projected.id);
    expect(stored.notes).toBe(projected.notes);
  });
});

describe("coveredWeekIds", () => {
  it("expands each block's range and deduplicates overlaps", () => {
    const ids = coveredWeekIds([
      BLOCK,
      { ...BLOCK, id: "blk2", startWeekId: "2026-W22", endWeekId: "2026-W24" },
    ]);
    expect(ids).toEqual(["2026-W20", "2026-W21", "2026-W22", "2026-W23", "2026-W24"]);
  });

  it("returns nothing for no blocks", () => {
    expect(coveredWeekIds([])).toEqual([]);
  });
});

describe("provisionalPastWeeks", () => {
  it("returns the finished provisional weeks, oldest first", () => {
    expect(provisionalPastWeeks(ctx(), "2026-W22")).toEqual(["2026-W20", "2026-W21"]);
  });

  it("leaves the current week alone - it is still in progress", () => {
    expect(provisionalPastWeeks(ctx(), "2026-W22")).not.toContain("2026-W22");
  });

  it("leaves future weeks alone", () => {
    expect(provisionalPastWeeks(ctx(), "2026-W22")).not.toContain("2026-W23");
  });

  it("skips past weeks that are already materialised or customized", () => {
    const context = ctx({
      workouts: [storedWorkout("2026-W20")],
      weekOverrides: [{ weekId: "2026-W21", customized: true }],
    });
    expect(provisionalPastWeeks(context, "2026-W22")).toEqual([]);
  });

  it("returns nothing when there are no blocks at all", () => {
    expect(provisionalPastWeeks(ctx({ trainingBlocks: [] }), "2026-W30")).toEqual([]);
  });
});
