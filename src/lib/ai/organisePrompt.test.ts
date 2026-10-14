import { describe, it, expect } from "vitest";
import { buildOrganisePrompt, sessionsPerType } from "./organisePrompt";
import { validateChangeSet } from "./changeSet";
import type { Workout } from "../types";

const done = (typeIds: string[]): Workout => ({ id: Math.random().toString(), status: "completed", date: "2026-09-01", weekId: "2026-W36", loadFactor: 0, exercises: typeIds.map((t, i) => ({ id: `s${i}`, typeId: t })) }) as Workout;

describe("buildOrganisePrompt", () => {
  const source = {
    exerciseTypes: [
      { id: "a", name: "Pigeon pose", category: "Other", group: "Stretching", parameters: [] },
      { id: "b", name: "Hangboard", category: "Fingers", parameters: [] },
      { id: "c", name: "Old", category: "Other", parameters: [], archived: true },
    ],
    analyticsCategories: [{ id: "1", name: "Fingers", color: "x" }, { id: "2", name: "Other", color: "y" }, { id: "3", name: "Gone", color: "z", archived: true }],
    workouts: [done(["a", "a", "b"]), done(["b"]), { ...done(["a"]), status: "planned" } as Workout],
  };
  it("counts logged sessions per exercise, once per session and never planned ones", () => {
    expect([...sessionsPerType(source.workouts)]).toEqual([["a", 1], ["b", 2]]);
  });
  it("lists live categories with their sizes and live exercises with their use", () => {
    const p = buildOrganisePrompt(source, "");
    expect(p).toContain('{"name":"Other","exercises":1}');
    expect(p).not.toContain("Gone");
    expect(p).toContain('{"name":"Pigeon pose","category":"Other","group":"Stretching","sessionsLogged":1,"lastLogged":"2026-09-01","plannedIn":0}');
    expect(p).not.toContain('"Old"');
    expect(p).toContain("split any catch-all");
  });
  it("uses the request when there is one", () => {
    expect(buildOrganisePrompt(source, "separate legs from core")).toContain("separate legs from core");
  });
  it("lists only the chosen areas", () => {
    const more = { ...source, circuits: [{ id: "c1", name: "Core A", rounds: 3, exercises: [{ id: "x", typeId: "a" }] }], phaseDefs: [{ id: "p1", name: "Base" }], trainingBlocks: [], templates: { p1: [] }, coachNotes: [{ id: "k3x9", text: "Recovers slowly", source: "ai", addedOn: "2026-09-01" }] } as never;
    const all = buildOrganisePrompt(more, "", ["exercises", "circuits", "phases", "notes"]);
    expect(all).toContain('"Core A"');
    expect(all).toContain('{"name":"Base","blocks":0,"typicalSessions":0}');
    expect(all).toContain("[k3x9] Recovers slowly");
    const only = buildOrganisePrompt(more, "", ["notes"]);
    expect(only).toContain("[k3x9]");
    expect(only).not.toContain("Pigeon pose");
    expect(only).not.toContain("Core A");
  });
  it("lists custom fields, tests, goals and pain issues with what matters for each", () => {
    const more = {
      ...source,
      today: "2026-10-01",
      valueDefs: [{ id: "edge", name: "Edge", kind: "number", unit: "mm" }],
      benchmarkTypes: [{ id: "mh", name: "Max hang", unit: "kg", group: "Fingers" }],
      benchmarks: [{ id: "r1", typeId: "mh", date: "2026-09-01", value: 1 }],
      goals: [{ id: "g", kind: "competition", name: "Spring comp", date: "2026-03-01" }],
      painIssues: [{ id: "p", bodyPart: "Finger", startDate: "2026-05-01" }],
    } as never;
    const p = buildOrganisePrompt(more, "", ["values", "tests", "goals", "pain"]);
    expect(p).toContain('{"name":"Edge","kind":"number","unit":"mm","onExercises":0,"inTests":0}');
    expect(p).toContain('"results":1,"lastResult":"2026-09-01"');
    expect(p).toContain('"status":"over"');
    expect(p).toContain('"status":"open"');
    expect(p).not.toContain("Pigeon pose");
  });
  it("lists the places without their coordinates, and asks for edits and removals only", () => {
    const more = {
      ...source,
      places: [{ name: "Brione", kind: "crag", latitude: 46.3, longitude: 8.8, notes: "Dries fast" }, { name: "Gym", kind: "gym", price: "CHF 22" }],
      workouts: [{ id: "w", status: "planned", weekId: "2026-W41", exercises: [], location: "brione" }],
    } as never;
    const p = buildOrganisePrompt(more, "", ["places"]);
    expect(p).toContain('{"name":"Brione","kind":"crag","notes":"Dries fast","onMap":true,"sessionsNamingIt":1}');
    expect(p).toContain('{"name":"Gym","kind":"gym","price":"CHF 22","onMap":false,"sessionsNamingIt":0}');
    expect(p).not.toMatch(/46\.3|latitude/);
    expect(p).toContain("Never add a place");
    expect(p).not.toContain("Pigeon pose");
    expect(validateChangeSet({ places: [{ action: "edit", name: "Brione", rename: "Brione TI", kind: "crag", price: "free", notes: "" }, { action: "remove", name: "Gym" }] }).valid).toBe(true);
  });
  it("the reply shape it asks for is a valid change set", () => {
    const reply = { summary: "x", categories: [{ action: "add", name: "Mobility" }], exerciseTypes: [{ action: "edit", name: "Pigeon pose", categoryName: "Mobility", group: "Stretching" }] };
    expect(validateChangeSet(reply).valid).toBe(true);
    const wide = { summary: "x", exerciseTypes: [{ action: "edit", name: "Pigeon pose", rename: "Pigeon stretch", description: "d" }, { action: "archive", name: "Old" }], circuits: [{ action: "edit", name: "Core A", rename: "Core" }, { action: "delete", name: "Dup" }], phases: [{ action: "edit", name: "Phase 1", rename: "Base" }, { action: "delete", name: "Unused" }], coachNotes: [{ action: "edit", id: "k3x9", text: "t" }, { action: "remove", id: "p2m4" }] };
    expect(validateChangeSet(wide).valid).toBe(true);
  });
});
