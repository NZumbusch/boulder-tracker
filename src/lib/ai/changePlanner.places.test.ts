import { describe, it, expect } from "vitest";
import type { WorkoutTemplate } from "../types";
import { validateChangeSet } from "./changeSet";
import { planChanges, type PlannerState } from "./changePlanner";
import { buildPlaceContext } from "./context";
import { buildPlanContext } from "./planContext";
import { buildCoachPromptFor } from "./coachPrompt";

let n = 0;
const ids = () => `id${++n}`;

const TYPES = [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets" as const] }];

function state(templates: WorkoutTemplate[] = []): PlannerState {
  return {
    exerciseTypes: TYPES,
    analyticsCategories: [{ id: "c1", name: "Fingers", color: "x" }],
    phaseDefs: [{ id: "p-cap", name: "Capacity", order: 1 }],
    templates: { "p-cap": templates },
    trainingBlocks: [],
    workouts: [],
    dismissedSessions: [],
    weekNotes: [],
    places: [{ name: "Steinbock Konstanz", kind: "gym", price: "CHF 22", hours: "Mon-Fri 9-22" }, { name: "Brione", kind: "crag" }],
    currentWeekId: "2026-W40",
  };
}

function plan(doc: unknown, s: PlannerState = state()) {
  const v = validateChangeSet(doc);
  if (!v.valid) throw new Error(JSON.stringify(v.issues));
  return planChanges(v.data!, s, undefined, ids);
}

const session = (extra: Record<string, unknown> = {}) => ({ name: "Board", dayOfWeek: "Monday", exercises: [{ exerciseTypeName: "Hangboard", values: { sets: 5 } }], ...extra });

describe("a session's place in a change set", () => {
  it("is read from 'place' on an added session and kept on the template it becomes", () => {
    const r = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "add", session: session({ place: " Steinbock Konstanz " }) }] }] });
    expect(r.writes.templates?.["p-cap"]?.[0]).toMatchObject({ name: "Board", location: "Steinbock Konstanz" });
    expect(r.items.flatMap((i) => i.warnings)).toEqual([]);
  });

  it("warns about a place that is not saved, and keeps it as text", () => {
    const r = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "add", session: session({ place: "Uni Bloc" }) }] }] });
    expect(r.writes.templates?.["p-cap"]?.[0].location).toBe("Uni Bloc");
    expect(r.items.flatMap((i) => i.warnings).join(" ")).toMatch(/"Uni Bloc" is not one of your saved places/);
  });

  it("sets, changes and clears the place of an existing session", () => {
    const start = state([{ id: "t1", name: "Board", dayOfWeek: "Monday", location: "Brione", exercises: [{ id: "s1", typeId: "hb", prescribed: { sets: 5 } }] }]);
    const moved = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "Board" }, set: { place: "Steinbock Konstanz" } }] }] }, start);
    expect(moved.writes.templates?.["p-cap"]?.[0].location).toBe("Steinbock Konstanz");
    expect(moved.items.flatMap((i) => i.details).join("\n")).toMatch(/place Brione → Steinbock Konstanz/);
    const cleared = plan({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "edit", match: { name: "Board" }, set: { place: "" } }] }] }, start);
    expect(cleared.writes.templates?.["p-cap"]?.[0]).not.toHaveProperty("location");
  });

  it("refuses a place that is not text", () => {
    const v = validateChangeSet({ phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "add", session: session({ place: 5 }) }] }] });
    expect(v.valid).toBe(false);
  });
});

describe("what the AI is told about places", () => {
  it("gives name, kind, price, hours and notes - never the coordinates", () => {
    const summary = buildPlaceContext([{ name: "Brione", kind: "crag", latitude: 46.3, longitude: 8.8, notes: "Dries fast", price: "free" }]);
    expect(summary).toEqual([{ name: "Brione", kind: "crag", price: "free", notes: "Dries fast" }]);
    expect(JSON.stringify(summary)).not.toMatch(/46\.3|latitude/);
  });

  it("shows a session's place in the plan it is given", () => {
    const t: WorkoutTemplate = { id: "t1", name: "Board", dayOfWeek: "Monday", location: "Steinbock Konstanz", exercises: [{ id: "s1", typeId: "hb", prescribed: { sets: 5 } }] };
    const text = buildPlanContext({ exerciseTypes: TYPES, phaseDefs: [{ id: "p-cap", name: "Capacity", order: 1 }], templates: { "p-cap": [t] }, trainingBlocks: [], workouts: [], dismissedSessions: [], weekNotes: [], targetWeekIds: [] });
    expect(text).toContain('"place":"Steinbock Konstanz"');
  });
});

describe("the coach prompt", () => {
  const source = (sharing: Record<string, boolean> = {}) => ({
    ...state(),
    benchmarks: [], goals: [], dailyMetrics: [], painLogs: [], outdoorAscents: [],
    aiSharing: { trainingBlocks: true, competitions: true, readinessMetrics: false, painLogs: false, outdoorAscents: false, notes: true, ...sharing },
  });
  const prompt = (src: ReturnType<typeof source>) => buildCoachPromptFor(src as never, { mode: "context", targetWeekIds: [], goal: "x", history: { fullWeeks: 2, weeklyLines: 4 } as never });

  it("lists the places, unless sharing them is off", () => {
    expect(prompt(source())).toContain("My Places");
    expect(prompt(source())).toContain("Steinbock Konstanz");
    expect(prompt(source({ places: false }))).not.toContain("Steinbock Konstanz");
  });
});
