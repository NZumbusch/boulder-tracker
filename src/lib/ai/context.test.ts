import { describe, it, expect } from "vitest";
import type {
  AnalyticsCategory,
  Benchmark,
  GoalEvent,
  DailyMetricEntry,
  ExerciseTypeDef,
  OutdoorAscent,
  PainLog,
  PhaseDef,
  TrainingBlock,
  Workout,
} from "../types";
import type { AISharingPreferences } from "../preferences/migrate";
import {
  buildExerciseModalities,
  buildArchivedExerciseNames,
  buildAnalyticsCategorySummaries,
  buildRecentWorkouts,
  buildWeeklyHistory,
  buildWorkoutsInWeeks,
  buildBenchmarksInWeeks,
  buildTrainingBlockContext,
  buildGoalContext,
  buildReadinessSnapshot,
  buildPainIssueContext,
  buildOutdoorAscentContext,
  buildAIContextProfile,
  workoutNoteSharing,
  type AIContextSource,
} from "./context";

const asOf = new Date("2026-09-18T12:00:00.000Z");

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-1", name: "Hangboard", category: "Fingers", parameters: ["duration", "sets"] },
  { id: "et-2", name: "Old Move", category: "Other", parameters: [], archived: true },
];

const analyticsCategories: AnalyticsCategory[] = [
  { id: "cat-1", name: "Fingers", color: "red" },
  { id: "cat-2", name: "Old Cat", color: "gray", archived: true },
];

const phaseDefs: PhaseDef[] = [
  { id: "phase-1", name: "Capacity" },
  { id: "phase-2", name: "Retired Phase", archived: true },
];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w-" + Math.random(),
    status: "planned",
    date: null,
    weekId: "2026-W25",
    loadFactor: 0,
    exercises: [],
    ...overrides,
  };
}

describe("buildExerciseModalities", () => {
  it("excludes archived types, and flags one without a how-to", () => {
    const result = buildExerciseModalities(exerciseTypes);
    expect(result).toEqual([{ name: "Hangboard", category: "Fingers", group: "Fingers", params: ["duration", "sets"], noHowTo: true }]);
  });

  it("gives the library group, and no flag once there's a how-to", () => {
    const result = buildExerciseModalities([{ id: "a", name: "Pigeon", category: "Mobility", group: "Stretching", parameters: [], description: "Hips square." }]);
    expect(result).toEqual([{ name: "Pigeon", category: "Mobility", group: "Stretching", params: [] }]);
  });
});

describe("buildArchivedExerciseNames", () => {
  it("lists archived names only, sorted, skipping ones an active exercise shares", () => {
    expect(buildArchivedExerciseNames([
      ...exerciseTypes,
      { id: "z", name: "Another Old", category: "Other", parameters: [], archived: true },
      { id: "h2", name: "hangboard", category: "Fingers", parameters: [], archived: true },
    ])).toEqual(["Another Old", "Old Move"]);
  });
});

describe("buildAnalyticsCategorySummaries", () => {
  it("excludes archived categories", () => {
    expect(buildAnalyticsCategorySummaries(analyticsCategories)).toEqual([{ name: "Fingers" }]);
  });
});

describe("buildRecentWorkouts notes", () => {
  const done = makeWorkout({ id: "n", status: "completed", date: "2026-09-16", weekId: "2026-W38", description: "plan: heavy pulls", logNotes: "  felt strong  " });
  it("sends how it went by default, and the plan note only when asked", () => {
    const [byDefault] = buildRecentWorkouts([done], exerciseTypes, asOf, 2);
    expect(byDefault.howItWent).toBe("felt strong");
    expect(byDefault.planNote).toBeUndefined();
    const [both] = buildRecentWorkouts([done], exerciseTypes, asOf, 2, { logNotes: true, planNotes: true });
    expect(both.planNote).toBe("plan: heavy pulls");
  });
  it("sends neither when both are off", () => {
    const [none] = buildRecentWorkouts([done], exerciseTypes, asOf, 2, { logNotes: false, planNotes: false });
    expect(none.howItWent).toBeUndefined();
    expect(none.planNote).toBeUndefined();
  });
  it("reads the saved switches: log notes on and plan notes off when unset", () => {
    expect(workoutNoteSharing({})).toEqual({ logNotes: true, planNotes: false });
    expect(workoutNoteSharing({ sessionNotes: false, planNotesInHistory: true })).toEqual({ logNotes: false, planNotes: true });
  });
});

describe("buildRecentWorkouts", () => {
  // asOf is 2026-09-18, in 2026-W38.
  it("keeps only completed sessions from the last `fullWeeks` weeks, oldest first", () => {
    const workouts = [
      makeWorkout({ id: "old", status: "completed", date: "2026-09-02", weekId: "2026-W36" }),
      makeWorkout({ id: "b", status: "completed", date: "2026-09-16", weekId: "2026-W38" }),
      makeWorkout({ id: "a", status: "completed", date: "2026-09-09", weekId: "2026-W37" }),
      makeWorkout({ id: "planned", status: "planned", weekId: "2026-W38" }),
    ];
    const result = buildRecentWorkouts(workouts, exerciseTypes, asOf, 2);
    expect(result.map((w) => w.date)).toEqual(["2026-09-09", "2026-09-16"]);
  });

  it("carries load and ratings", () => {
    const completed = makeWorkout({ status: "completed", date: "2026-09-16", weekId: "2026-W38", loadFactor: 42, fingers: 5, arms: 3, core: 4, systemic: 6 });
    const [result] = buildRecentWorkouts([completed], exerciseTypes, asOf, 1);
    expect(result).toMatchObject({ loadFactor: 42, fingers: 5, arms: 3, core: 4, systemic: 6 });
  });

  it("resolves exercise names via typeId, falling back to Unknown", () => {
    const w = makeWorkout({
      status: "completed",
      date: "2026-09-16",
      weekId: "2026-W38",
      exercises: [
        { id: "s1", typeId: "et-1", logged: { duration: 30, sets: 5 } },
        { id: "s2", typeId: "missing", logged: {} },
      ],
    });
    const [result] = buildRecentWorkouts([w], exerciseTypes, asOf, 1);
    expect(result.exercises).toEqual([
      { name: "Hangboard", duration: 30, sets: 5, reps: undefined, plannedLoad: undefined },
      { name: "Unknown", duration: undefined, sets: undefined, reps: undefined, plannedLoad: undefined },
    ]);
  });
});

describe("buildWeeklyHistory", () => {
  const w = (weekId: string, over: Partial<Workout> = {}) =>
    makeWorkout({ status: "completed", date: "2026-08-01", weekId, loadFactor: 100, ...over });

  it("gives one line per week, including weeks with nothing logged, oldest first", () => {
    const result = buildWeeklyHistory([w("2026-W35"), w("2026-W35"), w("2026-W37")], exerciseTypes, analyticsCategories, ["2026-W35", "2026-W36", "2026-W37"]);
    expect(result.map((h) => [h.week, h.sessions, h.load])).toEqual([["2026-W35", 2, 200], ["2026-W36", 0, undefined], ["2026-W37", 1, 100]]);
    expect(result[1]).toEqual({ week: "2026-W36", sessions: 0 });
  });

  it("sums minutes per category and averages the ratings that were given", () => {
    const result = buildWeeklyHistory(
      [
        w("2026-W35", { fingers: 6, exercises: [{ id: "s", typeId: "et-1", logged: { duration: 30 } }] }),
        w("2026-W35", { fingers: 8, core: 3, exercises: [{ id: "t", typeId: "et-1", logged: { duration: 15 } }] }),
        w("2026-W35", { status: "planned", exercises: [{ id: "u", typeId: "et-1", prescribed: { duration: 90 } }] }),
      ],
      exerciseTypes,
      analyticsCategories,
      ["2026-W35"],
    );
    expect(result[0].minutesByCategory).toEqual({ Fingers: 45 });
    expect(result[0].avgRatings).toEqual({ fingers: 7, core: 3 });
  });

  it("names the phase when a resolver is given", () => {
    const [h] = buildWeeklyHistory([], exerciseTypes, analyticsCategories, ["2026-W35"], () => "Power");
    expect(h.phase).toBe("Power");
  });
});

describe("buildWorkoutsInWeeks", () => {
  it("keeps only completed workouts within the given weekIds", () => {
    const inRangeCompleted = makeWorkout({ id: "a", weekId: "2026-W25", status: "completed", date: "2026-06-20" });
    const inRangePlanned = makeWorkout({ id: "b", weekId: "2026-W25", status: "planned" });
    const outOfRange = makeWorkout({ id: "c", weekId: "2026-W30", status: "completed", date: "2026-07-25" });
    const result = buildWorkoutsInWeeks([inRangeCompleted, inRangePlanned, outOfRange], exerciseTypes, ["2026-W25"]);
    expect(result).toHaveLength(1);
    expect(result[0].weekId).toBe("2026-W25");
  });
});

describe("buildBenchmarksInWeeks", () => {
  it("filters by weekId membership", () => {
    const benchmarks: Benchmark[] = [
      { id: "b1", typeId: "t1", type: "Max Hang", value: 10, unit: "kg", date: "2026-06-20", weekId: "2026-W25" },
      { id: "b2", typeId: "t1", type: "Max Hang", value: 12, unit: "kg", date: "2026-07-25", weekId: "2026-W30" },
    ];
    expect(buildBenchmarksInWeeks(benchmarks, ["2026-W25"])).toEqual([benchmarks[0]]);
  });
});

describe("buildTrainingBlockContext", () => {
  const blocks: TrainingBlock[] = [
    { id: "b1", name: "Capacity Block", phaseId: "phase-1", startWeekId: "2026-W20", endWeekId: "2026-W22" },
    { id: "b2", name: "Near Block", phaseId: "phase-1", startWeekId: "2026-W30", endWeekId: "2026-W32" },
    { id: "b3", name: "Far Block", phaseId: "phase-1", startWeekId: "2026-W40", endWeekId: "2026-W42" },
  ];

  it("returns an empty list for an empty weekIds window", () => {
    expect(buildTrainingBlockContext(blocks, phaseDefs, [])).toEqual([]);
  });

  it("includes blocks directly covering the window", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W21"]);
    expect(result.map((b) => b.name)).toContain("Capacity Block");
  });

  it("includes a block near (within the margin of) the window but excludes one that's too far", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W25", "2026-W26"]);
    const names = result.map((b) => b.name);
    expect(names).toContain("Near Block");
    expect(names).not.toContain("Far Block");
  });

  it("resolves phaseName via phaseDefs", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W21"]);
    expect(result[0].phaseName).toBe("Capacity");
  });
});

describe("buildGoalContext", () => {
  it("excludes finished goals, keeps one under way, and sorts soonest-first", () => {
    const goals: GoalEvent[] = [
      { id: "e1", kind: "competition", name: "Past Comp", date: "2026-01-01" },
      { id: "e2", kind: "competition", name: "Later Comp", date: "2026-12-01" },
      { id: "t1", kind: "trip", name: "Ongoing trip", date: "2026-09-15", endDate: "2026-09-20" },
      { id: "e3", kind: "competition", name: "Sooner Comp", date: "2026-10-01" },
    ];
    const result = buildGoalContext(goals, asOf);
    expect(result.map((e) => e.name)).toEqual(["Ongoing trip", "Sooner Comp", "Later Comp"]);
    expect(result[0].daysAway).toBeLessThan(0);
  });

  it("describes a trip's dates, place and projects", () => {
    const trip: GoalEvent = {
      id: "t",
      kind: "trip",
      name: "Font",
      date: "2026-10-05",
      endDate: "2026-10-12",
      location: { name: "Fontainebleau, FR", latitude: 48.4, longitude: 2.7 },
      projects: [{ id: "p1", name: "Big Boss", grade: "7C" }, { id: "p2", grade: "7B", flash: true }],
    };
    expect(buildGoalContext([trip], asOf)[0]).toEqual({
      name: "Font",
      kind: "trip",
      date: "2026-10-05",
      endDate: "2026-10-12",
      location: "Fontainebleau, FR",
      projects: ["Big Boss 7C", "any 7B (flash)"],
      daysAway: 17,
    });
  });

  it("caps at the limit", () => {
    const goals: GoalEvent[] = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, kind: "competition", name: `Event ${i}`, date: `2026-10-0${i + 1}` }));
    expect(buildGoalContext(goals, asOf, 5)).toHaveLength(5);
  });
});

describe("buildReadinessSnapshot", () => {
  it("returns a neutral status with no inputs at all", () => {
    const result = buildReadinessSnapshot([], [], asOf);
    expect(result.score).toBeUndefined();
    expect(result.status).toBe("neutral");
  });

  it("produces trends scoped to the trailing 14 days", () => {
    const dailyMetrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "hrv", date: "2026-09-17", value: 60 },
      { id: "m2", metricId: "hrv", date: "2026-08-01", value: 55 }, // too old
    ];
    const result = buildReadinessSnapshot([], dailyMetrics, asOf);
    expect(result.hrvTrend).toEqual([{ date: "2026-09-17", value: 60 }]);
  });
});

describe("buildReadinessSnapshot with zero entries", () => {
  it("leaves zero readings out of trends and treats today's zero as not logged", () => {
    const today = asOf.toISOString().split("T")[0];
    const dailyMetrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "hrv", date: "2026-09-15", value: 60 },
      { id: "m2", metricId: "hrv", date: "2026-09-16", value: 0 },
      { id: "m3", metricId: "hrv", date: today, value: 0 },
      { id: "m4", metricId: "sleep-score", date: today, value: 0 },
    ];
    const result = buildReadinessSnapshot([], dailyMetrics, asOf);
    expect(result.hrvTrend).toEqual([{ date: "2026-09-15", value: 60 }]);
    expect(result.sleepTrend).toEqual([]);
    // Neither today's HRV nor sleep counts as an input, so there is nothing to score.
    expect(result.score).toBeUndefined();
  });
});

describe("buildPainIssueContext", () => {
  const asOf2 = new Date("2026-09-29T12:00:00");
  it("summarises open issues and recently resolved ones, open first, with their course", () => {
    const logs: PainLog[] = [
      { id: "a", date: "2026-09-10", weekId: "w", bodyPart: "Left A2", severity: 6, issueId: "i1", kinds: ["sharp"], timing: ["during"] },
      { id: "b", date: "2026-09-20", weekId: "w", bodyPart: "Left A2", severity: 3, issueId: "i1", trend: "better", notes: "crimps ok" },
      { id: "c", date: "2026-08-01", weekId: "w", bodyPart: "Knee", severity: 4, issueId: "i2" },
      { id: "d", date: "2026-01-01", weekId: "w", bodyPart: "Old", severity: 4, issueId: "i3" },
    ];
    const issues = [
      { id: "i1", bodyPart: "Left A2", startDate: "2026-09-10", watchCategories: ["Fingers"] },
      { id: "i2", bodyPart: "Knee", startDate: "2026-08-01", endDate: "2026-08-15" },
      { id: "i3", bodyPart: "Old", startDate: "2026-01-01", endDate: "2026-01-10" },
    ];
    const r = buildPainIssueContext(logs, issues, asOf2);
    expect(r.map((x) => x.bodyPart)).toEqual(["Left A2", "Knee"]);
    expect(r[0]).toEqual({ bodyPart: "Left A2", status: "open", since: "2026-09-10", days: 20, now: 3, course: "6 → 3", trend: "improving", feels: ["sharp"], hurts: ["while climbing"], aggravatedBy: ["Fingers"], note: "crimps ok" });
    expect(r[1]).toMatchObject({ status: "resolved", until: "2026-08-15" });
  });

  it("groups loose entries from a source without issues", () => {
    const r = buildPainIssueContext([{ id: "p", date: "2026-09-20", weekId: "w", bodyPart: "Finger", severity: 4 }], undefined, asOf2);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ bodyPart: "Finger", status: "open", now: 4 });
  });
});

describe("buildOutdoorAscentContext", () => {
  it("sorts newest first", () => {
    const ascents: OutdoorAscent[] = [
      { id: "a1", date: "2026-01-01", grade: "7a" },
      { id: "a2", date: "2026-06-01", grade: "7b" },
    ];
    const result = buildOutdoorAscentContext(ascents);
    expect(result[0].grade).toBe("7b");
  });
});

describe("buildAIContextProfile", () => {
  const allSharingOn: AISharingPreferences = {
    trainingBlocks: true,
    competitions: true,
    readinessMetrics: true,
    painLogs: true,
    outdoorAscents: true,
    notes: true,
  };
  const allSharingOff: AISharingPreferences = {
    trainingBlocks: false,
    competitions: false,
    readinessMetrics: false,
    painLogs: false,
    outdoorAscents: false,
    notes: false,
  };

  const source: AIContextSource = {
    exerciseTypes,
    analyticsCategories,
    phaseDefs,
    workouts: [makeWorkout({ status: "completed", date: "2026-09-01", weekId: "2026-W25" })],
    benchmarks: [{ id: "b1", typeId: "t1", type: "Max Hang", value: 10, unit: "kg", date: "2026-06-20", weekId: "2026-W25" }],
    trainingBlocks: [{ id: "tb1", name: "Block", phaseId: "phase-1", startWeekId: "2026-W25", endWeekId: "2026-W25" }],
    goals: [{ id: "e1", kind: "competition", name: "Comp", date: "2026-12-01" }],
    dailyMetrics: [{ id: "m1", metricId: "hrv", date: "2026-09-17", value: 60 }],
    painLogs: [{ id: "p1", date: "2026-09-01", weekId: "2026-W25", bodyPart: "Finger", severity: 4 }],
    outdoorAscents: [{ id: "a1", date: "2026-09-01", grade: "7a" }],
    weekNotes: [],
  };

  it("includes the exercise/phase catalog for generate and context modes", () => {
    expect(buildAIContextProfile("generate", source, allSharingOff, asOf, ["2026-W25"]).exerciseModalities).toBeDefined();
    expect(buildAIContextProfile("context", source, allSharingOff, asOf).exerciseModalities).toBeDefined();
  });

  it("omits the exercise/phase catalog for analyze mode", () => {
    const profile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W25"]);
    expect(profile.exerciseModalities).toBeUndefined();
    expect(profile.analyticsCategories).toBeUndefined();
    expect(profile.phases).toBeUndefined();
  });

  it("omits every sharing-gated section when every toggle is off", () => {
    const profile = buildAIContextProfile("generate", source, allSharingOff, asOf, ["2026-W25"]);
    expect(profile.trainingBlocks).toBeUndefined();
    expect(profile.goals).toBeUndefined();
    expect(profile.readiness).toBeUndefined();
    expect(profile.painIssues).toBeUndefined();
    expect(profile.outdoorAscents).toBeUndefined();
  });

  it("includes every sharing-gated section when every toggle is on", () => {
    const profile = buildAIContextProfile("generate", source, allSharingOn, asOf, ["2026-W25"]);
    expect(profile.trainingBlocks).toBeDefined();
    expect(profile.goals).toBeDefined();
    expect(profile.readiness).toBeDefined();
    expect(profile.painIssues).toBeDefined();
    expect(profile.outdoorAscents).toBeDefined();
  });

  it("windows training blocks/competitions around the current week for context mode (no target range)", () => {
    const profile = buildAIContextProfile("context", source, allSharingOn, asOf);
    // The fixture block covers 2026-W25, well before asOf's week (2026-W38) -
    // out of a "current week" window, so it should not appear.
    expect(profile.trainingBlocks).toEqual([]);
  });

  it("sends recent sessions in full and older weeks as summaries, per the history window - but not for analyze", () => {
    const history = { fullWeeks: 1, summaryWeeks: 4 };
    const recent = { ...source, workouts: [makeWorkout({ status: "completed", date: "2026-09-16", weekId: "2026-W38" }), makeWorkout({ status: "planned", weekId: "2026-W38" })] };
    const profile = buildAIContextProfile("generate", recent, allSharingOff, asOf, ["2026-W39"], {}, history);
    expect(profile.recentWorkouts).toHaveLength(1);
    expect(profile.weeklyHistory?.map((h) => h.week)).toEqual(["2026-W34", "2026-W35", "2026-W36", "2026-W37"]);
    expect(buildAIContextProfile("analyze", recent, allSharingOff, asOf, ["2026-W38"], {}, history).weeklyHistory).toBeUndefined();
    expect(buildAIContextProfile("generate", recent, allSharingOff, asOf, ["2026-W39"], {}, { fullWeeks: 1, summaryWeeks: 0 }).weeklyHistory).toBeUndefined();
  });

  it("scopes recentWorkouts/benchmarks to the target range for analyze, but not generate/context", () => {
    const analyzeProfile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W25"]);
    expect(analyzeProfile.recentWorkouts).toHaveLength(1);
    expect(analyzeProfile.benchmarks).toHaveLength(1);

    const outOfRangeProfile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W01"]);
    expect(outOfRangeProfile.recentWorkouts).toHaveLength(0);
    expect(outOfRangeProfile.benchmarks).toHaveLength(0);
  });
});

describe("notes in the AI profile", () => {
  const source = (overrides: Partial<Parameters<typeof buildAIContextProfile>[1]> = {}) => ({
    exerciseTypes: [],
    analyticsCategories: [],
    phaseDefs: [{ id: "phase-capacity", name: "Capacity" }],
    workouts: [],
    benchmarks: [],
    trainingBlocks: [
      { id: "b1", name: "Base", phaseId: "phase-capacity", startWeekId: "2026-W38", endWeekId: "2026-W41", notes: "Rebuild after the trip" },
    ],
    goals: [],
    dailyMetrics: [],
    painLogs: [],
    outdoorAscents: [],
    weekNotes: [
      { weekId: "2026-W30", text: "Too far back" },
      { weekId: "2026-W36", text: "Four weeks before" },
      { weekId: "2026-W40", text: "Travelling Thu-Sun" },
      { weekId: "2026-W45", text: "Four weeks after" },
      { weekId: "2026-W50", text: "Too far ahead" },
    ],
    ...overrides,
  });
  const sharing = { trainingBlocks: true, competitions: true, readinessMetrics: false, painLogs: false, outdoorAscents: true, notes: true };

  it("includes block notes and the week notes within four weeks of the target range", () => {
    const profile = buildAIContextProfile("generate", source(), sharing, asOf, ["2026-W40", "2026-W41"]);
    expect(profile.trainingBlocks![0].notes).toBe("Rebuild after the trip");
    expect(profile.weekNotes).toEqual([
      { weekId: "2026-W36", text: "Four weeks before" },
      { weekId: "2026-W40", text: "Travelling Thu-Sun" },
      { weekId: "2026-W45", text: "Four weeks after" },
    ]);
  });

  it("leaves every note out when note sharing is off", () => {
    const profile = buildAIContextProfile("generate", source(), { ...sharing, notes: false }, asOf, ["2026-W40"]);
    expect(profile.trainingBlocks![0].notes).toBeUndefined();
    expect(profile.weekNotes).toBeUndefined();
  });
});

import { describeBenchmarks } from "./context";
describe("describeBenchmarks", () => {
  const types = [{ id: "hang", name: "Max Hang", unit: "kg", fields: [{ valueId: "edge", role: "condition" as const }, { valueId: "weight", role: "result" as const }] },
    { id: "circ", name: "Circuit", unit: "s", direction: "lower" as const, fields: [{ valueId: "time", role: "result" as const }] }];
  const defs = [
    { id: "edge", name: "Edge depth", unit: "mm", kind: "number" as const, measure: "length" as const },
    { id: "weight", name: "Weight", unit: "kg", kind: "number" as const, measure: "weight" as const },
    { id: "time", name: "Time", unit: "s", kind: "number" as const, measure: "time" as const },
  ];
  const b = (typeId: string, values?: Record<string, number>) => ({ id: "x", typeId, type: typeId, value: 40, unit: "kg", date: "2026-09-01", weekId: "2026-W36", values });

  it("spells out the conditions in words and drops the ids", () => {
    const [out] = describeBenchmarks([b("hang", { edge: 20, weight: 40 })], types, defs);
    expect(out.conditions).toBe("Edge depth 20 mm");
    expect("values" in out).toBe(false);
  });
  it("says when lower is better, and leaves results of unknown tests as they are", () => {
    expect(describeBenchmarks([b("circ", { time: 90 })], types, defs)[0].better).toBe("lower");
    const [plain] = describeBenchmarks([b("gone")], types, defs);
    expect(plain).toMatchObject({ typeId: "gone", value: 40 });
    expect(plain.conditions).toBeUndefined();
  });
});
