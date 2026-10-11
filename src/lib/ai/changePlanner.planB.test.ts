import { describe, it, expect } from "vitest";
import type { PlanAlternative, WorkoutTemplate } from "../types";
import { validateChangeSet } from "./changeSet";
import { planChanges, planWithSelection, allItemIds, type PlannerState } from "./changePlanner";
import { applyPlanBsToWeek } from "../planning/planB";
import { effectiveWorkoutsForWeek } from "../planning/weekProjection";

let n = 0;
const ids = () => `id${++n}`;

function state(planAlternatives: PlanAlternative[] = []): PlannerState {
  const capacity: WorkoutTemplate[] = [
    { id: "t-board", name: "Board", dayOfWeek: "Monday", exercises: [{ id: "s1", typeId: "hb", prescribed: { sets: 5 } }] },
    { id: "t-volume", name: "Volume", dayOfWeek: "Thursday", exercises: [{ id: "s2", typeId: "lb", prescribed: { duration: 60 } }] },
  ];
  return {
    exerciseTypes: [
      { id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets"] },
      { id: "lb", name: "Limit Bouldering", category: "Power", parameters: ["duration"] },
    ],
    analyticsCategories: [{ id: "c1", name: "Fingers", color: "x" }],
    phaseDefs: [{ id: "p-cap", name: "Capacity", order: 1 }],
    templates: { "p-cap": capacity },
    trainingBlocks: [{ id: "b-cap", name: "Capacity", phaseId: "p-cap", startWeekId: "2026-W40", endWeekId: "2026-W50" }],
    workouts: [],
    weekOverrides: [],
    weekNotes: [],
    planAlternatives,
    currentWeekId: "2026-W40",
  };
}

function plan(doc: unknown, s: PlannerState = state(), selected?: Set<string>) {
  const v = validateChangeSet(doc);
  if (!v.valid) throw new Error(JSON.stringify(v.issues));
  return { set: v.data!, ...planChanges(v.data!, s, selected, ids) };
}

/** One document: a new phase, weeks following it, and a Plan B across the phase change. */
const DOC = {
  phases: [{ action: "add", name: "Power", sessions: [
    { name: "Max hangs", dayOfWeek: "Monday", exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 6 } }] },
    { name: "Limit", dayOfWeek: "Wednesday", exercises: [{ exerciseTypeName: "Limit Bouldering", values: { duration: 45 } }] },
  ] }],
  weeks: [{ from: "2026-W44", to: "2026-W46", phase: "Power" }],
  planB: [{
    start: { week: "2026-W43", day: "Thursday" },
    end: { week: "2026-W44", day: "Monday" },
    label: "Outdoor if dry",
    outdoor: "B",
    changes: [
      { week: "2026-W43", sessionChanges: [{ action: "edit", match: { dayOfWeek: "Thursday" }, set: { name: "Outdoor bouldering" }, exercises: [{ exerciseTypeName: "Limit Bouldering", values: { duration: 180 } }] }] },
      { week: "2026-W44", sessionChanges: [{ action: "remove", match: { name: "Max hangs" } }] },
    ],
  }],
};

describe("planChanges - Plan B", () => {
  it("builds on the phases and weeks from the same document, across a phase change", () => {
    const r = plan(DOC);
    const item = r.items.find((i) => i.section === "planB")!;
    expect(item.errors).toEqual([]);
    expect(item.title).toBe("Outdoor if dry · Thu–Mon W43–W44");
    expect(item.dependsOn).toEqual(expect.arrayContaining(["week-0", "phase-0"]));
    expect(item.details).toEqual(expect.arrayContaining(["Plan B Thu: Outdoor bouldering instead of Volume", "Plan B Mon: no Max hangs", "Plan B is the outdoor one"]));

    const [alt] = r.writes.planAlternatives!;
    expect(alt).toMatchObject({ startWeekId: "2026-W43", startDay: "Thursday", days: 5, label: "Outdoor if dry", outdoor: "B" });
    // Both weeks follow their phase, so Plan A sessions are remembered by name only.
    expect(alt.changes.map((c) => ({ offset: c.offset, replaces: c.replaces, session: c.session?.name }))).toEqual([
      { offset: 0, replaces: { name: "Volume" }, session: "Outdoor bouldering" },
      { offset: 4, replaces: { name: "Max hangs" }, session: undefined },
    ]);
    // Nothing else is written into those weeks for the Plan B.
    expect(r.writes.weeks.map((w) => w.weekId)).toEqual(["2026-W44", "2026-W45", "2026-W46"]);
    expect(r.writes.weeks.every((w) => w.planned === null)).toBe(true);

    // Applied the way the app reads weeks: both plans, Plan A counting.
    const base = { workouts: [], trainingBlocks: r.writes.trainingBlocks!, templates: r.writes.templates!, weekOverrides: [] };
    const ctx = { alternatives: r.writes.planAlternatives!, baseWeek: (w: string) => effectiveWorkoutsForWeek(base, w) };
    expect(applyPlanBsToWeek(ctx, "2026-W43").shown.map((w) => w.notes).sort()).toEqual(["Board", "Outdoor bouldering", "Volume"]);
    expect(applyPlanBsToWeek(ctx, "2026-W44").active.map((w) => w.notes).sort()).toEqual(["Limit", "Max hangs"]);
    expect(applyPlanBsToWeek({ ...ctx, alternatives: [{ ...alt, likely: "B" }] }, "2026-W44").active.map((w) => w.notes)).toEqual(["Limit"]);
  });

  it("unticking the week it builds on unticks the Plan B too", () => {
    const v = validateChangeSet(DOC);
    const selected = allItemIds(v.data!);
    selected.delete("week-0");
    const r = planWithSelection(v.data!, state(), selected, ids);
    expect(r.selected.has("planb-0")).toBe(false);
  });

  it("refuses changes outside its days", () => {
    const r = plan({ planB: [{ start: { week: "2026-W43", day: "Thursday" }, changes: [{ week: "2026-W43", sessionChanges: [{ action: "remove", match: { name: "Board" } }] }] }] });
    expect(r.items[0].errors[0]).toMatch(/Mon Board .* outside this Plan B's days/);
    expect(r.writes.planAlternatives).toBeUndefined();
  });

  it("refuses a Plan B that changes nothing, or one longer than two weeks", () => {
    const same = plan({ planB: [{ start: { week: "2026-W43", day: "Thursday" }, changes: [{ week: "2026-W43", sessionChanges: [{ action: "edit", match: { name: "Volume" }, set: { name: "Volume" } }] }] }] });
    expect(same.items[0].errors).toEqual(["Plan B would be the same as Plan A - it has no changes."]);
    const long = plan({ planB: [{ start: { week: "2026-W43", day: "Monday" }, end: { week: "2026-W46", day: "Monday" }, changes: [{ week: "2026-W43", sessionChanges: [{ action: "remove", match: { name: "Board" } }] }] }] });
    expect(long.items[0].errors[0]).toMatch(/at most 14 days/);
  });

  it("repeats weekly and remembers stored sessions by id", () => {
    const s = state();
    s.workouts = [{ id: "stored-vol", status: "planned", date: null, weekId: "2026-W43", dayOfWeek: "Thursday", notes: "Volume", loadFactor: 0, exercises: [] }];
    const r = plan({ planB: [{ start: { week: "2026-W43", day: "Thursday" }, repeatUntil: "2026-W48", changes: [{ week: "2026-W43", sessionChanges: [{ action: "remove", match: { name: "Volume" } }] }] }] }, s);
    const [alt] = r.writes.planAlternatives!;
    expect(alt.repeatUntilWeekId).toBe("2026-W48");
    expect(alt.changes[0].replaces).toEqual({ name: "Volume", id: "stored-vol" });
    expect(r.items[0].details).toContain("every week through 2026-W48");
  });

  it("deletes the Plan B covering a day", () => {
    const existing: PlanAlternative = { id: "old", label: "Crag day", startWeekId: "2026-W43", startDay: "Saturday", days: 2, changes: [{ id: "c", offset: 0, session: { id: "t", name: "Outdoor", exercises: [] } }] };
    const r = plan({ planB: [{ action: "delete", start: { week: "2026-W43", day: "Sunday" } }] }, state([existing]));
    expect(r.items[0].title).toMatch(/^delete Crag day/);
    expect(r.writes.planAlternatives).toEqual([]);
    const miss = plan({ planB: [{ action: "delete", start: { week: "2026-W45", day: "Sunday" } }] }, state([existing]));
    expect(miss.items[0].errors[0]).toMatch(/No Plan B covers/);
  });

  it("validates the shape", () => {
    const v = validateChangeSet({ planB: [{ start: { week: "2026-W43" }, changes: [] }] });
    expect(v.valid).toBe(false);
    const repaired = validateChangeSet({ planB: [{ start: { week: "2026-W43", day: "Friday" }, likely: "C", changes: [{ week: "2026-W43", sessionChanges: [{ action: "remove", match: { name: "X" } }] }] }] });
    expect(repaired.valid).toBe(true);
    expect(repaired.data!.planB[0]).not.toHaveProperty("likely", "C");
  });
});
