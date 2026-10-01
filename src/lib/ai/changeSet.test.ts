import { describe, it, expect } from "vitest";
import { validateChangeSet, isChangeSetShape } from "./changeSet";

const ex = (name: string, values: Record<string, unknown> = {}) => ({ exerciseTypeName: name, values });

describe("validateChangeSet - a full document", () => {
  const doc = {
    summary: "Add a power phase and tweak Capacity",
    exerciseTypes: [
      { action: "add", name: "Max Hangs 7s", categoryName: "Fingers", parameters: ["sets", "timeOn", "weight", "nonsense"] },
      { action: "edit", name: "Hangboard", rename: "Hangboard Repeaters" },
      { action: "archive", name: "Old Drill" },
    ],
    phases: [
      { action: "add", name: "Power", sessions: [{ name: "Limit", dayOfWeek: "Monday", notes: "Full rest between tries", exercises: [ex("Max Hangs 7s", { sets: 5 })] }] },
      {
        action: "edit",
        name: "Capacity",
        sessionChanges: [
          { action: "edit", match: { dayOfWeek: "Thursday" }, set: { plannedDuration: 90 }, exerciseChanges: [{ action: "edit", match: { exerciseTypeName: "Hangboard" }, values: { sets: 6, weight: null } }] },
          { action: "remove", match: { name: "Recovery" } },
        ],
      },
      { action: "delete", name: "Old Phase" },
    ],
    weeks: [
      { from: "2026-W40", to: "2026-W42", phase: "Power", blockNotes: "Peak for Font" },
      { week: "2026-W43", phase: "Deload", sessions: [{ name: "Easy", exercises: [] }], notes: "Travel week" },
      { week: "2026-W44", sessionChanges: [{ action: "add", session: { name: "Extra", dayOfWeek: "Saturday", exercises: [] } }] },
    ],
  };

  it("parses every section", () => {
    const r = validateChangeSet(doc);
    expect(r.valid).toBe(true);
    const set = r.data!;
    expect(set.exerciseTypes.map((c) => c.action)).toEqual(["add", "edit", "archive"]);
    expect(set.phases.map((c) => c.action)).toEqual(["add", "edit", "delete"]);
    expect(set.weeks[0].weekIds).toEqual(["2026-W40", "2026-W41", "2026-W42"]);
    expect(set.weeks[1].notes).toBe("Travel week");
    expect(set.phases[0].action === "add" && set.phases[0].sessions[0].notes).toBe("Full rest between tries");
  });

  it("reads null in edited values as 'clear this field'", () => {
    const phase = validateChangeSet(doc).data!.phases[1];
    const change = phase.action === "edit" ? phase.sessionChanges![0] : null;
    const exChange = change?.action === "edit" ? change.exerciseChanges![0] : null;
    expect(exChange?.action === "edit" && exChange.values).toEqual({ sets: 6 });
    expect(exChange?.action === "edit" && exChange.clear).toEqual(["weight"]);
  });

  it("drops unknown tracked fields as a repair", () => {
    const r = validateChangeSet(doc);
    const add = r.data!.exerciseTypes[0];
    expect(add.action === "add" && add.parameters).toEqual(["sets", "timeOn", "weight"]);
    expect(r.repairs.some((i) => i.path.includes("parameters"))).toBe(true);
  });
});

describe("validateChangeSet - rejects what can't be applied", () => {
  it("needs something to do", () => {
    expect(validateChangeSet({}).valid).toBe(false);
  });

  it("rejects unknown actions, missing matches and ambiguous entries", () => {
    expect(validateChangeSet({ phases: [{ action: "rename", name: "X" }] }).valid).toBe(false);
    expect(validateChangeSet({ weeks: [{ week: "2026-W40", sessionChanges: [{ action: "edit", match: {}, set: { name: "x" } }] }] }).valid).toBe(false);
    expect(validateChangeSet({ weeks: [{ week: "2026-W40", sessions: [], sessionChanges: [] }] }).valid).toBe(false);
    expect(validateChangeSet({ weeks: [{ from: "2026-W45", to: "2026-W40", phase: "X" }] }).valid).toBe(false);
    expect(validateChangeSet({ weeks: [{ week: "June", phase: "X" }] }).valid).toBe(false);
  });

  it("rejects an edit that changes nothing", () => {
    expect(validateChangeSet({ phases: [{ action: "edit", name: "Capacity" }] }).valid).toBe(false);
    expect(validateChangeSet({ exerciseTypes: [{ action: "edit", name: "Hangboard" }] }).valid).toBe(false);
  });

  it("drops blockNotes without a phase as a repair", () => {
    const r = validateChangeSet({ weeks: [{ week: "2026-W40", notes: "x", blockNotes: "y" }] });
    expect(r.valid).toBe(true);
    expect(r.data!.weeks[0].blockNotes).toBeUndefined();
  });
});

describe("isChangeSetShape", () => {
  it("tells the change set apart from the older plan formats", () => {
    expect(isChangeSetShape({ weeks: [{ week: "2026-W40", phase: "X" }] })).toBe(true);
    expect(isChangeSetShape({ phases: [{ action: "add", name: "X" }] })).toBe(true);
    expect(isChangeSetShape({ phases: [{ phaseName: "X", startWeekId: "2026-W40", endWeekId: "2026-W41", sessions: [] }] })).toBe(false);
    expect(isChangeSetShape({ weeks: [{ weekId: "2026-W40", phaseName: "X", workouts: [] }] })).toBe(false);
  });
});

describe("validateChangeSet - circuits", () => {
  const session = (exercises: unknown[]) => ({ weeks: [{ week: "2026-W40", sessions: [{ name: "S", exercises }] }] });

  it("accepts a saved circuit by name (re-timed) and one spelled out", () => {
    const r = validateChangeSet(session([
      { circuit: "Core A", rounds: "4" },
      { circuit: { name: "Pull", rounds: 3, roundRest: 90 }, exercises: [{ exerciseTypeName: "Pull-ups", values: { reps: 6 } }] },
    ]));
    expect(r.valid).toBe(true);
    expect(r.data!.weeks[0].sessions![0].exercises).toEqual([
      { circuit: "Core A", saved: true, exercises: [], rounds: 4 },
      { circuit: "Pull", saved: false, rounds: 3, roundRest: 90, exercises: [expect.objectContaining({ exerciseTypeName: "Pull-ups" })] },
    ]);
  });

  it("needs rounds and exercises for a spelled-out circuit, and sane numbers", () => {
    expect(validateChangeSet(session([{ circuit: { name: "X" }, exercises: [{ exerciseTypeName: "A", values: {} }] }])).valid).toBe(false);
    expect(validateChangeSet(session([{ circuit: { rounds: 3 }, exercises: [] }])).valid).toBe(false);
    expect(validateChangeSet(session([{ circuit: "X", transition: -5 }])).valid).toBe(false);
  });

  it("takes circuit changes in sessions and a circuits section on its own", () => {
    const r = validateChangeSet({
      circuits: [{ action: "add", name: "Core A", rounds: 3, exercises: [{ exerciseTypeName: "Core", values: {} }] }, { action: "delete", name: "Old" }],
      phases: [{ action: "edit", name: "P", sessionChanges: [{ action: "edit", match: { name: "S" }, exerciseChanges: [
        { action: "editCircuit", circuit: "Core A", set: { rounds: 4 } },
        { action: "removeCircuit", circuit: "Old one" },
        { action: "add", exercise: { circuit: "Core A" }, position: 2 },
      ] }] }],
    });
    expect(r.valid).toBe(true);
    expect(r.data!.circuits).toHaveLength(2);
    expect(validateChangeSet({ circuits: [{ action: "add", name: "Empty", rounds: 3, exercises: [] }] }).valid).toBe(false);
    expect(validateChangeSet({ circuits: [{ action: "edit", name: "Core A" }] }).valid).toBe(false);
  });
});

describe("custom parameters in exercise-type changes", () => {
  it('accepts "v:<id>" next to built-in fields and still drops junk', () => {
    const result = validateChangeSet({ exerciseTypes: [{ action: "add", name: "Hill walk", parameters: ["duration", "v:elevation", "v:bad id", "nonsense"] }] });
    expect(result.valid).toBe(true);
    expect((result.data as any).exerciseTypes[0].parameters).toEqual(["duration", "v:elevation"]);
  });
});
