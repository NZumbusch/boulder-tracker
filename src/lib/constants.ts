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
 * One colour per fatigue axis, shared by every fatigue display (Home's bars,
 * History's letters, Analytics' trend chart) so an axis looks the same
 * everywhere. These are chart series colours (src/series.css, slots 3/5/4/6),
 * not status colours - warning, success and primary mean something else.
 */
export const FATIGUE_AXIS_COLORS: Record<(typeof RATING_AXES)[number]["key"], string> = {
  fingers: "var(--color-series-3)",
  arms: "var(--color-series-5)",
  core: "var(--color-series-4)",
  systemic: "var(--color-series-6)",
};

/**
 * Current data model version for exports and migrations.
 */
export const DATA_EXPORT_VERSION = "3.39";

/**
 * Well-known `MetricDef.id` for bodyweight - fixed/stable, same
 * treatment as `sleep-score`/`hrv`/`rhr`: fixed, well-known ids that
 * nothing should re-invent.
 */
export const BODYWEIGHT_METRIC_ID = "bodyweight";

/**
 * Built-in `MetricDef`s, used as `persistence.ts`'s fresh-install default.
 *
 * Every other catalog (`templates`/`phaseDefs`/`exerciseTypes`/`benchmarkTypes`/
 * `analyticsCategories`) defaults from a `DEFAULT_*` constant in
 * `persistence.ts`; `metricDefs` needs the same, because a fresh install skips
 * the migration chain and so never gets the built-in `sleep-score`/`hrv`/`rhr`
 * ids that the `3.17->3.18` migration step seeds for existing installs. (A
 * migration step is frozen once shipped, so that step is left as it is.)
 */
/** Hours asleep, from Health Connect (no sleep score there). Created by the first import that has sleep, not on every install. */
export const SLEEP_DURATION_METRIC: MetricDef = { id: "sleep-duration", name: "Sleep Duration", unit: "h" };
/** Hours of naps that day, from Health Connect: a readiness boost on top of the night, not part of it. */
export const NAP_DURATION_METRIC: MetricDef = { id: "nap-duration", name: "Naps", unit: "h" };

/**
 * Daily values only a wearable gives. Created by the first Garmin import that
 * has them (like sleep duration above) and not part of the daily check-in.
 */
export const STEPS_METRIC: MetricDef = { id: "steps", name: "Steps", unit: "steps" };
export const STRESS_METRIC: MetricDef = { id: "stress", name: "Stress (daily average)", unit: "pts" };
export const BODY_BATTERY_HIGH_METRIC: MetricDef = { id: "body-battery-high", name: "Body Battery (highest)", unit: "pts" };
export const BODY_BATTERY_LOW_METRIC: MetricDef = { id: "body-battery-low", name: "Body Battery (lowest)", unit: "pts" };
export const BREATHING_METRIC: MetricDef = { id: "breathing-sleep", name: "Breathing rate asleep", unit: "br/min" };
export const VO2MAX_METRIC: MetricDef = { id: "vo2max", name: "VO2max (running)", unit: "ml/kg/min" };
export const SLEEP_DEEP_METRIC: MetricDef = { id: "sleep-deep", name: "Deep sleep", unit: "min" };
export const SLEEP_REM_METRIC: MetricDef = { id: "sleep-rem", name: "REM sleep", unit: "min" };
export const WEARABLE_METRIC_DEFS: MetricDef[] = [STEPS_METRIC, STRESS_METRIC, BODY_BATTERY_HIGH_METRIC, BODY_BATTERY_LOW_METRIC, BREATHING_METRIC, VO2MAX_METRIC, SLEEP_DEEP_METRIC, SLEEP_REM_METRIC];

/**
 * The value types that ship with the app. Seeded once (`persistence.ts` for
 * installs that have no table yet); after that they are ordinary defs - edit,
 * archive or delete them like their own.
 */
export const DEFAULT_VALUE_DEFS: ValueDef[] = [
  { id: "elevation", name: "Height / elevation", unit: "m", kind: "number", builtIn: true },
  { id: "speed", name: "Speed", unit: "km/h", kind: "number", builtIn: true },
  { id: "heartRate", name: "Heart rate", unit: "bpm", kind: "number", builtIn: true },
  { id: "count", name: "Count", unit: "", kind: "number", builtIn: true },
  // For benchmark tests (kept in step with `BENCHMARK_VALUE_DEFS`, which the 3.34 migration uses).
  { id: "weight", name: "Weight", unit: "kg", kind: "number", measure: "weight", builtIn: true, uses: ["benchmark"] },
  { id: "reps", name: "Reps", unit: "reps", kind: "number", measure: "reps", builtIn: true, uses: ["benchmark"] },
  { id: "time", name: "Time", unit: "s", kind: "number", measure: "time", builtIn: true, uses: ["benchmark"] },
  { id: "edge", name: "Edge depth", unit: "mm", kind: "number", measure: "length", builtIn: true, uses: ["benchmark"] },
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
 * the others live in defaults.json's `templateLibrary`. The original defaults
 * were an experienced climber's plan (max hangs, campus), too much for a
 * first-time user; that set is kept as "Advanced".
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
