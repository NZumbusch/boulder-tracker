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
  /**
   * -> `ExerciseGroup.id` on the same workout/template. Grouped slots sit
   * next to each other; see `lib/exercise/groups.ts` for the rules.
   */
  groupId?: string;
}

/**
 * Exercises done together in rounds - a circuit, or a superset that fills
 * one exercise's rest with others.
 *
 * The one rule: each member says *what* (one set of it), the group says
 * *when*. A round is one set of each member in list order, `transition`
 * seconds apart, with `roundRest` after it. A member's own set rest is
 * ignored inside a group. Local to the workout or template it sits on;
 * members point at it through `ExerciseSlot.groupId`.
 */
export interface ExerciseGroup {
  id: string;
  /** "Core circuit A" */
  name?: string;
  /** How many rounds. A member with fewer `sets` drops out after its last one. */
  rounds: number;
  /** Seconds between exercises within a round. */
  transition?: number;
  /** Seconds after each round (none after the last). Falls back to `transition`. */
  roundRest?: number;
  /** The saved circuit this group was copied from, if any. */
  circuitId?: string;
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
  /** Circuits/supersets among `exercises` - see `ExerciseGroup`. */
  groups?: ExerciseGroup[];
  /** -> TrainingBlock.id. Set at creation time from whichever block covers this workout's weekId (if any), so block-level analytics are a direct filter instead of a per-query date-range recompute. */
  blockId?: string;
  /**
   * **Transient, never persisted.** Marks a session that is only *projected*
   * from its phase's templates because its week hasn't been materialised
   * yet - see `lib/planning/weekProjection.ts`. Storage strips it
   * (`toStoredWorkout`); a workout read back from storage never has it.
   */
  provisional?: true;
  /**
   * **Transient, never persisted.** Set on a session that only one side of
   * a Plan B has - see `PlanAlternative`. `toStoredWorkout` strips it.
   */
  planB?: PlanBTag;

  // Fatigue Metrics (Perceived Exertion after completion)
  fingers?: number; // 1-10
  arms?: number; // 1-10
  core?: number; // 1-10
  systemic?: number; // 1-10
}

/**
 * Defines a macrocycle training phase (e.g. Capacity, Deload). Data, not
 * code - replaces the old closed `PhaseType` union so
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
 * A concurrent training emphasis spanning one or more weeks.
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
  /** Free text: why this block exists, what it's for. An AI import's contribution is appended with an "AI:" prefix. */
  notes?: string;
}

/** A named place with coordinates - a trip's location (same shape as the weather settings' locations). */
export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Something on a trip worth going for: a named problem (optionally with its
 * grade), or just a grade ("any 7B", optionally flashed). Ticked off by a
 * matching send logged during the trip - see `lib/goals/projects.ts`.
 */
export interface TripProject {
  id: string;
  /** Problem name. Absent for a grade-only target. */
  name?: string;
  grade?: string;
  /** Grade-only target: must be flashed (or onsighted). */
  flash?: boolean;
  /** Sends the user confirmed count for this project despite a fuzzy name match. */
  confirmedSendIds?: string[];
  /** Fuzzy-matching sends the user said do not count. */
  rejectedSendIds?: string[];
}

export type GoalKind = "competition" | "trip";

/**
 * Something to peak for: a competition (one day) or an outdoor trip (a
 * date range - `endDate` may equal `date` for a day trip). One list for
 * both, so the Plan calendar, Home's countdown, the taper hint and the AI
 * prompt treat them alike; trips just carry more.
 */
export interface GoalEvent {
  id: string;
  kind: GoalKind;
  name: string;
  /** Start day, "YYYY-MM-DD". */
  date: string;
  /** Trips: last day, inclusive. Absent = a single day. */
  endDate?: string;
  /** Trips: where - gives the trip its forecast and pre-fills the crag on sends. */
  location?: GeoLocation;
  /** Trips: what to go for. */
  projects?: TripProject[];
  notes?: string;
}

/**
 * Tracks whether a week's auto-generated workouts were manually edited by
 * the user, kept as a **separate, per-week table decoupled from
 * `TrainingBlock`** (the chosen answer to the
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
 * A free-text note about one week - circumstances, ideas, anything that
 * explains the week ("travelling Thu-Sun", "elbow niggly, keep pulling
 * light"). Its own table keyed by `weekId`, like `WeekOverride`, rather
 * than a field on a block or a workout: a note belongs to the week itself,
 * so writing one never materialises a provisional week, and it survives the
 * week being reset, cleared or re-planned under a different block.
 * At most one per week; an empty note is deleted, not stored.
 */
export interface WeekNote {
  weekId: string;
  text: string;
}

/**
 * About me, for the AI coach: what stays true about the athlete and isn't
 * in the logged data - so it isn't restated in every AI chat. One record
 * (id "me"), written by the athlete in Settings -> Coach notes, sent with
 * every AI prompt while the "Coach notes" sharing switch is on.
 */
export interface AthleteProfile {
  id: "me";
  heightCm?: number;
  /** Arm span minus height, cm (can be negative). */
  apeIndexCm?: number;
  /** The year they started climbing. */
  climbingSince?: number;
  maxBoulderIndoor?: string;
  maxBoulderOutdoor?: string;
  /** "Kilter 40°: 7A, Moonboard 2016: 6C+". */
  boardLevels?: string;
  /** Old and current injuries, things to be careful with. */
  injuries?: string;
  /** Days per week, when, where, equipment at home. */
  availability?: string;
  longTermGoals?: string;
  /** What the AI coach should work towards unless told otherwise in a request. */
  standingGoal?: string;
  /** Anything else worth knowing. */
  other?: string;
}

/**
 * One coach note: memory that carries from one AI coaching chat to the
 * next, in any AI app. An AI proposes them in its change set (the athlete
 * ticks each one in the review), or the athlete writes them; at most
 * `MAX_COACH_NOTES`. Sent with every AI prompt; see `lib/ai/coachNotes.ts`.
 */
export interface CoachNote {
  /** Short and stable - the AI refers to notes by it ("k3x9"). */
  id: string;
  text: string;
  /** Who wrote it. The AI is told not to change the athlete's own ones unless asked. */
  source: "ai" | "me";
  /** "YYYY-MM-DD" */
  addedOn: string;
  updatedOn?: string;
}

export type PlanSide = "A" | "B";

/**
 * One difference between Plan A and Plan B on one day of an uncertain
 * stretch. Plan A is whatever the week shows anyway (its phase's sessions or
 * its stored ones); a change says what Plan B does instead.
 *
 *  - `replaces` + `session`: Plan B swaps that Plan A session for this one
 *  - `replaces` alone:       Plan B drops that Plan A session
 *  - `session` alone:        Plan B adds a session
 */
export interface PlanBChange {
  id: string;
  /** Days after the stretch's first day (0 = the first day). */
  offset: number;
  /**
   * The Plan A session this change is about - by name on that day, and by
   * id when it was picked from a known session. The name is what keeps a
   * repeating Plan B working in weeks whose sessions have other ids.
   */
  replaces?: { name: string; id?: string };
  /** Plan B's session that day. Its `dayOfWeek` is ignored - `offset` decides. */
  session?: WorkoutTemplate;
}

/** Per-occurrence state of a Plan B, keyed by the week the occurrence starts in. */
export interface PlanBOccurrence {
  /** Overrides the Plan B's own `likely` for this occurrence. */
  likely?: PlanSide;
  /** Picked by hand. Logging a session that only one plan has decides too, without this. */
  chosen?: PlanSide;
  /** A repeating Plan B that doesn't apply this time. */
  skipped?: true;
}

/**
 * An uncertain stretch of days with two versions of the plan: "outdoor on
 * Saturday if it's dry (then rest Sunday), otherwise board on Saturday and
 * outdoor Sunday".
 *
 * Stored as a rule and applied when a week is read
 * (`lib/planning/planB.ts`), never written into weeks: Plan A is whatever
 * the week shows - projected from its phase or stored - and Plan B is only
 * the differences on top. So a Plan B never materialises a week, crosses
 * week and phase boundaries freely, and keeps working when the phase under
 * it changes later; a change whose Plan A session is gone is flagged, not
 * silently dropped.
 */
export interface PlanAlternative {
  id: string;
  /** "Outdoor if dry". */
  label?: string;
  /** Where the (first) stretch starts. */
  startWeekId: string;
  startDay: DayOfWeek;
  /** How many days the stretch covers, 1-14. */
  days: number;
  /** Repeats every week up to and including this week (the week an occurrence starts in). Absent = once. */
  repeatUntilWeekId?: string;
  changes: PlanBChange[];
  /** The plan the numbers (load, adherence, reminders) use until one is chosen. Default A. */
  likely?: PlanSide;
  /** Which plan is the outdoor one - gets the weather hint and the evening-before reminder. */
  outdoor?: PlanSide;
  /** Keyed by the week an occurrence starts in. */
  occurrences?: Record<string, PlanBOccurrence>;
}

/** Transient marker on a session that belongs to one side of a Plan B (see `lib/planning/planB.ts`). Never persisted. */
export interface PlanBTag {
  altId: string;
  /** The occurrence's key - the week it starts in. */
  occurrence: string;
  side: PlanSide;
  /** This side is the one that counts right now (chosen, or likely while undecided). */
  active: boolean;
  /** One side has been chosen (by hand or by logging a session only one side has). */
  decided: boolean;
  /** A Plan B change whose Plan A session isn't there any more. */
  stale?: true;
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
  /** A note about the session as a whole - carried onto every workout this template generates as its `description`. */
  description?: string;
  /** `logged` is always undefined on a template's slots - templates are pure plans. */
  exercises: ExerciseSlot[];
  /** Circuits/supersets among `exercises` - see `ExerciseGroup`. */
  groups?: ExerciseGroup[];
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
  /**
   * Set on values imported from Health Connect (`lib/health/`). Editing
   * one by hand saves it without this, which makes it yours: the import
   * never overwrites a value that isn't marked as its own.
   */
  source?: "health-connect";
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
 * tool (a deliberate scope limit).
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
  weekNotes: WeekNote[];
  planAlternatives: PlanAlternative[];
  athleteProfile: AthleteProfile[];
  coachNotes: CoachNote[];
  goals: GoalEvent[];
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
