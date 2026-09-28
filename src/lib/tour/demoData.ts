import type {
  Benchmark,
  DailyMetricEntry,
  DayOfWeek,
  ExerciseSlot,
  GoalEvent,
  OutdoorAscent,
  PainLog,
  TrainingBlock,
  TrainingData,
  Workout,
  WorkoutTemplate,
} from "../types";
import {
  BODYWEIGHT_METRIC_ID,
  DATA_EXPORT_VERSION,
  DEFAULT_ANALYTICS_CATEGORIES,
  DEFAULT_BENCHMARK_TYPES,
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_METRIC_DEFS,
  DEFAULT_PHASE_DEFS,
  DEFAULT_TEMPLATES,
} from "../constants";
import { getWeekDates, getWeekId } from "../dateUtils";
import { calculateLoadFactor, workoutPlannedLoad } from "../analytics/load";

/**
 * The example climber the tour shows: two months of training around today
 * (a Capacity → Strength → Deload block behind, Power now, a Font trip
 * ahead), with ratings, daily metrics, benchmarks and sends, so every
 * screen has something real to point at.
 *
 * Built from the app's default catalog rather than the user's, so it looks
 * the same for everyone and never depends on what they renamed or deleted.
 * Pure and deterministic for a given `today` (a seeded generator, not
 * Math.random), so the tour is the same on every run and testable.
 */

const DAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Weeks relative to the current one, and the phase each is in. */
const PLAN: { from: number; to: number; phaseId: string; name: string }[] = [
  { from: -7, to: -5, phaseId: "phase-capacity", name: "Base" },
  { from: -4, to: -2, phaseId: "phase-strength", name: "Strength" },
  { from: -1, to: -1, phaseId: "phase-deload", name: "Deload" },
  { from: 0, to: 2, phaseId: "phase-power", name: "Power" },
  { from: 3, to: 4, phaseId: "phase-performance", name: "Trip prep" },
];

/** How a session in each phase felt: fingers, arms, core, systemic. */
const FEEL: Record<string, [number, number, number, number]> = {
  "phase-capacity": [5, 5, 4, 5],
  "phase-strength": [7, 6, 5, 7],
  "phase-deload": [3, 3, 2, 3],
  "phase-power": [7, 7, 5, 7],
  "phase-performance": [6, 5, 4, 6],
};

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** The Monday (UTC midnight) of the week `offset` weeks from `today`'s. */
function mondayOf(today: Date, offset: number): Date {
  const start = getWeekDates(getWeekId(today))!.start;
  return addDays(start, offset * 7);
}

function dayIndex(day: DayOfWeek | undefined): number {
  return Math.max(0, DAYS.indexOf(day ?? "Monday"));
}

export function buildDemoData(today: Date = new Date()): TrainingData & { exportVersion: string } {
  const rand = seeded(20260926);
  const jitter = (n: number) => Math.max(1, Math.min(10, n + Math.round(rand() * 2 - 1)));
  const todayIso = iso(today);
  const templates: Record<string, WorkoutTemplate[]> = structuredClone(DEFAULT_TEMPLATES);

  const trainingBlocks: TrainingBlock[] = PLAN.map((p, i) => ({
    id: `demo-block-${i}`,
    name: p.name,
    phaseId: p.phaseId,
    startWeekId: getWeekId(mondayOf(today, p.from)),
    endWeekId: getWeekId(mondayOf(today, p.to)),
  }));

  // Every week up to and including this one is stored: past sessions
  // completed (bar one missed), this week's done up to yesterday and still
  // planned from today. Later weeks stay projected from their blocks, as a
  // real plan's would.
  const workouts: Workout[] = [];
  for (const p of PLAN) {
    for (let offset = p.from; offset <= Math.min(p.to, 0); offset++) {
      const monday = mondayOf(today, offset);
      const weekId = getWeekId(monday);
      (templates[p.phaseId] ?? []).forEach((t, ti) => {
        const day = addDays(monday, dayIndex(t.dayOfWeek));
        const missed = offset === -3 && ti === 1;
        const done = iso(day) < todayIso && !missed;
        const exercises: ExerciseSlot[] = t.exercises.map((e, ei) => ({
          ...structuredClone(e),
          id: `demo-${weekId}-${ti}-${ei}`,
          ...(done && e.prescribed
            ? {
                logged: {
                  ...structuredClone(e.prescribed),
                  ...(e.typeId === "free-bouldering" ? { minGrade: "6A", maxGrade: offset >= -4 ? "7A" : "6C+" } : {}),
                },
              }
            : {}),
        }));
        const minutes = exercises.reduce((m, s) => m + (s.prescribed?.duration ?? 0), 0);
        const [fingers, arms, core, systemic] = FEEL[p.phaseId].map(jitter);
        workouts.push({
          id: `demo-${weekId}-${ti}`,
          status: done ? "completed" : "planned",
          date: done ? `${iso(day)}T18:30:00.000Z` : null,
          dayOfWeek: t.dayOfWeek,
          startTime: "18:30",
          weekId,
          notes: t.name ?? "",
          exercises,
          plannedLoad: workoutPlannedLoad(exercises),
          loadFactor: done ? calculateLoadFactor(minutes, fingers, core, systemic) : 0,
          ...(done ? { actualDuration: minutes, fingers, arms, core, systemic } : {}),
          ...(t.description ? { description: t.description } : {}),
        });
      });
    }
  }

  // Sleep, HRV, resting HR and bodyweight for the last four weeks.
  const dailyMetrics: DailyMetricEntry[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = iso(addDays(today, -i));
    const push = (metricId: string, value: number) =>
      dailyMetrics.push({ id: `demo-m-${metricId}-${date}`, metricId, date, value });
    push("sleep-score", Math.round(72 + rand() * 18));
    push("hrv", Math.round(58 + rand() * 14));
    push("rhr", Math.round(49 + rand() * 5));
    if (i % 3 === 0) push(BODYWEIGHT_METRIC_ID, Math.round((68.4 + rand() * 0.8) * 10) / 10);
  }

  const benchmarks: Benchmark[] = [
    [-7, "max-pullups", "Max Pullups", 11, "reps"],
    [-2, "max-pullups", "Max Pullups", 13, "reps"],
    [-7, "lsit-duration", "L-Sit Duration", 18, "s"],
    [-2, "lsit-duration", "L-Sit Duration", 24, "s"],
  ].map(([offset, typeId, type, value, unit], i) => {
    const date = addDays(mondayOf(today, offset as number), 5);
    return { id: `demo-bm-${i}`, typeId: typeId as string, type: type as string, value: value as number, unit: unit as string, date: iso(date), weekId: getWeekId(date) };
  });

  const outdoorAscents: OutdoorAscent[] = (
    [
      [-200, "La Marie-Rose", "6A", "Flash", "Fontainebleau"],
      [-198, "L'Abbé Pierre", "6B", "Redpoint", "Fontainebleau"],
      [-120, "Le Toit du Cul de Chien", "6A+", "Flash", "Fontainebleau"],
      [-90, "Chasseur", "6C", "Redpoint", "Magic Wood"],
      [-89, "Riverbed", "6B+", "Flash", "Magic Wood"],
      [-60, "Roof", "7A", "Redpoint", "Magic Wood"],
      [-30, "Arête", "6C+", "Flash", "Local crag"],
    ] as const
  ).map(([days, name, grade, style, crag], i) => ({ id: `demo-send-${i}`, date: iso(addDays(today, days)), name, grade, style, crag }));

  const tripStart = addDays(mondayOf(today, 4), 5);
  const goals: GoalEvent[] = [
    {
      id: "demo-goal-trip",
      kind: "trip",
      name: "Fontainebleau",
      date: iso(tripStart),
      endDate: iso(addDays(tripStart, 1)),
      location: { name: "Fontainebleau, FR", latitude: 48.4047, longitude: 2.7016 },
      projects: [
        { id: "demo-proj-1", name: "La Marie-Rose", grade: "6A" },
        { id: "demo-proj-2", grade: "7A", flash: false },
      ],
    },
  ];

  const painDate = addDays(mondayOf(today, -3), 3);
  const painLogs: PainLog[] = [
    { id: "demo-pain-1", date: iso(painDate), weekId: getWeekId(painDate), bodyPart: "Left ring finger", severity: 3, notes: "Slight tweak on a crimp, gone after two days" },
  ];

  return {
    workouts,
    trainingBlocks,
    weekOverrides: [],
    weekNotes: [{ weekId: getWeekId(mondayOf(today, -1)), text: "Deload: kept it easy after the strength block." }],
    planAlternatives: [],
    athleteProfile: [],
    coachNotes: [],
    circuits: [],
    goals,
    exerciseTypes: structuredClone(DEFAULT_EXERCISE_TYPES),
    templates,
    phaseDefs: structuredClone(DEFAULT_PHASE_DEFS),
    benchmarks,
    benchmarkTypes: structuredClone(DEFAULT_BENCHMARK_TYPES),
    analyticsCategories: structuredClone(DEFAULT_ANALYTICS_CATEGORIES),
    metricDefs: structuredClone(DEFAULT_METRIC_DEFS),
    dailyMetrics,
    painLogs,
    outdoorAscents,
    exportVersion: DATA_EXPORT_VERSION,
  };
}
