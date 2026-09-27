import { describe, it, expect } from "vitest";
import {
  applyPlanBsToWeek,
  dayIndexOf,
  weekAndDayOf,
  occurrenceKeys,
  occurrencesTouchingWeek,
  planBSessionId,
  extendToDay,
  saveInPlanB,
  deleteInPlanB,
  revertInPlanB,
  setOccurrence,
  describeChanges,
  occurrenceDaysLabel,
  type PlanBContext,
} from "./planB";
import { effectiveWorkoutsForWeek, toStoredWorkout, type WeekProjectionContext } from "./weekProjection";
import type { PlanAlternative, TrainingBlock, Workout, WorkoutTemplate } from "../types";

const slot = (id: string) => ({ id, typeId: "t1", activeParameters: [], prescribed: { duration: 60 } });

const STRENGTH: WorkoutTemplate[] = [
  { id: "tpl-fingers", name: "Fingers", dayOfWeek: "Friday", exercises: [slot("s1")] },
  { id: "tpl-board", name: "Board", dayOfWeek: "Saturday", exercises: [slot("s2")] },
];
const POWER: WorkoutTemplate[] = [
  { id: "tpl-hangs", name: "Max hangs", dayOfWeek: "Monday", exercises: [slot("s3")] },
  { id: "tpl-campus", name: "Campus", dayOfWeek: "Wednesday", exercises: [slot("s4")] },
];
// A phase change between the two weeks of the stretch.
const BLOCKS: TrainingBlock[] = [
  { id: "b1", name: "Strength", phaseId: "strength", startWeekId: "2026-W43", endWeekId: "2026-W43" },
  { id: "b2", name: "Power", phaseId: "power", startWeekId: "2026-W44", endWeekId: "2026-W50" },
];

const OUTDOOR: WorkoutTemplate = { id: "tpl-out", name: "Outdoor bouldering", exercises: [slot("s9")] };

/** Sat W43 – Mon W44: outdoor instead of board on Saturday, no max hangs on Monday. */
function weekendPlanB(extra: Partial<PlanAlternative> = {}): PlanAlternative {
  return {
    id: "alt1",
    label: "Outdoor if dry",
    startWeekId: "2026-W43",
    startDay: "Saturday",
    days: 3,
    changes: [
      { id: "c1", offset: 0, replaces: { name: "Board" }, session: OUTDOOR },
      { id: "c2", offset: 2, replaces: { name: "Max hangs" } },
    ],
    ...extra,
  };
}

function setup(alternatives: PlanAlternative[], workouts: Workout[] = [], templates: Record<string, WorkoutTemplate[]> = { strength: STRENGTH, power: POWER }): PlanBContext {
  const proj: WeekProjectionContext = { workouts, trainingBlocks: BLOCKS, templates, weekOverrides: [] };
  return { alternatives, baseWeek: (weekId) => effectiveWorkoutsForWeek(proj, weekId), blockIdForWeek: () => "b-test" };
}

const names = (ws: Workout[]) => ws.map((w) => w.notes).sort();

describe("day math", () => {
  it("round-trips a week and weekday", () => {
    const d = dayIndexOf("2026-W43", "Saturday");
    expect(weekAndDayOf(d)).toEqual({ weekId: "2026-W43", day: "Saturday" });
    expect(weekAndDayOf(d + 2)).toEqual({ weekId: "2026-W44", day: "Monday" });
  });

  it("crosses a year boundary (2026 has 53 weeks)", () => {
    expect(weekAndDayOf(dayIndexOf("2026-W53", "Sunday") + 1)).toEqual({ weekId: "2027-W01", day: "Monday" });
  });
});

describe("applyPlanBsToWeek", () => {
  it("leaves a week without a Plan B untouched", () => {
    const ctx = setup([]);
    const r = applyPlanBsToWeek(ctx, "2026-W43");
    expect(names(r.shown)).toEqual(["Board", "Fingers"]);
    expect(r.active).toBe(r.shown);
  });

  it("shows both plans across a week and phase boundary, counting only the likely one (A by default)", () => {
    const ctx = setup([weekendPlanB()]);
    const w43 = applyPlanBsToWeek(ctx, "2026-W43");
    expect(names(w43.shown)).toEqual(["Board", "Fingers", "Outdoor bouldering"]);
    expect(names(w43.active)).toEqual(["Board", "Fingers"]);
    const outdoor = w43.shown.find((w) => w.notes === "Outdoor bouldering")!;
    expect(outdoor.dayOfWeek).toBe("Saturday");
    expect(outdoor.weekId).toBe("2026-W43");
    expect(outdoor.planB).toMatchObject({ side: "B", active: false, decided: false });
    expect(w43.shown.find((w) => w.notes === "Board")!.planB).toMatchObject({ side: "A", active: true });
    // Fingers (Friday) is outside the stretch: no tag.
    expect(w43.shown.find((w) => w.notes === "Fingers")!.planB).toBeUndefined();

    const w44 = applyPlanBsToWeek(ctx, "2026-W44");
    expect(names(w44.active)).toEqual(["Campus", "Max hangs"]);
    expect(w44.shown.find((w) => w.notes === "Max hangs")!.planB).toMatchObject({ side: "A", active: true });
  });

  it("counts Plan B instead when it is the likely one", () => {
    const ctx = setup([weekendPlanB({ likely: "B" })]);
    expect(names(applyPlanBsToWeek(ctx, "2026-W43").active)).toEqual(["Fingers", "Outdoor bouldering"]);
    expect(names(applyPlanBsToWeek(ctx, "2026-W44").active)).toEqual(["Campus"]);
  });

  it("a per-occurrence likely overrides the Plan B's own", () => {
    const ctx = setup([weekendPlanB({ occurrences: { "2026-W43": { likely: "B" } } })]);
    expect(names(applyPlanBsToWeek(ctx, "2026-W43").active)).toContain("Outdoor bouldering");
  });

  it("a hand-picked side decides it", () => {
    const ctx = setup([weekendPlanB({ likely: "B", occurrences: { "2026-W43": { chosen: "A" } } })]);
    const r = applyPlanBsToWeek(ctx, "2026-W43");
    expect(names(r.active)).toEqual(["Board", "Fingers"]);
    expect(r.shown.find((w) => w.notes === "Outdoor bouldering")!.planB).toMatchObject({ decided: true, active: false });
  });

  it("logging a Plan B session decides Plan B, and the logged one replaces the virtual one", () => {
    const id = planBSessionId("alt1", "2026-W43", "c1");
    const logged: Workout = { id, status: "completed", date: "2026-10-24T10:00:00Z", weekId: "2026-W43", dayOfWeek: "Saturday", notes: "Outdoor bouldering", loadFactor: 300, exercises: [] };
    // The week got materialised when the session was saved.
    const materialised = effectiveWorkoutsForWeek({ workouts: [], trainingBlocks: BLOCKS, templates: { strength: STRENGTH, power: POWER }, weekOverrides: [] }, "2026-W43").map(toStoredWorkout);
    const ctx = setup([weekendPlanB()], [...materialised, logged]);
    const r = applyPlanBsToWeek(ctx, "2026-W43");
    expect(r.shown.filter((w) => w.notes === "Outdoor bouldering")).toHaveLength(1);
    expect(r.shown.find((w) => w.id === id)!.status).toBe("completed");
    expect(names(r.active)).toEqual(["Fingers", "Outdoor bouldering"]);
    expect(r.occurrences[0].decided).toBe("B");
    // Monday's drop follows: Plan B was done.
    expect(names(applyPlanBsToWeek(ctx, "2026-W44").active)).toEqual(["Campus"]);
  });

  it("logging a session only Plan A has decides Plan A", () => {
    const board = effectiveWorkoutsForWeek({ workouts: [], trainingBlocks: BLOCKS, templates: { strength: STRENGTH, power: POWER }, weekOverrides: [] }, "2026-W43").map(toStoredWorkout);
    const done = board.map((w) => (w.notes === "Board" ? { ...w, status: "completed" as const } : w));
    const ctx = setup([weekendPlanB({ likely: "B" })], done);
    expect(applyPlanBsToWeek(ctx, "2026-W43").occurrences[0].decided).toBe("A");
    expect(names(applyPlanBsToWeek(ctx, "2026-W44").active)).toEqual(["Campus", "Max hangs"]);
  });

  it("keeps working when the phase under it changes, and flags a change whose Plan A session is gone", () => {
    const renamed = { strength: [STRENGTH[0], { ...STRENGTH[1], name: "Limit boulders" }], power: POWER };
    const ctx = setup([weekendPlanB()], [], renamed);
    const r = applyPlanBsToWeek(ctx, "2026-W43");
    expect(r.occurrences[0].stale).toEqual(['Sat: no "Board" in Plan A any more']);
    // Plan B still has its outdoor session; Plan A keeps its (renamed) session.
    expect(names(r.shown)).toEqual(["Fingers", "Limit boulders", "Outdoor bouldering"]);
    expect(r.shown.find((w) => w.notes === "Limit boulders")!.planB).toBeUndefined();
  });

  it("matches by id first, so a renamed stored session is still found", () => {
    const stored = effectiveWorkoutsForWeek({ workouts: [], trainingBlocks: BLOCKS, templates: { strength: STRENGTH, power: POWER }, weekOverrides: [] }, "2026-W43").map(toStoredWorkout);
    const board = stored.find((w) => w.notes === "Board")!;
    const renamed = stored.map((w) => (w.id === board.id ? { ...w, notes: "Board (short)" } : w));
    const alt = weekendPlanB({ changes: [{ id: "c1", offset: 0, replaces: { name: "Board", id: board.id }, session: OUTDOOR }] });
    const r = applyPlanBsToWeek(setup([alt], renamed), "2026-W43");
    expect(r.occurrences[0].stale).toEqual([]);
    expect(r.shown.find((w) => w.id === board.id)!.planB?.side).toBe("A");
  });
});

describe("repeating Plan Bs", () => {
  const weekly = () => weekendPlanB({ days: 1, changes: [{ id: "c1", offset: 0, replaces: { name: "Board" }, session: OUTDOOR }], startWeekId: "2026-W44", repeatUntilWeekId: "2026-W46" });
  const templates = { strength: STRENGTH, power: [...POWER, { id: "tpl-b2", name: "Board", dayOfWeek: "Saturday" as const, exercises: [slot("s5")] }] };

  it("applies every week in its range, each with its own ids and state", () => {
    const alt = weekly();
    expect(occurrenceKeys(alt)).toEqual(["2026-W44", "2026-W45", "2026-W46"]);
    const ctx = setup([alt], [], templates);
    for (const weekId of ["2026-W44", "2026-W45", "2026-W46"]) {
      const r = applyPlanBsToWeek(ctx, weekId);
      expect(r.shown.find((w) => w.notes === "Outdoor bouldering")!.id).toBe(planBSessionId("alt1", weekId, "c1"));
    }
    expect(applyPlanBsToWeek(ctx, "2026-W47").occurrences).toEqual([]);
  });

  it("a skipped week is left alone", () => {
    const alt = setOccurrence(weekly(), "2026-W45", { skipped: true });
    expect(occurrenceKeys(alt)).toEqual(["2026-W44", "2026-W46"]);
    expect(applyPlanBsToWeek(setup([alt], [], templates), "2026-W45").occurrences).toEqual([]);
  });

  it("finds occurrences that started in an earlier week", () => {
    expect(occurrencesTouchingWeek([weekendPlanB()], "2026-W44").map((o) => o.key)).toEqual(["2026-W43"]);
  });
});

describe("editing Plan B", () => {
  let n = 0;
  const newId = () => `new${++n}`;
  const w43 = () => applyPlanBsToWeek(setup([weekendPlanB()]), "2026-W43").shown;

  it("editing a shared session gives Plan B its own version", () => {
    const fingers = w43().find((w) => w.notes === "Fingers")!;
    // Friday is before the stretch: it grows backwards by one day.
    const r = saveInPlanB(weekendPlanB(), "2026-W43", { ...fingers, notes: "Easy fingers" }, fingers, newId)!;
    expect(r.alt.startDay).toBe("Friday");
    expect(r.alt.days).toBe(4);
    expect(r.alt.changes.map((c) => c.offset).sort()).toEqual([0, 1, 3]);
    const added = r.alt.changes.find((c) => c.session?.name === "Easy fingers")!;
    expect(added.replaces).toEqual({ name: "Fingers", id: fingers.id });
  });

  it("editing Plan B's own session updates it in place", () => {
    const outdoor = w43().find((w) => w.notes === "Outdoor bouldering")!;
    const r = saveInPlanB(weekendPlanB(), "2026-W43", { ...outdoor, notes: "Outdoor, Frankenjura" }, outdoor, newId)!;
    expect(r.alt.changes).toHaveLength(2);
    expect(r.alt.changes.find((c) => c.id === "c1")!.session!.name).toBe("Outdoor, Frankenjura");
  });

  it("refuses a day more than two weeks away", () => {
    const outdoor = w43().find((w) => w.notes === "Outdoor bouldering")!;
    expect(saveInPlanB(weekendPlanB(), "2026-W43", { ...outdoor, weekId: "2026-W46", dayOfWeek: "Monday" }, outdoor, newId)).toBeNull();
  });

  it("deleting Plan B's swap leaves a plain drop; deleting a shared session drops it from Plan B", () => {
    const outdoor = w43().find((w) => w.notes === "Outdoor bouldering")!;
    const dropped = deleteInPlanB(weekendPlanB(), "2026-W43", outdoor, newId);
    expect(dropped.changes.find((c) => c.id === "c1")).toEqual({ id: "c1", offset: 0, replaces: { name: "Board" } });

    const campus = applyPlanBsToWeek(setup([weekendPlanB()]), "2026-W44").shown.find((w) => w.notes === "Campus")!;
    const r = deleteInPlanB(weekendPlanB(), "2026-W43", campus, newId);
    expect(r.days).toBe(5);
    expect(r.changes.at(-1)).toMatchObject({ offset: 4, replaces: { name: "Campus", id: campus.id } });
  });

  it("revert takes a difference back out", () => {
    const outdoor = w43().find((w) => w.notes === "Outdoor bouldering")!;
    expect(revertInPlanB(weekendPlanB(), outdoor).changes.map((c) => c.id)).toEqual(["c2"]);
  });

  it("growing backwards across a week boundary moves repeat keys along", () => {
    const alt = weekendPlanB({ startDay: "Monday", startWeekId: "2026-W44", days: 1, changes: [], repeatUntilWeekId: "2026-W46", occurrences: { "2026-W45": { chosen: "B" } } });
    const r = extendToDay(alt, "2026-W45", dayIndexOf("2026-W44", "Sunday"))!;
    expect(r.key).toBe("2026-W44");
    expect(r.alt).toMatchObject({ startWeekId: "2026-W43", startDay: "Sunday", days: 2, repeatUntilWeekId: "2026-W45", occurrences: { "2026-W44": { chosen: "B" } } });
  });
});

describe("describing", () => {
  it("labels the days and lists the differences", () => {
    expect(occurrenceDaysLabel(weekendPlanB(), "2026-W43")).toBe("Sat–Mon");
    expect(describeChanges(weekendPlanB())).toEqual(["Sat: Outdoor bouldering instead of Board", "Mon: no Max hangs"]);
  });
});
