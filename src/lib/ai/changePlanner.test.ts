import { describe, it, expect } from "vitest";
import type { ExerciseSlot, Workout, WorkoutTemplate } from "../types";
import { validateChangeSet } from "./changeSet";
import { planChanges, planWithSelection, allItemIds, carveBlocks, type PlannerState } from "./changePlanner";

let n = 0;
const ids = () => `id${++n}`;
const slot = (typeId: string, prescribed: Record<string, unknown>): ExerciseSlot => ({ id: ids(), typeId, activeParameters: [], prescribed }) as ExerciseSlot;

function state(): PlannerState {
  const capacity: WorkoutTemplate[] = [
    { id: "t-board", name: "Board", dayOfWeek: "Monday", description: "Warm up well", exercises: [slot("hb", { sets: 5, weight: 10 })] },
    { id: "t-volume", name: "Volume", dayOfWeek: "Thursday", exercises: [slot("lb", { duration: 60 }), slot("core", { sets: 3 })] },
  ];
  const w39: Workout[] = [
    { id: "w39-board", status: "planned", date: null, weekId: "2026-W39", dayOfWeek: "Monday", notes: "Board (edited)", loadFactor: 0, exercises: [slot("hb", { sets: 4 })] } as Workout,
    { id: "w39-done", status: "completed", date: "2026-09-22", weekId: "2026-W39", dayOfWeek: "Tuesday", notes: "Bonus", loadFactor: 100, exercises: [] } as Workout,
  ];
  return {
    exerciseTypes: [
      { id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets", "weight"] },
      { id: "lb", name: "Limit Bouldering", category: "Power", parameters: ["duration"] },
      { id: "core", name: "Core", category: "Strength", parameters: ["sets"] },
    ],
    analyticsCategories: [{ id: "c1", name: "Fingers", color: "x" }, { id: "c2", name: "Power", color: "y" }],
    phaseDefs: [{ id: "p-cap", name: "Capacity", order: 1 }, { id: "p-del", name: "Deload", order: 2 }],
    templates: { "p-cap": capacity, "p-del": [] },
    trainingBlocks: [{ id: "b-cap", name: "Capacity", phaseId: "p-cap", startWeekId: "2026-W38", endWeekId: "2026-W43" }],
    workouts: w39,
    weekOverrides: [{ weekId: "2026-W39", customized: true }],
    weekNotes: [{ weekId: "2026-W40", text: "Mine" }],
    currentWeekId: "2026-W39",
  };
}

function plan(doc: unknown, selected?: Set<string>) {
  const v = validateChangeSet(doc);
  if (!v.valid) throw new Error(JSON.stringify(v.issues));
  return planChanges(v.data!, state(), selected, ids);
}

describe("carveBlocks", () => {
  it("trims, splits and drops blocks around a range", () => {
    const blocks = [
      { id: "a", name: "A", phaseId: "p", startWeekId: "2026-W38", endWeekId: "2026-W43" },
      { id: "b", name: "B", phaseId: "p", startWeekId: "2026-W40", endWeekId: "2026-W41" },
      { id: "c", name: "C", phaseId: "p", startWeekId: "2026-W50", endWeekId: "2026-W51" },
    ];
    const r = carveBlocks(blocks, "2026-W40", "2026-W41", () => "new");
    expect(r.map((b) => `${b.id}:${b.startWeekId}-${b.endWeekId}`)).toEqual(["a:2026-W38-2026-W39", "new:2026-W42-2026-W43", "c:2026-W50-2026-W51"]);
  });
});

describe("planChanges - exercise types", () => {
  it("adds a type, inferring what it tracks from how the plan uses it", () => {
    const r = plan({
      exerciseTypes: [{ action: "add", name: "Max Hangs 7s", categoryName: "fingers" }],
      phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { dayOfWeek: "Monday" }, exerciseChanges: [{ action: "add", exercise: { exerciseTypeName: "max hangs 7s", values: { sets: 6, timeOn: 7 } } }] }] }],
    });
    const added = r.writes.exerciseTypes!.find((t) => t.name === "Max Hangs 7s")!;
    expect(added.category).toBe("Fingers");
    expect(added.parameters.sort()).toEqual(["sets", "timeOn"]);
    expect(r.items[1].dependsOn).toEqual(["exercise-0"]);
  });

  it("refuses to add a type that exists, and to edit one that doesn't", () => {
    const r = plan({ exerciseTypes: [{ action: "add", name: "hangboard" }, { action: "edit", name: "Nope", rename: "X" }] });
    expect(r.items[0].errors[0]).toContain("already in your exercise list");
    expect(r.items[1].errors[0]).toContain("No exercise called");
  });

  it("renames and archives", () => {
    const r = plan({ exerciseTypes: [{ action: "edit", name: "Core", rename: "Core Circuit" }, { action: "archive", name: "Hangboard" }] });
    expect(r.writes.exerciseTypes!.find((t) => t.id === "core")!.name).toBe("Core Circuit");
    expect(r.writes.exerciseTypes!.find((t) => t.id === "hb")!.archived).toBe(true);
    expect(r.items[1].warnings[0]).toContain("Still used");
  });
});

describe("planChanges - phases", () => {
  it("edits one exercise in one session of the typical week, with a readable diff", () => {
    const r = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "board" }, set: { plannedDuration: 75 }, exerciseChanges: [{ action: "edit", match: { exerciseTypeName: "Hangboard" }, values: { sets: 6, weight: null } }] }] }] });
    const board = r.writes.templates!["p-cap"].find((t) => t.name === "Board")!;
    expect(board.plannedDuration).toBe(75);
    expect(board.exercises[0].prescribed).toEqual({ sets: 6 });
    expect(board.description).toBe("Warm up well");
    expect(r.items[0].details.join("\n")).toContain("sets 5 → 6, weight 10 → —");
  });

  it("adds a phase with sessions and notes, and can replace or remove sessions", () => {
    const r = plan({
      phases: [
        { action: "add", name: "Power", sessions: [{ name: "Limit", dayOfWeek: "Tuesday", notes: "Long rests", exercises: [{ exerciseTypeName: "Limit Bouldering", values: { duration: 45 } }] }] },
        { action: "edit", name: "Capacity", sessionChanges: [{ action: "remove", match: { dayOfWeek: "Thursday" } }] },
      ],
    });
    const power = r.writes.phaseDefs!.find((p) => p.name === "Power")!;
    expect(r.writes.templates![power.id][0]).toMatchObject({ name: "Limit", description: "Long rests" });
    expect(r.writes.templates!["p-cap"].map((t) => t.name)).toEqual(["Board"]);
  });

  it("reports an ambiguous or missing session instead of guessing", () => {
    const r = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "remove", match: { name: "Nope" } }] }] });
    expect(r.items[0].errors[0]).toContain("no session matches");
  });

  it("archives a deleted phase and warns that weeks still use it", () => {
    const r = plan({ phases: [{ action: "delete", name: "Capacity" }] });
    expect(r.writes.phaseDefs!.find((p) => p.id === "p-cap")!.archived).toBe(true);
    expect(r.items[0].warnings[0]).toContain("Still assigned");
  });
});

describe("planChanges - weeks", () => {
  it("assigns a new phase to a range: carves the old block, weeks follow the phase", () => {
    const r = plan({
      phases: [{ action: "add", name: "Power", sessions: [{ name: "Limit", dayOfWeek: "Tuesday", exercises: [] }] }],
      weeks: [{ from: "2026-W40", to: "2026-W41", phase: "Power", blockNotes: "Peak" }],
    });
    const blocks = r.writes.trainingBlocks!;
    expect(blocks.map((b) => `${b.name}:${b.startWeekId}-${b.endWeekId}`).sort()).toEqual(["Capacity:2026-W38-2026-W39", "Capacity:2026-W42-2026-W43", "Power:2026-W40-2026-W41"]);
    expect(blocks.find((b) => b.name === "Power")!.notes).toBe("AI: Peak");
    expect(r.writes.weeks).toEqual([
      { weekId: "2026-W40", planned: null, customized: false },
      { weekId: "2026-W41", planned: null, customized: false },
    ]);
    const week = r.items.find((i) => i.section === "week")!;
    expect(week.dependsOn).toEqual(["phase-0"]);
    expect(week.details).toContain("phase Capacity → Power");
    expect(week.details).toContain("each week: + Tue Limit (0 exercises)");
  });

  it("keeps a stored plan around completed sessions when a week just follows a phase", () => {
    const r = plan({ weeks: [{ week: "2026-W39", phase: "Deload" }] });
    const w = r.writes.weeks[0];
    expect(w.planned).toEqual([]); // Deload has no sessions, but the week has a completed one
    expect(r.items[0].warnings.join(" ")).toContain("had hand edits");
    expect(r.items[0].details.join(" ")).toContain("1 completed session(s) kept");
  });

  it("spells out a week, replacing its planned sessions and carrying session notes", () => {
    const r = plan({ weeks: [{ week: "2026-W39", sessions: [{ name: "Easy", dayOfWeek: "Friday", notes: "Keep it light", exercises: [{ exerciseTypeName: "Core", values: { sets: 2 } }] }] }] });
    const w = r.writes.weeks[0];
    expect(w.customized).toBe(true);
    expect(w.planned!.map((s) => [s.notes, s.description])).toEqual([["Easy", "Keep it light"]]);
    expect(w.planned![0].plannedLoad).toBeGreaterThan(0);
  });

  it("edits a provisional week on top of the phase's (edited) typical week", () => {
    const r = plan({
      phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { dayOfWeek: "Monday" }, set: { name: "Fingers" } }] }],
      weeks: [{ week: "2026-W40", sessionChanges: [{ action: "edit", match: { name: "Fingers" }, exerciseChanges: [{ action: "remove", match: { exerciseTypeName: "Hangboard" } }] }] }],
    });
    const planned = r.writes.weeks[0].planned!;
    expect(planned.map((s) => s.notes)).toEqual(["Fingers", "Volume"]);
    expect(planned[0].exercises).toEqual([]);
    expect(planned[0].description).toBe("Warm up well");
  });

  it("adds a week note after the user's own, without touching the week's sessions", () => {
    const r = plan({ weeks: [{ week: "2026-W40", notes: "Travelling Thu" }] });
    expect(r.writes.weekNotes).toEqual([{ weekId: "2026-W40", text: "Mine\n\nAI: Travelling Thu" }]);
    expect(r.writes.weeks).toEqual([]);
  });

  it("flags an unknown phase or exercise", () => {
    const r = plan({ weeks: [{ week: "2026-W40", phase: "Nope" }, { week: "2026-W41", sessions: [{ name: "X", exercises: [{ exerciseTypeName: "Juggling", values: {} }] }] }] });
    expect(r.items[0].errors[0]).toContain('No phase called "Nope"');
    expect(r.items[1].errors[0]).toContain('Unknown exercise "Juggling"');
  });
});

describe("planWithSelection", () => {
  const doc = {
    exerciseTypes: [{ action: "add", name: "Max Hangs 7s" }],
    phases: [{ action: "add", name: "Power", sessions: [{ name: "Limit", exercises: [{ exerciseTypeName: "Max Hangs 7s", values: { sets: 5 } }] }] }],
    weeks: [{ week: "2026-W40", phase: "Power" }, { week: "2026-W41", notes: "Independent" }],
  };

  it("unticks everything that depends on an unticked change, and nothing else", () => {
    const set = validateChangeSet(doc).data!;
    const requested = allItemIds(set);
    requested.delete("exercise-0");
    const r = planWithSelection(set, state(), requested, ids);
    expect([...r.selected].sort()).toEqual(["week-1"]);
    expect(r.items.find((i) => i.id === "phase-0")!.errors[0]).toContain("which is unticked");
    expect(r.writes.weekNotes).toHaveLength(1);
    expect(r.writes.trainingBlocks).toBeUndefined();
  });

  it("applies everything when all is ticked and valid", () => {
    const set = validateChangeSet(doc).data!;
    const r = planWithSelection(set, state(), allItemIds(set), ids);
    expect(r.selected.size).toBe(4);
    expect(r.writes.exerciseTypes).toBeDefined();
    expect(r.writes.trainingBlocks).toBeDefined();
  });
});

describe("planChanges - circuits survive edits", () => {
  function groupedPlan(doc: unknown) {
    const s = state();
    const volume = s.templates["p-cap"][1];
    s.templates["p-cap"][1] = {
      ...volume,
      exercises: volume.exercises.map((e) => ({ ...e, groupId: "g1" })),
      groups: [{ id: "g1", name: "Core circuit", rounds: 3, transition: 15 }],
    };
    const v = validateChangeSet(doc);
    if (!v.valid) throw new Error(JSON.stringify(v.issues));
    return planChanges(v.data!, s, undefined, ids);
  }

  it("keeps a template's groups when the session is edited", () => {
    const r = groupedPlan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "Volume" }, set: { startTime: "07:00" } }] }] });
    const volume = r.writes.templates!["p-cap"].find((t) => t.name === "Volume")!;
    expect(volume.groups).toEqual([{ id: "g1", name: "Core circuit", rounds: 3, transition: 15 }]);
    expect(volume.exercises.every((e) => e.groupId === "g1")).toBe(true);
  });

  it("puts an exercise added between two members into their group", () => {
    const r = groupedPlan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "Volume" }, exerciseChanges: [{ action: "add", position: 2, exercise: { exerciseTypeName: "Hangboard", values: { sets: 3 } } }] }] }] });
    const volume = r.writes.templates!["p-cap"].find((t) => t.name === "Volume")!;
    expect(volume.exercises.map((e) => e.groupId)).toEqual(["g1", "g1", "g1"]);
  });
});

describe("planChanges - circuits", () => {
  function withLibrary(doc: unknown) {
    const s = state();
    s.circuits = [{ id: "c-core", name: "Core A", rounds: 3, transition: 15, roundRest: 60, exercises: [{ id: "cs1", typeId: "core", prescribed: { sets: 1 } }] }];
    const v = validateChangeSet(doc);
    if (!v.valid) throw new Error(JSON.stringify(v.issues));
    return planWithSelection(v.data!, s, allItemIds(v.data!), ids);
  }
  const week = (sessions: unknown) => ({ weeks: [{ week: "2026-W40", sessions }] });

  it("spells a circuit out in a session as a group of its exercises", () => {
    const r = withLibrary(week([{ name: "Strength", exercises: [
      { exerciseTypeName: "Hangboard", values: { sets: 5 } },
      { circuit: { name: "Antagonists", rounds: 4, transition: 15, roundRest: 90 }, exercises: [{ exerciseTypeName: "Core", values: {} }, { exerciseTypeName: "Limit Bouldering", values: {} }] },
    ] }]));
    const w = r.writes.weeks[0].planned![0];
    expect(w.groups).toEqual([expect.objectContaining({ name: "Antagonists", rounds: 4, transition: 15, roundRest: 90 })]);
    expect(w.exercises.map((e) => !!e.groupId)).toEqual([false, true, true]);
  });

  it("copies a saved circuit in by name, re-timed, and remembers where it came from", () => {
    const r = withLibrary(week([{ name: "Core day", exercises: [{ circuit: "core a", rounds: 4 }] }]));
    const w = r.writes.weeks[0].planned![0];
    expect(w.groups![0]).toMatchObject({ name: "Core A", rounds: 4, transition: 15, roundRest: 60, circuitId: "c-core" });
    expect(w.exercises[0].id).not.toBe("cs1");
  });

  it("reports a circuit that isn't saved", () => {
    const r = withLibrary(week([{ name: "X", exercises: [{ circuit: "Nope" }] }]));
    expect(r.items[0].errors[0]).toContain('No saved circuit called "Nope"');
  });

  it("adds a circuit to the library that sessions in the same change set can use - and unticks them with it", () => {
    const doc = {
      circuits: [{ action: "add", name: "Pull superset", rounds: 4, roundRest: 60, exercises: [{ exerciseTypeName: "Hangboard", values: { reps: 6 } }] }],
      ...week([{ name: "Pull", exercises: [{ circuit: "Pull superset" }] }]),
    };
    const r = withLibrary(doc);
    expect(r.writes.circuits!.map((c) => c.name)).toEqual(["Core A", "Pull superset"]);
    expect(r.items.find((i) => i.id === "week-0")!.dependsOn).toEqual(["circuit-0"]);

    const v = validateChangeSet(doc);
    const s = state();
    const unticked = planWithSelection(v.data!, s, new Set(["week-0"]), ids);
    expect(unticked.selected.has("week-0")).toBe(false);
  });

  it("edits and removes circuits inside a session, and progresses one", () => {
    const s = state();
    const volume = s.templates["p-cap"][1];
    s.templates["p-cap"][1] = { ...volume, exercises: volume.exercises.map((e) => ({ ...e, groupId: "g1" })), groups: [{ id: "g1", name: "Core circuit", rounds: 3 }] };
    const run = (exerciseChanges: unknown[]) => {
      const v = validateChangeSet({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "Volume" }, exerciseChanges }] }] });
      if (!v.valid) throw new Error(JSON.stringify(v.issues));
      return planChanges(v.data!, s, undefined, ids);
    };
    const edited = run([{ action: "editCircuit", circuit: "core circuit", set: { rounds: 4, roundRest: 60 } }]);
    const t = edited.writes.templates!["p-cap"].find((x) => x.name === "Volume")!;
    expect(t.groups).toEqual([{ id: "g1", name: "Core circuit", rounds: 4, roundRest: 60 }]);
    expect(edited.items[0].details.join("\n")).toContain("rounds 3 → 4");

    const removed = run([{ action: "removeCircuit", circuit: "Core circuit" }]);
    const r = removed.writes.templates!["p-cap"].find((x) => x.name === "Volume")!;
    expect(r.exercises).toEqual([]);
    expect(r.groups).toBeUndefined();
  });

  it("edits and deletes saved circuits", () => {
    const r = withLibrary({ circuits: [{ action: "edit", name: "Core A", rounds: 4, rename: "Core B" }] });
    expect(r.writes.circuits).toEqual([expect.objectContaining({ id: "c-core", name: "Core B", rounds: 4 })]);
    const d = withLibrary({ circuits: [{ action: "delete", name: "Core A" }] });
    expect(d.writes.circuits).toEqual([]);
  });
});
