import { describe, it, expect } from "vitest";
import type { ExerciseSlot, ExerciseTypeDef, Workout } from "../types";
import { buildDemoData } from "../tour/demoData";
import { analysisAsOf, buildAIContextProfile, exerciseDetails, summarizeWorkout, type AIContextSource } from "./context";
import { buildCoachPrompt } from "./coachPrompt";
import { promptBreakdown } from "./promptSize";

const hang: ExerciseTypeDef = { id: "hb", name: "Max Hangs", category: "Fingers", parameters: ["sets", "timeOn"] } as ExerciseTypeDef;

function workout(logged: ExerciseSlot["logged"]): Workout {
  return { id: "w", status: "completed", date: "2026-10-13", weekId: "2026-W42", loadFactor: 100, exercises: [{ id: "s", typeId: "hb", logged } as ExerciseSlot] } as Workout;
}

describe("exercise details in completed sessions", () => {
  it("sends hang time, rest, hold and edge, not just sets and reps", () => {
    const [e] = summarizeWorkout(workout({ sets: 5, timeOn: 10, timeBetweenSets: 180, holdType: "Half Crimp", holdSize: 20, bodyweightPercent: 120 }), [hang]).exercises;
    expect(e).toMatchObject({ name: "Max Hangs", sets: 5, timeOn: 10, timeBetweenSets: 180, holdType: "Half Crimp", holdSize: 20, bodyweightPercent: 120 });
  });

  it("sends grades, board and style for bouldering, and leaves empty fields out", () => {
    const d = exerciseDetails({ minGrade: "6A", maxGrade: "6C", boardType: "Kilterboard", boardAngle: 40, climbingStyle: ["Power"], mobilityType: [], holdType: undefined });
    expect(d).toEqual({ minGrade: "6A", maxGrade: "6C", boardType: "Kilterboard", boardAngle: 40, climbingStyle: ["Power"] });
  });

  it("does not repeat a field that differs per set - the per-set rows have it", () => {
    const [e] = summarizeWorkout(workout({ sets: 3, reps: [6, 5, 4], timeOn: 10, holdSize: 20 }), [hang]).exercises as unknown as Record<string, unknown>[];
    expect(e.perSet).toHaveLength(3);
    expect(e).not.toHaveProperty("timeOn");
    expect(e).not.toHaveProperty("holdSize");
  });
});

describe("Analyze Past", () => {
  const asOf = new Date(2026, 9, 24, 12);
  const d = buildDemoData(asOf) as unknown as AIContextSource;
  const sharing = { trainingBlocks: true, competitions: true, readinessMetrics: true, painLogs: false, outdoorAscents: true, notes: true } as never;

  it("looks from the end of the last target week, or now when it isn't over", () => {
    expect(analysisAsOf(["2026-W40", "2026-W41"], asOf).getDate()).toBe(11);
    expect(analysisAsOf(["2026-W43"], asOf).getTime()).toBe(asOf.getTime());
    expect(analysisAsOf([], asOf)).toBe(asOf);
  });

  it("reads recovery as of those weeks, and gives each analysed week its review lines", () => {
    const p = buildAIContextProfile("analyze", d, sharing, asOf, ["2026-W40", "2026-W41"]);
    const night = String(p.recovery?.lastNight?.date);
    expect(night <= "2026-10-11" && night >= "2026-10-08").toBe(true);
    expect(p.weeklyReviews?.map((r) => r.week)).toEqual(["2026-W40", "2026-W41"]);
    expect(p.patterns).toBeUndefined();
  });

  it("includes other training for the analysed weeks", () => {
    const day = new Date(2026, 9, 7, 8);
    const activity = { id: "a", source: "garmin", sourceId: "1", date: "2026-10-07", start: day.toISOString(), name: "Run", type: "Run", durationSec: 3000, avgHr: 150, maxHr: 175 };
    const p = buildAIContextProfile("analyze", { ...d, externalActivities: [activity] } as never, sharing, asOf, ["2026-W41"]);
    expect(p.otherTraining?.weekly.map((w) => w.week)).toEqual(["2026-W41"]);
  });
});

describe("one home for each reading", () => {
  const asOf = new Date(2026, 9, 24, 12);
  const d = buildDemoData(asOf) as unknown as AIContextSource;
  const sharing = { trainingBlocks: true, competitions: true, readinessMetrics: true, painLogs: false, outdoorAscents: true, notes: true } as never;

  it("rounds the readiness score and drops its trends when Recovery carries them", () => {
    const p = buildAIContextProfile("context", d, sharing, asOf);
    expect(p.recovery).toBeDefined();
    expect(Number.isInteger(p.readiness?.score)).toBe(true);
    expect(p.readiness).not.toHaveProperty("hrvTrend");
    expect(p.readiness).not.toHaveProperty("sleepTrend");
  });

  it("also drops them at the brief level, which still has last night and the averages", () => {
    const p = buildAIContextProfile("context", d, sharing, asOf, [], { detail: { recovery: "brief", otherTraining: "summary" } });
    expect(p.recovery).toBeDefined();
    expect(p.readiness).not.toHaveProperty("rhrTrend");
  });

  it("drops the weekly review lines that Recovery's weekly rows repeat, keeping HRV", () => {
    const p = buildAIContextProfile("context", d, sharing, asOf);
    const lines = p.weeklyReviews!.flatMap((r) => r.lines);
    expect(lines.some((l) => /^Sleep score|^Resting heart rate|^Weight/.test(l))).toBe(false);
    expect(lines.some((l) => l.startsWith("HRV"))).toBe(true);
  });
});

describe("prompt breakdown and legend", () => {
  it("names every profile section, so a part is not counted under the one above it", () => {
    const prompt = ["My training profile:", "- Readiness Snapshot:", "a".repeat(100), "- Recovery Data (x):", "b".repeat(700), "- Other Training (x):", "c".repeat(350), "- My Last Weeks In Brief (x):", "d".repeat(70), "- Upcoming Goals (x):", "e".repeat(35)].join("\n");
    const labels = promptBreakdown(prompt).map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(["Readiness snapshot", "Recovery", "Other training", "Last weeks in brief", "Goals"]));
  });

  it("explains load and the four ratings next to the sessions", () => {
    const profile = { recentWorkouts: [], benchmarks: [] };
    for (const mode of ["generate", "analyze", "context"] as const) {
      expect(buildCoachPrompt({ mode, profile, targetWeekIds: ["2026-W40"], goal: "" })).toContain("fingers/arms/core/systemic = those ratings 1-10");
    }
  });
});
