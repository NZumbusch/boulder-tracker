import { describe, it, expect } from "vitest";
import type { AIContextProfile } from "./context";
import { buildCoachPrompt, buildCoachPromptFor } from "./coachPrompt";

const profile: AIContextProfile = {
  exerciseModalities: [{ name: "Hangboard", category: "Fingers", group: "Fingers", params: ["sets"] }],
  phases: ["Strength"],
  recentWorkouts: [],
  benchmarks: [],
};

describe("buildCoachPrompt", () => {
  it("generate: asks for a change set over the target weeks, with goal and current plan", () => {
    const p = buildCoachPrompt({ mode: "generate", profile, targetWeekIds: ["2026-W40", "2026-W41"], goal: "Font trip", planContext: "PHASES - x" });
    expect(p).toContain("2026-W40, 2026-W41");
    expect(p).toContain("Font trip");
    expect(p).toContain("PHASES - x");
    expect(p).toContain("CHANGE SET");
    // The plan context lists phases itself.
    expect(p).not.toContain("Available Phases");
  });

  it("analyze: asks for feedback, never a change set", () => {
    const p = buildCoachPrompt({ mode: "analyze", profile, targetWeekIds: ["2026-W38"], goal: "" });
    expect(p).toContain("2026-W38");
    expect(p).toContain("what I did well");
    expect(p).not.toContain("CHANGE SET");
  });

  it("context: only the profile", () => {
    const p = buildCoachPrompt({ mode: "context", profile, targetWeekIds: [], goal: "ignored" });
    expect(p).toContain("Hangboard");
    expect(p).not.toContain("ignored");
    expect(p).not.toContain("CHANGE SET");
  });
});

describe("buildCoachPromptFor", () => {
  const source = {
    exerciseTypes: [{ id: "et", name: "Hangboard", category: "Fingers", parameters: [] }],
    analyticsCategories: [{ id: "c", name: "Fingers", color: "red" }],
    phaseDefs: [], templates: {}, trainingBlocks: [], weekOverrides: [], weekNotes: [],
    benchmarks: [], goals: [], dailyMetrics: [], painLogs: [], outdoorAscents: [],
    aiSharing: { trainingBlocks: true, competitions: true, readinessMetrics: false, painLogs: false, outdoorAscents: true, notes: true },
    workouts: [
      { id: "done", status: "completed", date: "2026-09-16", weekId: "2026-W38", loadFactor: 50, notes: "Done recently", exercises: [] },
      { id: "older", status: "completed", date: "2026-08-19", weekId: "2026-W34", loadFactor: 70, notes: "Older one", exercises: [] },
      { id: "next", status: "planned", date: null, weekId: "2026-W38", loadFactor: 0, notes: "Still planned", exercises: [] },
    ],
  } as any;
  const asOf = new Date("2026-09-18T12:00:00Z");

  it("sends recent sessions in full, older weeks as one line each, and no planned sessions as history", () => {
    const p = buildCoachPromptFor(source, { mode: "context", targetWeekIds: [], goal: "", history: { fullWeeks: 2, summaryWeeks: 8 }, asOf });
    expect(p).toContain("Done recently");
    expect(p).not.toContain("Older one");
    expect(p).toContain('"week":"2026-W34","sessions":1');
    expect(p).not.toContain("Still planned");
  });

  it("prints no indented JSON", () => {
    const p = buildCoachPromptFor(source, { mode: "context", targetWeekIds: [], goal: "", history: { fullWeeks: 2, summaryWeeks: 8 }, asOf });
    expect(p).not.toMatch(/\n  "/);
  });

  it("works on a source whose fields are getters, like trainingState", () => {
    class GetterSource {
      get exerciseTypes() { return source.exerciseTypes; }
      get analyticsCategories() { return source.analyticsCategories; }
      get phaseDefs() { return source.phaseDefs; }
      get templates() { return source.templates; }
      get trainingBlocks() { return source.trainingBlocks; }
      get weekOverrides() { return source.weekOverrides; }
      get weekNotes() { return source.weekNotes; }
      get workouts() { return source.workouts; }
      get benchmarks() { return source.benchmarks; }
      get goals() { return source.goals; }
      get dailyMetrics() { return source.dailyMetrics; }
      get painLogs() { return source.painLogs; }
      get outdoorAscents() { return source.outdoorAscents; }
      get aiSharing() { return source.aiSharing; }
    }
    const p = buildCoachPromptFor(new GetterSource() as any, { mode: "generate", targetWeekIds: ["2026-W39"], goal: "", history: { fullWeeks: 2, summaryWeeks: 8 }, asOf });
    expect(p).toContain("TARGET WEEKS");
  });
});
