import { describe, it, expect } from "vitest";
import {
  projectWeekWorkouts,
  effectiveWorkoutsForWeek,
  projectedSessionsInThePast,
  weekDiffersFromPhase,
  weekDismissalId,
  provisionalWorkoutId,
  templatesForWeek,
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

// 2026-W21 is 18-24 May.
const BLOCK: TrainingBlock = { id: "blk1", name: "Capacity", phaseId: "phase1", startDate: "2026-05-11", endDate: "2026-06-07" };

function ctx(overrides: Partial<WeekProjectionContext> = {}): WeekProjectionContext {
  return { workouts: [], trainingBlocks: [BLOCK], templates: { phase1: TEMPLATES }, dismissed: [], ...overrides };
}

function stored(weekId: string, id = "w1", status: Workout["status"] = "planned"): Workout {
  return { id, status, date: null, weekId, loadFactor: 0, exercises: [] };
}

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

  it("names a session by its week and template, with no position in the list - reordering templates can't change it", () => {
    expect(projectWeekWorkouts(ctx(), "2026-W21").map((w) => w.id)).toEqual(["prov:2026-W21:tpl-board", "prov:2026-W21:tpl-endurance"]);
    const reversed = projectWeekWorkouts(ctx({ templates: { phase1: [...TEMPLATES].reverse() } }), "2026-W21");
    expect(reversed.map((w) => w.id).sort()).toEqual(["prov:2026-W21:tpl-board", "prov:2026-W21:tpl-endurance"]);
  });

  it("is stable: projecting the same week twice gives the same ids, slots included", () => {
    const first = projectWeekWorkouts(ctx(), "2026-W21");
    const second = projectWeekWorkouts(ctx(), "2026-W21");
    expect(second.map((w) => w.id)).toEqual(first.map((w) => w.id));
    expect(second.flatMap((w) => w.exercises.map((e) => e.id))).toEqual(first.flatMap((w) => w.exercises.map((e) => e.id)));
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

  it("is empty for a week no phase covers, or a phase with no templates", () => {
    expect(projectWeekWorkouts(ctx(), "2026-W30")).toEqual([]);
    expect(projectWeekWorkouts(ctx({ templates: {} }), "2026-W21")).toEqual([]);
    expect(projectWeekWorkouts(ctx({ templates: { phase1: [] } }), "2026-W21")).toEqual([]);
  });
});

describe("saving sessions one by one", () => {
  it("a stored session with a template's id stands in for it; the rest keep following the phase", () => {
    const board = { ...stored("2026-W21", provisionalWorkoutId("2026-W21", "tpl-board")), dayOfWeek: "Tuesday" as const };
    const effective = effectiveWorkoutsForWeek(ctx({ workouts: [board] }), "2026-W21");
    expect(effective.map((w) => w.id)).toEqual([board.id, "prov:2026-W21:tpl-endurance"]);
    expect(effective[0].dayOfWeek).toBe("Tuesday");
    expect(effective[0].provisional).toBeUndefined();
    expect(effective[1].provisional).toBe(true);
  });

  it("a logged session is the same: it takes its template's place", () => {
    const done = stored("2026-W21", provisionalWorkoutId("2026-W21", "tpl-endurance"), "completed");
    expect(projectWeekWorkouts(ctx({ workouts: [done] }), "2026-W21").map((w) => w.id)).toEqual(["prov:2026-W21:tpl-board"]);
  });

  it("a session of your own (any other id) is simply added; nothing else in the week changes", () => {
    const effective = effectiveWorkoutsForWeek(ctx({ workouts: [stored("2026-W21", "mine")] }), "2026-W21");
    expect(effective.map((w) => w.id)).toEqual(["mine", "prov:2026-W21:tpl-board", "prov:2026-W21:tpl-endurance"]);
  });

  it("a deleted session stays gone, the others stay", () => {
    const dismissed = [{ id: provisionalWorkoutId("2026-W21", "tpl-board"), weekId: "2026-W21" }];
    expect(projectWeekWorkouts(ctx({ dismissed }), "2026-W21").map((w) => w.id)).toEqual(["prov:2026-W21:tpl-endurance"]);
    expect(projectWeekWorkouts(ctx({ dismissed }), "2026-W22")).toHaveLength(2); // another week is untouched
  });

  it("a whole-week dismissal (cleared, or planned by hand) stops everything, whatever the phase", () => {
    const dismissed = [{ id: weekDismissalId("2026-W21"), weekId: "2026-W21" }];
    expect(projectWeekWorkouts(ctx({ dismissed }), "2026-W21")).toEqual([]);
    expect(projectWeekWorkouts(ctx({ dismissed }), "2026-W22")).toHaveLength(2);
    expect(effectiveWorkoutsForWeek(ctx({ dismissed, workouts: [stored("2026-W21")] }), "2026-W21").map((w) => w.id)).toEqual(["w1"]);
  });

  it("a week saved before sessions were saved one by one (every projection dismissed) shows exactly what is stored", () => {
    const legacy = ctx({ workouts: [stored("2026-W20"), stored("2026-W20", "w2")], dismissed: [{ id: weekDismissalId("2026-W20"), weekId: "2026-W20" }] });
    expect(effectiveWorkoutsForWeek(legacy, "2026-W20")).toHaveLength(2);
  });

  it("knows when a week differs from its phase", () => {
    expect(weekDiffersFromPhase(ctx(), "2026-W21")).toBe(false);
    expect(weekDiffersFromPhase(ctx({ workouts: [stored("2026-W21")] }), "2026-W21")).toBe(true);
    expect(weekDiffersFromPhase(ctx({ workouts: [stored("2026-W21", "d", "completed")] }), "2026-W21")).toBe(false);
    expect(weekDiffersFromPhase(ctx({ dismissed: [{ id: "prov:2026-W21:tpl-board", weekId: "2026-W21" }] }), "2026-W21")).toBe(true);
    expect(weekDiffersFromPhase(ctx({ dismissed: [{ id: "prov:2026-W22:tpl-board", weekId: "2026-W22" }] }), "2026-W21")).toBe(false);
  });
});

describe("a week split between phases", () => {
  // Power Mon-Wed (11-13 May is W20; use W21: 18-24 May): Power 18-20 May, Deload 21-24 May.
  const power: WorkoutTemplate[] = [
    { id: "p-mon", name: "Power Mon", dayOfWeek: "Monday", exercises: [] },
    { id: "p-thu", name: "Power Thu", dayOfWeek: "Thursday", exercises: [] },
    { id: "p-float", name: "Power float", exercises: [] },
  ];
  const deload: WorkoutTemplate[] = [
    { id: "d-tue", name: "Deload Tue", dayOfWeek: "Tuesday", exercises: [] },
    { id: "d-fri", name: "Deload Fri", dayOfWeek: "Friday", exercises: [] },
    { id: "d-float", name: "Deload float", exercises: [] },
  ];
  const split = (over: Partial<WeekProjectionContext> = {}) =>
    ctx({
      trainingBlocks: [
        { id: "pow", name: "Power", phaseId: "power", startDate: "2026-05-04", endDate: "2026-05-20" },
        { id: "del", name: "Deload", phaseId: "deload", startDate: "2026-05-21", endDate: "2026-05-31" },
      ],
      templates: { power, deload },
      ...over,
    });

  it("gives each day's sessions from the phase that has that day", () => {
    const names = projectWeekWorkouts(split(), "2026-W21").map((w) => w.notes);
    expect(names).toContain("Power Mon"); // Monday is Power's
    expect(names).not.toContain("Deload Tue"); // Tuesday is still Power's
    expect(names).not.toContain("Power Thu"); // Thursday is Deload's
    expect(names).toContain("Deload Fri");
  });

  it("gives a session with no day once, from the phase that has most of the week", () => {
    const names = projectWeekWorkouts(split(), "2026-W21").map((w) => w.notes);
    expect(names).toContain("Deload float"); // 4 days of Deload against 3 of Power
    expect(names).not.toContain("Power float");
  });

  it("tags each session with its own phase", () => {
    const byName = Object.fromEntries(projectWeekWorkouts(split(), "2026-W21").map((w) => [w.notes, w.blockId]));
    expect(byName).toMatchObject({ "Power Mon": "pow", "Deload Fri": "del", "Deload float": "del" });
  });

  it("templatesForWeek lists them with their block", () => {
    expect(templatesForWeek(split(), "2026-W21").map((t) => `${t.template.id}:${t.block.id}`)).toEqual(["p-mon:pow", "d-fri:del", "d-float:del"]);
  });

  it("a template id in two blocks of one phase counts once", () => {
    const twice = ctx({
      trainingBlocks: [
        { id: "a", name: "A", phaseId: "phase1", startDate: "2026-05-18", endDate: "2026-05-19" },
        { id: "b", name: "B", phaseId: "phase1", startDate: "2026-05-21", endDate: "2026-05-24" },
      ],
    });
    const ids = projectWeekWorkouts(twice, "2026-W21").map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("toStoredWorkout", () => {
  it("strips the transient provisional flag so it is never persisted, keeping the id", () => {
    const [projected] = projectWeekWorkouts(ctx(), "2026-W21");
    const saved = toStoredWorkout(projected);
    expect("provisional" in saved).toBe(false);
    expect(saved.id).toBe(projected.id);
    expect(saved.notes).toBe(projected.notes);
  });
});

describe("coveredWeekIds", () => {
  it("expands each block's range and deduplicates overlaps", () => {
    expect(coveredWeekIds([BLOCK, { ...BLOCK, id: "blk2", startDate: "2026-05-25", endDate: "2026-06-14" }])).toEqual(["2026-W20", "2026-W21", "2026-W22", "2026-W23", "2026-W24"]);
  });
  it("returns nothing for no blocks", () => {
    expect(coveredWeekIds([])).toEqual([]);
  });
});

describe("projectedSessionsInThePast", () => {
  // 2026-W22 is 25-31 May; Wednesday 27 May is index 2.
  it("takes every session of a finished week, oldest week first", () => {
    const ids = projectedSessionsInThePast(ctx(), "2026-05-27").map((w) => w.id);
    expect(ids.slice(0, 4)).toEqual(["prov:2026-W20:tpl-board", "prov:2026-W20:tpl-endurance", "prov:2026-W21:tpl-board", "prov:2026-W21:tpl-endurance"]);
  });

  it("takes this week's sessions on days before today, not today's or later", () => {
    const thisWeek = projectedSessionsInThePast(ctx(), "2026-05-27").filter((w) => w.weekId === "2026-W22").map((w) => w.id);
    expect(thisWeek).toEqual(["prov:2026-W22:tpl-board"]); // Monday; Thursday is still to come
    expect(projectedSessionsInThePast(ctx(), "2026-05-25").filter((w) => w.weekId === "2026-W22")).toEqual([]); // Monday itself is not past
    expect(projectedSessionsInThePast(ctx(), "2026-05-28").filter((w) => w.weekId === "2026-W22").map((w) => w.id)).toEqual(["prov:2026-W22:tpl-board"]);
    expect(projectedSessionsInThePast(ctx(), "2026-05-29").filter((w) => w.weekId === "2026-W22")).toHaveLength(2);
  });

  it("leaves a session with no day alone until its week is over", () => {
    const floating = ctx({ templates: { phase1: [{ id: "f", name: "Float", exercises: [] }] } });
    expect(projectedSessionsInThePast(floating, "2026-05-31").filter((w) => w.weekId === "2026-W22")).toEqual([]);
    expect(projectedSessionsInThePast(floating, "2026-06-01").filter((w) => w.weekId === "2026-W22")).toHaveLength(1);
  });

  it("skips what is already stored or dismissed, and future weeks", () => {
    const context = ctx({
      workouts: [stored("2026-W20", provisionalWorkoutId("2026-W20", "tpl-board"))],
      dismissed: [{ id: weekDismissalId("2026-W21"), weekId: "2026-W21" }],
    });
    const ids = projectedSessionsInThePast(context, "2026-05-27").map((w) => w.id);
    expect(ids).toContain("prov:2026-W20:tpl-endurance");
    expect(ids).not.toContain("prov:2026-W20:tpl-board");
    expect(ids.some((id) => id.startsWith("prov:2026-W21"))).toBe(false);
    expect(ids.some((id) => id.startsWith("prov:2026-W23"))).toBe(false);
  });

  it("returns nothing when there are no blocks", () => {
    expect(projectedSessionsInThePast(ctx({ trainingBlocks: [] }), "2026-07-01")).toEqual([]);
  });
});
