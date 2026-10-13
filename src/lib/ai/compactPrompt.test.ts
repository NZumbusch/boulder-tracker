import { describe, it, expect } from "vitest";
import type { ExerciseSlot, WorkoutTemplate } from "../types";
import { buildPlanContext, type PlanContextInput } from "./planContext";
import { loadCompact, saveCompact, promptBreakdown } from "./promptSize";

const slot = (id: string, notes: string): ExerciseSlot => ({ id, typeId: "hb", activeParameters: [], prescribed: { sets: 5, notes } }) as ExerciseSlot;
const tpl = (id: string, name: string, day: "Monday" | "Thursday", notes: string): WorkoutTemplate => ({ id, name, dayOfWeek: day, exercises: [slot(`${id}-s`, notes)] });
const LONG = "A long cue about grip and shoulders. ".repeat(20);

function input(compact: boolean): PlanContextInput {
  return {
    exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets"] }],
    phaseDefs: [{ id: "cap", name: "Capacity", order: 1 }, { id: "str", name: "Strength", order: 2 }, { id: "pow", name: "Power", order: 3 }],
    templates: {
      cap: [tpl("c1", "Volume", "Monday", LONG)],
      str: [tpl("s1", "Heavy hangs", "Thursday", LONG)],
      pow: [tpl("p1", "Limit", "Monday", LONG)],
    },
    trainingBlocks: [
      { id: "b1", name: "Capacity", phaseId: "cap", startDate: "2026-09-28", endDate: "2026-10-25" },
      { id: "b2", name: "Strength", phaseId: "str", startDate: "2026-10-26", endDate: "2026-11-22" },
      { id: "b3", name: "Power", phaseId: "pow", startDate: "2027-03-08", endDate: "2027-04-11" },
    ],
    workouts: [], dismissedSessions: [], weekNotes: [],
    targetWeekIds: ["2026-W41", "2026-W42"],
    compact,
  };
}

describe("compact plan context", () => {
  it("gives the phases in play in full and the rest by session name only", () => {
    const full = buildPlanContext(input(false));
    const short = buildPlanContext(input(true));
    expect(short.length).toBeLessThan(full.length);
    // Capacity is the target and Strength starts within four weeks of it: both keep their values, without the notes.
    const capacity = short.split("\n").find((l) => l.includes('"phase":"Capacity"'))!;
    expect(capacity).toContain('"sets":5');
    expect(capacity).not.toContain("cue");
    // Power is far away: its session names only.
    const power = short.split("\n").find((l) => l.includes('"phase":"Power"'))!;
    expect(power).toContain('"name":"Limit"');
    expect(power).not.toContain("sets");
    expect(short).toContain("Shortened");
    // The full context keeps every note.
    expect(full.match(/A long cue about grip/g)!.length).toBe(3 * 20);
  });

  it("leaves the weeks to change in full - notes included", () => {
    const a = input(true);
    a.workouts = [{ id: "w", status: "planned", date: null, weekId: "2026-W41", dayOfWeek: "Monday", notes: "Volume", loadFactor: 0, exercises: [slot("x", LONG)] } as never];
    a.dismissedSessions = [{ id: "prov:2026-W41:*", weekId: "2026-W41" }];
    expect(buildPlanContext(a)).toContain(LONG.trim());
  });
});

describe("prompt size helpers", () => {
  it("is compact unless the full prompt was chosen", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadCompact(store)).toBe(true);
    saveCompact(false, store);
    expect(loadCompact(store)).toBe(false);
    saveCompact(true, store);
    expect(loadCompact(store)).toBe(true);
  });

  it("names the parts of a prompt, biggest first", () => {
    const prompt = ["Intro line", "My training profile:", "- Completed Sessions (last 2 weeks, in full):", "x".repeat(4000), "PHASES - each phase", "y".repeat(400), "HOW TO ANSWER", "z".repeat(40)].join("\n");
    const parts = promptBreakdown(prompt);
    expect(parts[0].label).toBe("Completed sessions");
    expect(parts.map((p) => p.label)).toEqual(expect.arrayContaining(["Introduction", "Profile", "Phases and their typical weeks", "Rules for the reply"]));
    expect(parts[0].tokens).toBeGreaterThan(parts[1].tokens);
  });
});
