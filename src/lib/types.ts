/**
 * Valid navigation views within the application.
 */
export type ViewType = "home" | "plan" | "add" | "history" | "settings" | "analytics";

/**
 * High-level categorization of exercises for analytics and UI color-coding.
 */
export type ExerciseCategory = string; // Now a string referencing AnalyticsCategory.name

export interface AnalyticsCategory {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
}

/**
 * Supported parameters that can be tracked for a specific exercise modality.
 */
export type ParameterBlock =
  | "duration"
  | "boulderingGrades"
  | "routeGrades"
  // "grades" is the 3.8->3.9 migration's merged target for the two above
  // (see storage.ts) - added here so PARAMETER_LABELS and migrated data
  // type-check. The old names stay too; existing UI still keys off them.
  | "grades"
  | "cadence"
  | "climbingStyle"
  | "boardType"
  | "boardAngle"
  | "variant"
  | "sets"
  | "reps"
  | "holdType"
  | "timeOn"
  | "timeOff"
  | "restTime"
  | "holdSize"
  | "weight"
  | "distance"
  | "campusStyle"
  | "difficulty"
  | "mobilityType"
  | "leadStyle"
  | "movesPerRoute"
  | "routeDifficulty"
  | "bodyweightPercent"
  | "maxWeightPercent";

/**
 * Defines a custom exercise modality, its tracking parameters, and defaults.
 */
export interface ExerciseTypeDef {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Parameters that are added by default when creating this exercise */
  parameters: ParameterBlock[];
  /** All parameters that make sense for this exercise (including defaults). If undefined, assumed equal to parameters. */
  possibleParameters?: ParameterBlock[];
  /** Expected stress scale (1-10) for a standard session of this type */
  defaultPlannedLoad?: number;
  /** Never hard-delete a type once referenced by history - archive it instead. */
  archived?: boolean;
}

/**
 * The tracked-parameter values for a single exercise instance - everything
 * about it except which exercise type it is and whether it's the plan or
 * the log (see `ExerciseSlot`). The whole set moves together: a field never
 * got individually split into "planned" vs "actual" here, so none of them
 * are split differently than any other by this interface.
 */
export interface ExerciseValues {
  notes?: string;
  duration?: number;
  /** The specific planned load (1-10) assigned for this instance */
  plannedLoad?: number;

  // Technique / Bouldering
  minGrade?: string;
  maxGrade?: string;
  cadence?: number; // min/boulder (or routes/hour)
  climbingStyle?: ("Slab" | "Coordination" | "Power" | "Board")[];
  boardType?: "Kilterboard" | "Moonboard" | "Tension Board" | "Spraywall";
  boardAngle?: number; // 20-70

  // Lead Climbing
  leadStyle?: ("Onsight" | "Flash" | "Redpoint" | "Projecting")[];

  // Non-Free / General
  sets?: number;
  /**
   * Reps per set - one number when every set is the same, or an array when
   * they aren't (`[10, 7, 8, 8]` is four sets of weighted pull-ups with
   * what was actually managed in each).
   *
   * The array form is not new: real exports have carried it for months,
   * written by the AI log importer and by hand, against a `number`-only
   * type that quietly tolerated it. The self-paced set timer now produces
   * it deliberately, so the type says what the data has always held.
   *
   * Where the two disagree, an array is authoritative about the set count
   * as well: `sets` is the plan, the array is what happened. Read it
   * through `repsPerSet()` rather than touching it directly.
   */
  reps?: number | number[];
  movesPerRoute?: number;

  // Specific / Hangboard / Weights / Cardio
  holdType?:
    | "Crimp"
    | "Half Crimp"
    | "Full Crimp"
    | "Open Hand"
    | "Sloper"
    | "Pocket";
  timeOn?: number; // Time under tension per rep (seconds)
  timeOff?: number; // Rest between reps (seconds)
  timeBetweenSets?: number; // Rest between sets (seconds)
  weight?: number; // Added weight in kg
  holdSize?: number; // Hold depth in mm
  distance?: number; // Distance in km

  // Campus
  campusType?: "Jumps" | "One Arm Ladders";

  // Core / RPE
  difficulty?: number; // Perceived exertion 1-10
  routeDifficulty?: "Easy" | "Moderate" | "Hard";
  bodyweightPercent?: number; // % of bodyweight (e.g., 100% = bodyweight, 120% = BW + 20% weight)
  maxWeightPercent?: number; // % of 1RM or max weight

  // Mobility
  mobilityType?: ("Hamstrings" | "Shoulders" | "Hips" | "Spine" | "Ankles" | "Wrists")[];
}

/**
 * A single exercise "row" within a workout or template. References its
 * exercise type and (optional) category override by id, never by name -
 * renaming a type/category never requires touching any historical data.
 *
 * Separates the goal from the log: `prescribed` is set at plan time and
 * stays stable; `logged` is what actually happened, edited during/after
 * the session. Editing a workout after the fact no longer silently
 * overwrites the plan it should be compared against.
 */
export interface ExerciseSlot {
  id: string;
  /** -> ExerciseTypeDef.id */
  typeId: string;
  /** -> AnalyticsCategory.id. Overrides the type's default category. */
  categoryId?: string;
  /** Explicitly tracks which parameters are active for this specific instance */
  activeParameters?: ParameterBlock[];
  /** The goal, set at plan time, stable */
  prescribed?: ExerciseValues;
  /** What happened, edited during/after the session */
  logged?: ExerciseValues;
  /**
   * Deliberately not done. Set when a live session skips past this slot
   * (`lib/session/`), and distinct from both "not reached yet" (`logged`
   * undefined, no flag) and "done" (`logged` set): the plan is kept for
   * comparison, but the slot contributes nothing to actual duration or
   * load. Skipping a slot never clears its `prescribed`.
   */
  skipped?: true;
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

/**
 * Represents a full training session containing multiple exercises.
 */
export interface Workout {
  id: string;
  status: "planned" | "completed";
  /** ISO date string of completion, or null if planned */
  date: string | null;
  startTime?: string; // HH:mm format - the planned/actual start time of day
  /**
   * Planned wall-clock length of the session in minutes - what the session
   * is *scheduled* to take, independent of the per-exercise `duration`
   * values that drive `plannedLoad`. Optional: a session with no planned
   * duration is simply open-ended, not zero-length.
   */
  plannedDuration?: number;
  /**
   * How long the session actually ran, in minutes - recorded by a live
   * session (`lib/session/`) as accumulated *unpaused* time, and editable
   * at the finish step before it is committed.
   *
   * The counterpart to `plannedDuration`, never derived from it: absent
   * means "never run live, and not corrected by hand", in which case
   * `sessionDuration()` falls back to summing the logged exercises. Every
   * workout completed before live sessions existed has it absent, so
   * nothing about their reported length changes.
   */
  actualDuration?: number;
  dayOfWeek?: DayOfWeek;
  notes?: string; // Used as the session name
  description?: string; // Extended notes/description for the session
  /** ISO-8601 Week ID (e.g. 2026-W25) linking this to the macrocycle */
  weekId: string;
  /** Actual calculated physiological stress score */
  loadFactor: number;
  /** Pre-calculated planned stress score based on scheduled exercises */
  plannedLoad?: number;
  exercises: ExerciseSlot[];
  /** -> TrainingBlock.id. Set at creation time from whichever block covers this workout's weekId (if any), so block-level analytics are a direct filter instead of a per-query date-range recompute. */
  blockId?: string;
  /**
   * **Transient, never persisted.** Marks a session that is only *projected*
   * from its phase's templates because its week hasn't been materialised
   * yet - see `lib/planning/weekProjection.ts`. Storage strips it
   * (`toStoredWorkout`); a workout read back from storage never has it.
   */
  provisional?: true;

  // Fatigue Metrics (Perceived Exertion after completion)
  fingers?: number; // 1-10
  arms?: number; // 1-10
  core?: number; // 1-10
  systemic?: number; // 1-10
}

/**
 * Calculates the stress/load factor of a workout based on duration and RPE.
 */
export function calculateLoadFactor(
  duration: number | undefined, // in minutes
  fingers: number,
  core: number,
  systemic: number,
): number {
  // 1. Weighted Average: Emphasize the fatigue that dictates recovery time
  const weightedFatigue = fingers * 0.45 + systemic * 0.45 + core * 0.1;

  // 2. Exponential Scaling: Penalize high-intensity fatigue to make the graph realistic
  // Using a power of 1.2 or 1.3 ensures that 8s, 9s, and 10s spike your load graph.
  const intensityScale = Math.pow(weightedFatigue || 5, 1.2);

  // 3. Calculate and round to keep your database and charts clean
  // We use Number() to handle potential string inputs from range sliders or legacy data
  const d = duration !== undefined ? Number(duration) : 60;
  return Math.round(d * intensityScale);
}

/**
 * Calculates the planned load for an exercise based on its duration and planned intensity.
 *
 * Takes the exercise itself (not two positional numbers) because every real
 * call site already called it that way (`calculatePlannedLoad(exercise)`) -
 * the previous two-arg signature didn't match, so `duration` silently
 * received the whole exercise object and `Number(duration)` produced NaN.
 */
export function calculatePlannedLoad(exercise: {
  duration?: number;
  plannedLoad?: number;
}): number {
  // Ensure we have numbers. "0" || 5 in JS is "0", which is a common bug source.
  const d = exercise.duration !== undefined ? Number(exercise.duration) : 60;
  const i = exercise.plannedLoad !== undefined ? Number(exercise.plannedLoad) : 5;
  const intensityScale = Math.pow(i, 1.2);
  return Math.round(d * intensityScale);
}

/**
 * A slot's contribution to its workout's *planned* load.
 *
 * A slot with no `prescribed` block contributes **nothing**: it was never
 * planned. This is the distinction `calculatePlannedLoad(e.prescribed ?? {})`
 * silently destroyed at every aggregation site - `{}` falls through to that
 * function's own 60-minute/intensity-5 defaults, so an unplanned slot
 * contributed ~414 phantom planned load, and a spontaneous session (every
 * slot unplanned) reported a large plan it never had. Exercises added
 * mid-session are the common case for this now: unless the "added exercises
 * inherit what you did" preference is on, they carry no `prescribed` at all
 * and must land as extra load on top of the plan, not as plan.
 */
export function slotPlannedLoad(slot: ExerciseSlot): number {
  return slot.prescribed ? calculatePlannedLoad(slot.prescribed) : 0;
}

/**
 * A slot's contribution to its workout's *actual* load - what was logged,
 * falling back to the plan for a slot that was reached but never explicitly
 * logged. A skipped slot contributes nothing, and neither does one that is
 * neither planned nor logged.
 */
export function slotActualLoad(slot: ExerciseSlot): number {
  if (slot.skipped) return 0;
  const values = slot.logged ?? slot.prescribed;
  return values ? calculatePlannedLoad(values) : 0;
}

/** Sums `slotPlannedLoad` across a workout's slots - the one definition of a workout's planned load. */
export function workoutPlannedLoad(exercises: ExerciseSlot[]): number {
  return (exercises ?? []).reduce((sum, slot) => sum + slotPlannedLoad(slot), 0);
}

/**
 * Defines a macrocycle training phase (e.g. Capacity, Deload). Data, not
 * code (Phase 3 principle 4) - replaces the old closed `PhaseType` union so
 * phases can be added/renamed/archived without shipping code.
 */
export interface PhaseDef {
  id: string;
  name: string;
  color?: string;
  /** For consistent display ordering */
  order?: number;
  /** Never hard-delete a phase once referenced by history - archive it instead. */
  archived?: boolean;
}

/**
 * A concurrent training emphasis spanning one or more weeks (Phase 4).
 * Replaces the old one-phase-per-week `PeriodizationWeek` - multiple blocks
 * can overlap the same week (e.g. a strength block and a skill-maintenance
 * block running side by side), with `priority` deciding which one dominates
 * template selection/display for a week covered by more than one.
 */
export interface TrainingBlock {
  id: string;
  name: string;
  /** -> PhaseDef.id, the primary focus of this block */
  phaseId: string;
  /** ISO-8601 week id, inclusive */
  startWeekId: string;
  /** ISO-8601 week id, inclusive */
  endWeekId: string;
  /** Higher wins when multiple blocks cover the same week. Default 0. */
  priority?: number;
  color?: string;
}

/**
 * A competition or event to peak for (Phase 4).
 */
export interface CompetitionEvent {
  id: string;
  name: string;
  /** ISO date string */
  date: string;
  priority: "A" | "B" | "C";
}

/**
 * Tracks whether a week's auto-generated workouts were manually edited by
 * the user, kept as a **separate, per-week table decoupled from
 * `TrainingBlock`** (Phase 4 - PLAN.md's recommended default for the
 * "what does 'customized' mean once blocks can overlap" question): "has
 * this week been manually edited" stays a per-week concern independent of
 * "what training emphasis covers this week," which is now a per-block
 * concern. Manual edits always take precedence and are never silently
 * overwritten by template/block regeneration.
 */
export interface WeekOverride {
  weekId: string;
  customized: boolean;
}

/**
 * A default/prescribed workout belonging to a phase's template library.
 * Dedicated shape rather than `Partial<Workout>` - a template never had a
 * meaningful `status`/`date`/`loadFactor`/fatigue, so those workout-only
 * fields can no longer leak in by accident.
 */
export interface WorkoutTemplate {
  id: string;
  name?: string;
  dayOfWeek?: DayOfWeek;
  /** Planned time of day, "HH:mm" - carried onto every workout this template generates. */
  startTime?: string;
  /** Planned session length in minutes - carried onto every workout this template generates. */
  plannedDuration?: number;
  /** `logged` is always undefined on a template's slots - templates are pure plans. */
  exercises: ExerciseSlot[];
}

/**
 * Defines a type of benchmark test and its unit of measurement.
 */
export interface BenchmarkTypeDef {
  id: string;
  name: string;
  unit: string;
  archived?: boolean;
}

/**
 * A recorded instance of a benchmark test result.
 */
export interface Benchmark {
  id: string;
  /** References BenchmarkTypeDef.id */
  typeId: string;
  /** Keeping name for display/backwards compatibility during migrations */
  type: string;
  notes?: string;
  value: number;
  unit: string;
  date: string;
  weekId: string;
}

/**
 * Defines a type of daily metric that can be tracked (e.g. sleep score,
 * HRV, bodyweight). "What can be tracked" is data, not code - replaces the
 * old fixed-shape `DailyReadiness`.
 */
export interface MetricDef {
  id: string;
  name: string;
  unit: string;
  archived?: boolean;
}

/**
 * A single recorded value for a `MetricDef` on a given day.
 */
export interface DailyMetricEntry {
  id: string;
  /** -> MetricDef.id */
  metricId: string;
  /** YYYY-MM-DD */
  date: string;
  value: number;
  note?: string;
}

/**
 * A logged instance of pain/discomfort. Deliberately a dedicated entity
 * rather than folded into the generic `MetricDef`/`DailyMetricEntry`
 * system - pain tracking has its own shape (body part, severity, week
 * linkage) that doesn't fit a single numeric value per day.
 */
export interface PainLog {
  id: string;
  date: string;
  weekId: string;
  bodyPart: string;
  /** 1-10 */
  severity: number;
  notes?: string;
}

/**
 * A single outdoor ascent, optionally imported from an 8a.nu CSV export
 * (`src/lib/importers/outdoorAscentCsvImport.ts`) or entered by hand.
 * Deliberately a lightweight log for correlating outdoor performance
 * against training blocks/load - **not** a pyramid-builder or gym-grade
 * tool (see PLAN.md Phase 6's locked-in scope note).
 */
export interface OutdoorAscent {
  id: string;
  /** ISO date string */
  date: string;
  name?: string;
  grade: string;
  /** Readable ascent style, e.g. "Flash"/"Redpoint"/"Onsight" - resolved from the source's style code where possible. */
  style?: string;
  /** Crag/area name */
  crag?: string;
  notes?: string;
}

/**
 * The complete schema for all local user data.
 * Used for exporting and importing full database backups.
 */
export interface TrainingData {
  workouts: Workout[];
  trainingBlocks: TrainingBlock[];
  weekOverrides: WeekOverride[];
  competitionEvents: CompetitionEvent[];
  exerciseTypes: ExerciseTypeDef[];
  templates: Record<string, WorkoutTemplate[]>;
  phaseDefs: PhaseDef[];
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  metricDefs: MetricDef[];
  dailyMetrics: DailyMetricEntry[];
  painLogs: PainLog[];
  outdoorAscents: OutdoorAscent[];
}
