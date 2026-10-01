import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, ExerciseTypeDef, Workout } from "../types";
import { buildSessionPrompt } from "./sessionPrompt";
import { parseAIWorkoutLogOutput } from "./schema";

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-hb", name: "Hangboard", category: "cat-f", parameters: ["sets", "timeOn"] },
  { id: "et-old", name: "Old Drill", category: "cat-f", parameters: [], archived: true },
];
const analyticsCategories: AnalyticsCategory[] = [{ id: "cat-f", name: "Fingers", color: "red" }];
const workout: Workout = {
  id: "w1", status: "planned", date: null, weekId: "2026-W39", loadFactor: 0,
  notes: "Power day", description: "Keep it short",
  exercises: [{ id: "s1", typeId: "et-hb", prescribed: { sets: 5, timeOn: 7 } }],
};
const ctx = { exerciseTypes, analyticsCategories };

describe("buildSessionPrompt", () => {
  it("offers the exercise list so the AI reuses existing names, and hides archived ones", () => {
    const p = buildSessionPrompt({ workout, request: "", mode: "add", ...ctx });
    expect(p).toContain('"Hangboard"');
    expect(p).not.toContain("Old Drill");
    expect(p).toContain("Fingers");
  });

  it("shows the session being edited, with its current exercises", () => {
    const p = buildSessionPrompt({ workout, request: "", mode: "add", ...ctx });
    expect(p).toContain("Power day");
    expect(p).toContain("Keep it short");
    expect(p).toContain('"timeOn":7');
  });

  it("asks for only new exercises when adding, and the whole list when replacing", () => {
    expect(buildSessionPrompt({ workout, request: "", mode: "add", ...ctx })).toContain("ONLY the exercises to ADD");
    expect(buildSessionPrompt({ workout, request: "", mode: "replace", ...ctx })).toContain("COMPLETE exercise list");
  });

  it("frames a completed session as a log of what was done", () => {
    const done = { ...workout, status: "completed" as const, exercises: [{ id: "s1", typeId: "et-hb", logged: { sets: 4 } }] };
    const p = buildSessionPrompt({ workout: done, request: "did 4 sets", mode: "add", ...ctx });
    expect(p).toContain("what I actually did");
    expect(p).toContain('"sets":4');
    expect(p.trimEnd().endsWith("did 4 sets")).toBe(true);
  });
});

describe("buildSessionPrompt notes on a finished session", () => {
  const done: Workout = { ...workout, status: "completed", logNotes: "Tweaky left finger", exercises: [{ id: "s1", typeId: "et-hb", logged: { sets: 4 } }] };
  it("leaves out the plan note, keeps how it went", () => {
    const p = buildSessionPrompt({ workout: done, request: "", mode: "add", ...ctx });
    expect(p).not.toContain("Keep it short");
    expect(p).toContain("How it went: Tweaky left finger");
  });
  it("includes the plan note when sharing it is on, and drops how it went when it is off", () => {
    const p = buildSessionPrompt({ workout: done, request: "", mode: "add", ...ctx, noteSharing: { logNotes: false, planNotes: true } });
    expect(p).toContain("Keep it short");
    expect(p).not.toContain("Tweaky");
  });
  it("still shows a planned session's note", () => {
    expect(buildSessionPrompt({ workout, request: "", mode: "add", ...ctx })).toContain("Keep it short");
  });
});

describe("parseAIWorkoutLogOutput", () => {
  it("accepts a reply wrapped in a markdown code fence", () => {
    const r = parseAIWorkoutLogOutput('```json\n{"workouts":[{"exercises":[{"exerciseTypeName":"Hangboard","values":{"sets":3}}]}]}\n```');
    expect(r.valid).toBe(true);
  });
});

describe("custom value types in the session prompt", () => {
  const defs = [
    { id: "elevation", name: "Height / elevation", unit: "m", kind: "number" as const },
    { id: "terrain", name: "Terrain", kind: "choice" as const, options: ["Flat", "Hilly"] },
    { id: "old", name: "Old", kind: "number" as const, archived: true },
  ];
  it("describes the live ones and leaves archived ones out", () => {
    const p = buildSessionPrompt({ workout, request: "", mode: "add", ...ctx, valueDefs: defs });
    expect(p).toContain('"elevation" (Height / elevation): a number in m');
    expect(p).toContain('"terrain" (Terrain): one of "Flat" / "Hilly"');
    expect(p).not.toContain('"old"');
  });
  it("adds nothing when there are none", () => {
    expect(buildSessionPrompt({ workout, request: "", mode: "add", ...ctx })).not.toContain("MY OWN VALUE TYPES");
  });
  it("keeps custom values from a reply, as numbers where they read as one", () => {
    const parsed = parseAIWorkoutLogOutput(JSON.stringify({ workouts: [{ exercises: [{ exerciseTypeName: "Hangboard", values: { custom: { elevation: "120", terrain: "Hilly", bad: { x: 1 } } } }] }] }));
    expect(parsed.valid).toBe(true);
    expect(parsed.data?.workouts[0].exercises[0].values.custom).toEqual({ elevation: 120, terrain: "Hilly" });
  });
});
