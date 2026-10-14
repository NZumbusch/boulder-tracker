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

describe("changing the places themselves", () => {
  const places = (...list: unknown[]) => ({ places: list });
  const withHome = (): PlannerState => ({ ...state(), places: [{ name: "Home", kind: "home" }, { name: "Steinbock Konstanz", kind: "gym", price: "CHF 22" }, { name: "Brione", kind: "crag" }] });

  it("adds a new gym with its details", () => {
    const r = plan(places({ action: "add", name: "Boulderwelt Regensburg", kind: "gym", price: "CHF 22", hours: "Mon-Fri 9-23", notes: "Board on the left" }));
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ section: "place", id: "place-0", errors: [] });
    expect(r.writes.places?.map((p) => p.name)).toEqual(["Steinbock Konstanz", "Brione", "Boulderwelt Regensburg"]);
    expect(r.writes.places?.[2]).toEqual({ name: "Boulderwelt Regensburg", kind: "gym", price: "CHF 22", hours: "Mon-Fri 9-23", notes: "Board on the left" });
    expect(r.writes.placeRenames).toBeUndefined();
  });

  it("lets a session in the same change set name the place it adds, without a warning", () => {
    const r = plan({
      ...places({ action: "add", name: "Boulderwelt", kind: "gym" }),
      phases: [{ action: "edit", name: "Capacity", sessionChanges: [{ action: "add", session: session({ place: "Boulderwelt" }) }] }],
    });
    expect(r.writes.templates?.["p-cap"]?.[0].location).toBe("Boulderwelt");
    expect(r.items.flatMap((i) => i.warnings).join(" ")).not.toMatch(/not one of your saved places/);
  });

  it("warns about missing coordinates on a crag, and about coordinates the AI gave", () => {
    const crag = plan(places({ action: "add", name: "Fontainebleau", kind: "crag" }));
    expect(crag.items[0].warnings.join(" ")).toMatch(/No coordinates/);
    const located = plan(places({ action: "add", name: "Fontainebleau", kind: "crag", latitude: 48.4, longitude: 2.65 }));
    expect(located.items[0].warnings.join(" ")).toMatch(/come from the AI/);
    expect(located.writes.places?.at(-1)).toMatchObject({ latitude: 48.4, longitude: 2.65 });
  });

  it("refuses to add a name that exists (ignoring case) or a second home", () => {
    expect(plan(places({ action: "add", name: "brione" })).items[0].errors.join(" ")).toMatch(/already one of your places/);
    expect(plan(places({ action: "add", name: "Cabin", kind: "home" }), withHome()).items[0].errors.join(" ")).toMatch(/already your home/);
  });

  it("edits details, clears one, and says what changes", () => {
    const r = plan(places({ action: "edit", name: "steinbock konstanz", price: "", hours: "Mon-Fri 10-22", kind: "other" }));
    expect(r.items[0].errors).toEqual([]);
    expect(r.items[0].details.join(" | ")).toMatch(/kind Gym → Other.*price cleared.*hours "Mon-Fri 9-22" → "Mon-Fri 10-22"/);
    expect(r.writes.places?.[0]).toEqual({ name: "Steinbock Konstanz", kind: "other", hours: "Mon-Fri 10-22" });
  });

  it("renames a place, counts the sessions that follow, and passes the rename on to storage", () => {
    const s = { ...state(), workouts: [{ id: "w1", status: "planned", weekId: "2026-W41", exercises: [], location: "Steinbock Konstanz" } as never] };
    const r = plan(places({ action: "edit", name: "Steinbock Konstanz", rename: "Steinbock" }), s);
    expect(r.items[0].details.join(" ")).toMatch(/1 session that name it follow/);
    expect(r.writes.places?.[0].name).toBe("Steinbock");
    expect(r.writes.placeRenames).toEqual([{ from: "Steinbock Konstanz", to: "Steinbock" }]);
    expect(plan(places({ action: "edit", name: "Brione", rename: "steinbock konstanz" })).items[0].errors.join(" ")).toMatch(/already one of your places/);
  });

  it("removes a place, warning about the sessions that keep its name as text", () => {
    const s = { ...state(), workouts: [{ id: "w1", status: "planned", weekId: "2026-W41", exercises: [], location: "Brione" } as never] };
    const r = plan(places({ action: "remove", name: "Brione" }), s);
    expect(r.items[0].warnings.join(" ")).toMatch(/1 session name it/);
    expect(r.writes.places?.map((p) => p.name)).toEqual(["Steinbock Konstanz"]);
  });

  it("errors on a place that isn't there, and applies only the ticked changes", () => {
    expect(plan(places({ action: "remove", name: "Nowhere" })).items[0].errors.join(" ")).toMatch(/No place called/);
    const v = validateChangeSet(places({ action: "remove", name: "Brione" }, { action: "add", name: "Gym B", kind: "gym" }));
    const r = planChanges(v.data!, state(), new Set(["place-1"]), ids);
    expect(r.writes.places?.map((p) => p.name)).toEqual(["Steinbock Konstanz", "Brione", "Gym B"]);
  });

  it("writes nothing when nothing is ticked", () => {
    const v = validateChangeSet(places({ action: "remove", name: "Brione" }));
    expect(planChanges(v.data!, state(), new Set(), ids).writes.places).toBeUndefined();
  });
});
