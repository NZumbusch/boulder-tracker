import type { ExerciseTypeDef, PhaseDef, WorkoutTemplate, ParameterBlock, CustomParameter, ValueDef, AnalyticsCategory, BenchmarkTypeDef, MetricDef, DayOfWeek } from "./types";
import defaults from "../data/defaults.json";

/** The week, Monday first - the order the planner, schedule and AI all use. */
export const WEEK_DAYS: DayOfWeek[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The four post-session ratings (1-10), in display order. */
export const RATING_AXES = [
  { key: "fingers", label: "Fingers" },
  { key: "arms", label: "Arms" },
  { key: "core", label: "Core" },
  { key: "systemic", label: "Systemic" },
] as const;

/**
 * One colour per fatigue axis, shared by every fatigue display (Home's
 * bars, Analytics' trend chart) so an axis looks the same everywhere.
 */
export const FATIGUE_AXIS_COLORS: Record<(typeof RATING_AXES)[number]["key"], string> = {
  fingers: "var(--color-warning)",
  arms: "var(--color-tertiary)",
  core: "var(--color-success)",
  systemic: "var(--color-primary)",
};

/**
 * Current data model version for exports and migrations.
 */
export const DATA_EXPORT_VERSION = "3.33";

/**
 * Well-known `MetricDef.id` for bodyweight - fixed/stable, same
 * treatment as `sleep-score`/`hrv`/`rhr`: fixed, well-known ids that
 * nothing should re-invent.
 */
export const BODYWEIGHT_METRIC_ID = "bodyweight";

/**
 * Built-in `MetricDef`s, used as `persistence.ts`'s fresh-install default.
 *
 * Bug fix (found 2026-09-17 while wiring bodyweight tracking): unlike every
 * other catalog (`templates`/`phaseDefs`/`exerciseTypes`/`benchmarkTypes`/
 * `analyticsCategories`, each defaulted from a `DEFAULT_*` constant in
 * `persistence.ts`), `metricDefs` had only ever defaulted to `[]` - the
 * built-in `sleep-score`/`hrv`/`rhr` ids were seeded *only* by the
 * `3.17->3.18` migration step. Combined with the post-Phase-3 fresh-install
 * fix (a true fresh install now skips the whole migration chain), a fresh
 * install got zero built-in `MetricDef`s. This constant is used only as
 * `persistence.ts`'s default for a fresh install - the historical
 * `3.17->3.18` migration step is left untouched (migration steps are
 * frozen once shipped) for existing installs that go through it.
 */
/** Hours asleep, from Health Connect (no sleep score there). Created by the first import that has sleep, not on every install. */
export const SLEEP_DURATION_METRIC: MetricDef = { id: "sleep-duration", name: "Sleep Duration", unit: "h" };
/** Hours of naps that day, from Health Connect: a readiness boost on top of the night, not part of it. */
export const NAP_DURATION_METRIC: MetricDef = { id: "nap-duration", name: "Naps", unit: "h" };

/**
 * The value types that ship with the app. Seeded once (`persistence.ts` for
 * installs that have no table yet); after that they are ordinary defs - edit,
 * archive or delete them like your own.
 */
export const DEFAULT_VALUE_DEFS: ValueDef[] = [
  { id: "elevation", name: "Height / elevation", unit: "m", kind: "number", builtIn: true },
  { id: "speed", name: "Speed", unit: "km/h", kind: "number", builtIn: true },
  { id: "heartRate", name: "Heart rate", unit: "bpm", kind: "number", builtIn: true },
  { id: "count", name: "Count", unit: "", kind: "number", builtIn: true },
];

export const DEFAULT_METRIC_DEFS: MetricDef[] = [
  { id: "sleep-score", name: "Sleep Score", unit: "pts" },
  { id: "hrv", name: "HRV", unit: "ms" },
  { id: "rhr", name: "Resting Heart Rate", unit: "bpm" },
  { id: BODYWEIGHT_METRIC_ID, name: "Bodyweight", unit: "kg" },
];

/**
 * Standard colors for training categories used in charts and indicators.
 */
export const DEFAULT_ANALYTICS_CATEGORIES: AnalyticsCategory[] = defaults.analyticsCategories;

/**
 * Exercise definitions incorporating new climbing styles and board parameters.
 */
export const DEFAULT_EXERCISE_TYPES: ExerciseTypeDef[] = defaults.exerciseTypes as ExerciseTypeDef[];

export const PARAMETER_LABELS: Record<Exclude<ParameterBlock, CustomParameter>, string> = {
  duration: 'Duration',
  boulderingGrades: 'Bouldering Grades',
  routeGrades: 'Route Grades',
  grades: 'Grades',
  variant: 'Variant',
  cadence: 'Cadence',
  climbingStyle: 'Climbing Style',
  boardType: 'Board Type',
  boardAngle: 'Board Angle',
  sets: 'Sets',
  reps: 'Reps',
  holdType: 'Hold Type',
  timeOn: 'Time On',
  timeOff: 'Time Off',
  restTime: 'Rest Time',
  holdSize: 'Hold Size',
  weight: 'Weight',
  distance: 'Distance',
  campusStyle: 'Campus Style',
  mobilityType: 'Mobility Type',
  leadStyle: 'Lead Style',
  difficulty: 'Difficulty/RPE',
  routeDifficulty: 'Route Difficulty',
  bodyweightPercent: 'Bodyweight %',
  maxWeightPercent: 'Max Weight %',
  movesPerRoute: 'Moves per Route'
};

/**
 * Periodized workout templates optimized for high-level training, keyed by PhaseDef.id.
 */
export const DEFAULT_TEMPLATES: Record<string, WorkoutTemplate[]> = defaults.templates as unknown as Record<string, WorkoutTemplate[]>;

/**
 * The 7 built-in macrocycle phases (see PhaseDef).
 */
export const DEFAULT_PHASE_DEFS: PhaseDef[] = defaults.phaseDefs as PhaseDef[];

/**
 * Default benchmark test types.
 */
export const DEFAULT_BENCHMARK_TYPES: BenchmarkTypeDef[] = defaults.benchmarkTypes as BenchmarkTypeDef[];

/**
 * Starter template sets, one per training level, that replace the
 * user's phase templates in one go (welcome screen, Settings → Phases).
 * "Getting started" is the fresh-install default (`DEFAULT_TEMPLATES`);
 * the others live in defaults.json's `templateLibrary`. Decided with the
 * user 2026-09-26: the shipped defaults were an experienced climber's
 * plan (max hangs, campus), too much for a friend trying the app; that
 * set is kept as "Advanced".
 */
export interface TemplateLibrarySet {
  id: string;
  name: string;
  description?: string;
  templates: Record<string, WorkoutTemplate[]>;
}
export const DEFAULT_TEMPLATE_LIBRARY: TemplateLibrarySet[] = [
  {
    id: "getting-started",
    name: "Getting started",
    description: "Two or three sessions a week built around bouldering, with core and mobility. No hangboard or campus board.",
    templates: DEFAULT_TEMPLATES,
  },
  ...(defaults.templateLibrary as unknown as TemplateLibrarySet[]),
];
