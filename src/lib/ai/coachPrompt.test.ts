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
    expect(p).toContain("2026-W40 (28 Sep – 4 Oct 2026), 2026-W41 (5 – 11 Oct 2026)");
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
    phaseDefs: [], templates: {}, trainingBlocks: [], dismissedSessions: [], weekNotes: [],
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
      get dismissedSessions() { return source.dismissedSessions; }
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

describe("recovery data and other training in the prompt", () => {
  const ASOF = new Date(2026, 9, 24, 12);
  const iso = (d: number) => new Date(Date.UTC(2026, 9, 24) - d * 86400000).toISOString().slice(0, 10);
  const metrics = Array.from({ length: 30 }, (_, i) => [
    { id: `h${i}`, metricId: "hrv", date: iso(i), value: i < 3 ? 60 : 80 },
    { id: `s${i}`, metricId: "sleep-score", date: iso(i), value: 80 },
  ]).flat();
  const activities = [
    { id: "r1", source: "strava", sourceId: "1", date: "2026-10-22", start: "2026-10-22T06:00:00Z", name: "Morning Run", type: "Run", durationSec: 2400, avgHr: 150, distanceM: 7000 },
    { id: "w1", source: "strava", sourceId: "2", date: "2026-10-21", start: "2026-10-21T06:00:00Z", name: "Walk", type: "Walk", durationSec: 3600 },
  ];
  const base = {
    exerciseTypes: [], analyticsCategories: [], phaseDefs: [], templates: {}, trainingBlocks: [], dismissedSessions: [], weekNotes: [], benchmarks: [], goals: [], painLogs: [], outdoorAscents: [], workouts: [],
    dailyMetrics: metrics, externalActivities: activities,
  };
  const history = { fullWeeks: 2, summaryWeeks: 4 };
  const build = (sharing: Record<string, boolean>, detail?: { recovery: string; otherTraining: string }) =>
    buildCoachPromptFor({ ...base, aiSharing: { trainingBlocks: true, competitions: true, readinessMetrics: false, painLogs: false, outdoorAscents: true, notes: true, ...sharing }, aiDetail: detail } as any, { mode: "context", targetWeekIds: [], goal: "", history, asOf: ASOF });

  it("sends nothing about sleep or HRV unless readiness and daily metrics are shared", () => {
    const p = build({});
    expect(p).not.toContain("Recovery Data");
    expect(p).not.toContain("hrvVsBaselinePct");
    // Other training is on by default and is not health data.
    expect(p).toContain("Other Training");
    expect(p).toContain('"kinds":{"run":1,"walk":1}');
  });

  it("brief, standard and full recovery detail grow the prompt, and the pieces are named", () => {
    const brief = build({ readinessMetrics: true }, { recovery: "brief", otherTraining: "summary" });
    const standard = build({ readinessMetrics: true }, { recovery: "standard", otherTraining: "summary" });
    const full = build({ readinessMetrics: true }, { recovery: "full", otherTraining: "summary" });
    expect(brief).toContain("Recovery Data");
    expect(brief).toContain('"lastNight"');
    const recoveryWeekly = /"weekly":\[\{"week":"[^"]+","sleepScore"/;
    expect(brief).not.toMatch(recoveryWeekly);
    expect(standard).toMatch(recoveryWeekly);
    expect(standard).not.toContain('"daily"');
    expect(full).toContain('"daily"');
    expect(brief.length).toBeLessThan(standard.length);
    expect(standard.length).toBeLessThan(full.length);
  });

  it("other training: the list adds each activity, switching it off removes the section", () => {
    const list = build({}, { recovery: "brief", otherTraining: "list" });
    expect(list).toContain('"activities"');
    expect(list).toContain('"minutes":40');
    expect(build({ otherTraining: false })).not.toContain("Other Training");
  });

  it("patterns and weekly reviews can be switched off", () => {
    const on = build({ readinessMetrics: true });
    expect(on).toContain("My Last Weeks In Brief");
    expect(build({ readinessMetrics: true, patterns: false })).not.toContain("My Last Weeks In Brief");
  });
});
