import type {
  AnalyticsCategory,
  Benchmark,
  BenchmarkTypeDef,
  GoalEvent,
  DailyMetricEntry,
  ExerciseTypeDef,
  OutdoorAscent,
  PainLog,
  PainIssue,
  ParameterBlock,
  PhaseDef,
  TrainingBlock,
  ValueDef,
  WeekNote,
  Workout,
} from "../types";
import { slotTypeName, slotValues, logNote } from "../exerciseSlot";
import { otherValuesText, resolveFields } from "../benchmarks/model";
import { repsRepresentative } from "../exercise/reps";
import { hasPerSet, setRows } from "../exercise/setRows";
import { getWeekId, decrementWeekId, incrementWeekId, toUtcDayIndex, localIsoDate } from "../dateUtils";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import { exerciseGroup } from "../exercise/library";
import { customValuesReference } from "./valueSpec";
import { painLevelOn, groupLogsIntoIssues, checkInsFor, issueState, daysBetween, STATUS_LABELS, KIND_LABELS, TIMING_LABELS } from "../pain/issues";
import { buildWeeklyHistory, type WeekHistorySummary } from "../analytics/weekSummary";
export { buildWeeklyHistory, type WeekHistorySummary } from "../analytics/weekSummary";
import {
  computeFatigueDecay,
  computeHrvBaseline,
  computeReadiness,
  type ReadinessConfig,
  type FatigueModel,
  type ReadinessStatus,
} from "../analytics/readiness";
import { calculateRollingAcwr } from "../analytics/loadAnalytics";
import { loggedMetrics } from "../analytics/metricValues";
import { DEFAULT_AI_HISTORY, type AIHistoryWindow, type AISharingPreferences } from "../preferences/migrate";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";

/**
 * Builds the condensed training-profile data embedded in every AI prompt
 * (`AICoachModal.svelte`: "Change plan" / "Analyze" / "Context").
 * Extracted out of the component - pure and independently testable,
 * matching this project's standing "pure data-shaping logic gets tests"
 * convention (`loadAnalytics.ts` is the precedent).
 *
 * Before this module, the prompts predated blocks, goals, metrics and
 * ascents entirely: they sent
 * exercise type names + default parameters, the last 20 workouts reduced to
 * `{date, status, exercise names}` (no duration/sets/reps/load/fatigue), and
 * phase names + benchmarks. Nothing from `TrainingBlock`s, competitions,
 * readiness/daily metrics, pain logs, or outdoor ascents ever reached the
 * AI. This module fills every one of those gaps, gated by two independent
 * axes:
 *
 * - **Mode** (`AIPromptMode`) - "Analyze Past" already scopes itself to a
 *   user-picked week range and doesn't need the full exercise/phase catalog
 *   (it evaluates what *did* happen, not what modalities exist to plan
 *   with) - see `buildAIContextProfile`'s `includeCatalog` branch.
 * - **Sharing preference** (`AISharingPreferences`, `src/lib/preferences/
 *   migrate.ts`) - training-blocks/competitions/readiness-metrics/pain-logs/
 *   outdoor-ascents are each independently opt-in/opt-out, a genuinely
 *   separate privacy decision from "does the AI have enough context" (health-
 *   adjacent data like sleep/HRV/pain logs especially). A disabled category
 *   is simply omitted from the built profile - never sent-but-redacted.
 */

const BLOCK_WINDOW_MARGIN_WEEKS = 4;
const COMPETITION_LOOKAHEAD_LIMIT = 5;
const PAIN_LOG_LIMIT = 10;
const OUTDOOR_ASCENT_LIMIT = 20;
const METRIC_TREND_DAYS = 14;

export type AIPromptMode = "generate" | "analyze" | "context";

// --- Exercise catalog / phases -------------------------------------------

export interface ExerciseModalitySummary {
  name: string;
  category: string;
  /** The library group it's filed under. */
  group: string;
  params: ParameterBlock[];
  /** Only present (true) when it has no how-to yet - the text itself isn't sent, it would cost more than it tells. */
  noHowTo?: true;
}

/** Archived types are excluded - nothing the AI should be offered as a modality to plan with, mirroring how the existing phase list already excludes archived phases. */
export function buildExerciseModalities(exerciseTypes: ExerciseTypeDef[]): ExerciseModalitySummary[] {
  return exerciseTypes
    .filter((t) => !t.archived)
    .map((t) => ({ name: t.name, category: t.category, group: exerciseGroup(t), params: t.parameters, ...(t.description?.trim() ? {} : { noHowTo: true as const }) }));
}

/**
 * Archived exercises by name only - enough for the AI to re-add one (which
 * restores it) instead of inventing a near-duplicate, without spending
 * the space a full entry would.
 */
export function buildArchivedExerciseNames(exerciseTypes: ExerciseTypeDef[]): string[] {
  const active = new Set(exerciseTypes.filter((t) => !t.archived).map((t) => t.name.trim().toLowerCase()));
  return [...new Set(exerciseTypes.filter((t) => t.archived && !active.has(t.name.trim().toLowerCase())).map((t) => t.name))].sort();
}

export interface AnalyticsCategorySummary {
  name: string;
}

/** The list an AI-invented exercise type's optional `categoryName` (`schema.ts`) should be chosen from. */
export function buildAnalyticsCategorySummaries(categories: AnalyticsCategory[]): AnalyticsCategorySummary[] {
  return categories.filter((c) => !c.archived).map((c) => ({ name: c.name }));
}

// --- Workouts --------------------------------------------------------------

export interface RecentWorkoutExerciseSummary {
  name: string;
  /** The circuit/superset it was done in, e.g. "Core A (3 rounds)". */
  circuit?: string;
  duration?: number;
  sets?: number;
  reps?: number;
  plannedLoad?: number;
  /** The athlete's own value types, by id - see `customValuesReference`. */
  custom?: Record<string, number | string>;
}

export interface RecentWorkoutSummary {
  date: string | null;
  status: Workout["status"];
  weekId: string;
  /** The session name (`Workout.notes` - see its own doc comment: "Used as the session name"). */
  name?: string;
  /** Planned/actual start time of day, "HH:mm" - omitted when the session isn't pinned to one. */
  startTime?: string;
  /** Planned wall-clock length of the session in minutes, where one was prescribed. */
  plannedDuration?: number;
  /** Actual calculated stress score - only meaningful once `status` is "completed". */
  loadFactor?: number;
  fingers?: number;
  arms?: number;
  core?: number;
  systemic?: number;
  /** "How it went" (`Workout.logNotes`) - only when sharing it is on. */
  howItWent?: string;
  /** The plan-side note (`Workout.description`) - only when sharing it for past sessions is on. */
  planNote?: string;
  exercises: RecentWorkoutExerciseSummary[];
}

/** Which of a past session's notes go into the prompt. */
export interface WorkoutNoteSharing {
  logNotes: boolean;
  planNotes: boolean;
}

/** The notes switches as `AISharingPreferences` stores them: "how it went" defaults on, the plan note off. */
export function workoutNoteSharing(sharing: Pick<AISharingPreferences, "sessionNotes" | "planNotesInHistory">): WorkoutNoteSharing {
  return { logNotes: sharing.sessionNotes !== false, planNotes: sharing.planNotesInHistory === true };
}

function summarizeWorkout(w: Workout, exerciseTypes: ExerciseTypeDef[], notes: WorkoutNoteSharing = { logNotes: true, planNotes: false }): RecentWorkoutSummary {
  return {
    date: w.date,
    status: w.status,
    weekId: w.weekId,
    name: w.notes || undefined,
    startTime: w.startTime,
    plannedDuration: w.plannedDuration,
    loadFactor: w.status === "completed" ? w.loadFactor : undefined,
    fingers: w.fingers,
    arms: w.arms,
    core: w.core,
    systemic: w.systemic,
    ...(notes.logNotes && w.logNotes?.trim() ? { howItWent: w.logNotes.trim() } : {}),
    ...(notes.planNotes && w.description?.trim() ? { planNote: w.description.trim() } : {}),
    exercises: w.exercises.map((e) => {
      const v = slotValues(e);
      const group = e.groupId ? w.groups?.find((g) => g.id === e.groupId) : undefined;
      return {
        name: slotTypeName(e, exerciseTypes),
        ...(group ? { circuit: `${group.name || "circuit"} (${group.rounds} rounds)` } : {}),
        duration: v.duration,
        sets: v.sets,
        // Reps per set, as before - `sets` is sent beside it, so the total
        // would double-count. Routed through the helper only because the
        // field may now hold one number or one per set.
        reps: repsRepresentative(v.reps),
        // What was lifted: the weight, and the sets one by one when they differed.
        ...(typeof v.weight === "number" ? { weightKg: v.weight } : {}),
        ...(hasPerSet(v) ? { perSet: setRows(v) } : {}),
        plannedLoad: v.plannedLoad,
        ...(v.custom && Object.keys(v.custom).length ? { custom: v.custom } : {}),
        ...(notes.logNotes && logNote(e) ? { howItWent: logNote(e) } : {}),
      };
    }),
  };
}

/** The `count` week ids ending with `lastWeekId`, oldest first. */
function weeksEndingWith(lastWeekId: string, count: number): string[] {
  const ids: string[] = [];
  let id = lastWeekId;
  for (let i = 0; i < count; i++) {
    ids.unshift(id);
    id = decrementWeekId(id);
  }
  return ids;
}

/**
 * The history window around `asOf`: the `fullWeeks` weeks ending with the
 * current one (sent session by session), and the `summaryWeeks` weeks
 * before those (sent one line per week).
 */
export function historyWeekIds(asOf: Date, history: AIHistoryWindow): { full: string[]; summary: string[] } {
  const full = weeksEndingWith(getWeekId(asOf), history.fullWeeks);
  const summary = history.summaryWeeks > 0 ? weeksEndingWith(decrementWeekId(full[0]), history.summaryWeeks) : [];
  return { full, summary };
}

/**
 * Completed sessions from the last `fullWeeks` weeks, oldest first, in full.
 * Planned sessions are left out: upcoming ones are in the plan context
 * already, and a past one that never happened isn't history.
 */
export function buildRecentWorkouts(
  workouts: Workout[],
  exerciseTypes: ExerciseTypeDef[],
  asOf: Date,
  fullWeeks: number,
  notes?: WorkoutNoteSharing,
): RecentWorkoutSummary[] {
  const weeks = new Set(historyWeekIds(asOf, { fullWeeks, summaryWeeks: 0 }).full);
  return workouts
    .filter((w) => w.status === "completed" && weeks.has(w.weekId))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((w) => summarizeWorkout(w, exerciseTypes, notes));
}

/** Completed workouts whose `weekId` falls in `weekIds` - "Analyze Past"'s own scoped window, full detail (not just names). */
export function buildWorkoutsInWeeks(
  workouts: Workout[],
  exerciseTypes: ExerciseTypeDef[],
  weekIds: string[],
  notes?: WorkoutNoteSharing,
): RecentWorkoutSummary[] {
  const targetSet = new Set(weekIds);
  return workouts
    .filter((w) => w.status === "completed" && w.weekId && targetSet.has(w.weekId))
    .map((w) => summarizeWorkout(w, exerciseTypes, notes));
}

/** Benchmarks recorded within `weekIds` - "Analyze Past"'s own scoped window. */
export function buildBenchmarksInWeeks(benchmarks: Benchmark[], weekIds: string[]): Benchmark[] {
  const targetSet = new Set(weekIds);
  return benchmarks.filter((b) => b.weekId && targetSet.has(b.weekId));
}

// --- Training blocks ---------------------------------------------------

export interface TrainingBlockSummary {
  name: string;
  phaseName: string;
  startWeekId: string;
  endWeekId: string;
  /** Only when note sharing is on and the block has one. */
  notes?: string;
}

/** `weekIds`' first and last week, each pushed `BLOCK_WINDOW_MARGIN_WEEKS` further out - the "near the target weeks" window. */
function widenedWindow(weekIds: string[]): { start: string; end: string } {
  const sorted = [...weekIds].sort();
  let start = sorted[0];
  let end = sorted[sorted.length - 1];
  for (let i = 0; i < BLOCK_WINDOW_MARGIN_WEEKS; i++) {
    start = decrementWeekId(start);
    end = incrementWeekId(end);
  }
  return { start, end };
}

/**
 * `TrainingBlock`s covering `weekIds`, or within `BLOCK_WINDOW_MARGIN_WEEKS`
 * weeks either side of it - "covering or near the target weeks" per
 * on purpose, so a block that's about to end or about to start
 * still gives the AI useful context even without literally overlapping.
 * Returns `[]` for an empty `weekIds` (nothing to window around).
 */
export function buildTrainingBlockContext(
  blocks: TrainingBlock[],
  phaseDefs: PhaseDef[],
  weekIds: string[],
  includeNotes = false,
): TrainingBlockSummary[] {
  if (weekIds.length === 0) return [];
  const { start: windowStart, end: windowEnd } = widenedWindow(weekIds);
  const phaseName = (phaseId: string) => phaseDefs.find((p) => p.id === phaseId)?.name ?? "Unknown";
  return blocks
    .filter((b) => b.startWeekId <= windowEnd && windowStart <= b.endWeekId)
    .map((b) => ({
      name: b.name,
      phaseName: phaseName(b.phaseId),
      startWeekId: b.startWeekId,
      endWeekId: b.endWeekId,
      ...(includeNotes && b.notes ? { notes: b.notes } : {}),
    }))
    .sort((a, b) => (a.startWeekId < b.startWeekId ? -1 : a.startWeekId > b.startWeekId ? 1 : 0));
}

/**
 * Week notes for the target weeks and the `BLOCK_WINDOW_MARGIN_WEEKS` either
 * side - the same "near the timeframe" window as blocks, so a note about
 * last week's tweaked elbow or next month's trip reaches the plan. Sorted
 * by week.
 */
export function buildWeekNoteContext(weekNotes: WeekNote[], weekIds: string[]): WeekNote[] {
  if (weekIds.length === 0) return [];
  const { start, end } = widenedWindow(weekIds);
  return weekNotes
    .filter((n) => n.weekId >= start && n.weekId <= end && n.text.trim())
    .map((n) => ({ weekId: n.weekId, text: n.text }))
    .sort((a, b) => (a.weekId < b.weekId ? -1 : a.weekId > b.weekId ? 1 : 0));
}

// --- Competitions --------------------------------------------------------

export interface GoalSummary {
  name: string;
  kind: GoalEvent["kind"];
  /** Start day. */
  date: string;
  /** Trips longer than a day. */
  endDate?: string;
  location?: string;
  /** Trip projects, e.g. "Big Boss 7C", "any 7B (flash)". */
  projects?: string[];
  daysAway: number;
}

/** A project as one readable line for the prompt. */
function projectLabel(p: NonNullable<GoalEvent["projects"]>[number]): string {
  if (p.name) return p.grade ? `${p.name} ${p.grade}` : p.name;
  return `any ${p.grade ?? "grade"}${p.flash ? " (flash)" : ""}`;
}

/**
 * Upcoming goals - competitions and outdoor trips, including one under way
 * - soonest first, capped at `limit`. Trips carry their dates, place and
 * projects so a plan can peak for the trip and train for its problems.
 */
export function buildGoalContext(goals: GoalEvent[], asOf: Date, limit = COMPETITION_LOOKAHEAD_LIMIT): GoalSummary[] {
  const asOfDay = toUtcDayIndex(asOf.toISOString());
  return goals
    .filter((g) => toUtcDayIndex(g.endDate && g.endDate > g.date ? g.endDate : g.date) >= asOfDay)
    .map((g): GoalSummary => ({
      name: g.name,
      kind: g.kind,
      date: g.date,
      ...(g.endDate && g.endDate > g.date ? { endDate: g.endDate } : {}),
      ...(g.location ? { location: g.location.name } : {}),
      ...(g.projects && g.projects.length > 0 ? { projects: g.projects.map(projectLabel) } : {}),
      daysAway: toUtcDayIndex(g.date) - asOfDay,
    }))
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, limit);
}

/** The user's Training model settings, so the prompt's readiness matches the app's. */
export interface ModelOptions {
  readiness?: ReadinessConfig;
  fatigueHalfLife?: number;
  /** Half-life and softening together; wins over `fatigueHalfLife`. */
  fatigueModel?: Partial<FatigueModel>;
}

// --- Readiness / daily metrics --------------------------------------------

export interface MetricTrendPoint {
  date: string;
  value: number;
}

export interface ReadinessSnapshot {
  score?: number;
  status: ReadinessStatus;
  confidence: string;
  advice: string;
  sleepTrend: MetricTrendPoint[];
  /** Hours asleep per night (Health Connect), next to the score - a different unit, so its own series. */
  sleepHoursTrend: MetricTrendPoint[];
  hrvTrend: MetricTrendPoint[];
  rhrTrend: MetricTrendPoint[];
  bodyweightTrend: MetricTrendPoint[];
}

function trendFor(
  dailyMetrics: DailyMetricEntry[],
  metricId: string,
  asOf: Date,
  days = METRIC_TREND_DAYS,
): MetricTrendPoint[] {
  const asOfDay = toUtcDayIndex(asOf.toISOString());
  return loggedMetrics(dailyMetrics)
    .filter((m) => m.metricId === metricId)
    .filter((m) => {
      const day = toUtcDayIndex(m.date);
      return day <= asOfDay && asOfDay - day < days;
    })
    .map((m) => ({ date: m.date, value: m.value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The same readiness computation Home's hero renders (`computeReadiness`,
 * one source of truth - see `readiness.ts`'s own doc comment), plus trailing
 * 14-day sleep/HRV/RHR/bodyweight trends so the AI can see direction, not
 * just a single snapshot value.
 */
export function buildReadinessSnapshot(
  workouts: Workout[],
  allDailyMetrics: DailyMetricEntry[],
  asOf: Date,
  model: ModelOptions = {},
  /** The open pain for readiness - only passed when pain is shared with the AI. */
  pain?: { level: number; label: string },
): ReadinessSnapshot {
  const dailyMetrics = loggedMetrics(allDailyMetrics);
  const todayIso = localIsoDate(asOf);
  const fatigueDecay = computeFatigueDecay(workouts, asOf, model.fatigueModel ?? model.fatigueHalfLife);
  const acwr = calculateRollingAcwr(workouts, asOf);
  const hrvBaseline = computeHrvBaseline(dailyMetrics, asOf);
  const todaysMetric = (metricId: string): number | undefined =>
    dailyMetrics.find((m) => m.metricId === metricId && m.date === todayIso)?.value;
  const readiness = computeReadiness({
    fatigue: { fingers: fatigueDecay.fingers, core: fatigueDecay.core, systemic: fatigueDecay.systemic },
    acwr,
    sleep: todaysMetric("sleep-score"),
    sleepHours: todaysMetric("sleep-duration"),
    napHours: todaysMetric("nap-duration"),
    hrv: todaysMetric("hrv"),
    hrvBaseline,
    pain,
  }, model.readiness);
  return {
    score: readiness.score,
    status: readiness.status,
    confidence: readiness.confidence,
    advice: readiness.advice,
    sleepTrend: trendFor(dailyMetrics, "sleep-score", asOf),
    sleepHoursTrend: trendFor(dailyMetrics, "sleep-duration", asOf),
    hrvTrend: trendFor(dailyMetrics, "hrv", asOf),
    rhrTrend: trendFor(dailyMetrics, "rhr", asOf),
    bodyweightTrend: trendFor(dailyMetrics, BODYWEIGHT_METRIC_ID, asOf),
  };
}

// --- Pain logs / outdoor ascents ------------------------------------------

export interface PainIssueSummary {
  bodyPart: string;
  status: "open" | "resolved";
  since: string;
  until?: string;
  days: number;
  /** Latest check-in, 0-10. */
  now?: number;
  /** The check-ins' severities in order, e.g. "6 → 4 → 3" (the last few). */
  course?: string;
  trend?: string;
  feels?: string[];
  hurts?: string[];
  aggravatedBy?: string[];
  note?: string;
}

/** Resolved issues older than this aren't sent - a healed niggle from last year is noise. */
const PAIN_RESOLVED_DAYS = 90;

/**
 * Pain for the AI as issues, not raw entries: every open one, and those
 * resolved in the last 90 days - each with its dates, where it stands,
 * its course, what it feels like, when it hurts and what aggravates it.
 * Entries without issues (a source from before 3.33) are grouped first.
 */
export function buildPainIssueContext(painLogs: PainLog[], painIssues: PainIssue[] | undefined, asOf: Date, limit = PAIN_LOG_LIMIT): PainIssueSummary[] {
  const grouped = painIssues ? { issues: painIssues, logs: painLogs } : groupLogsIntoIssues(painLogs);
  const today = localIsoDate(asOf);
  return grouped.issues
    .filter((i) => !i.endDate || daysBetween(i.endDate, today) <= PAIN_RESOLVED_DAYS)
    .sort((a, b) => Number(!!a.endDate) - Number(!!b.endDate) || b.startDate.localeCompare(a.startDate))
    .slice(0, limit)
    .map((issue) => {
      const own = checkInsFor(issue.id, grouped.logs);
      const st = issueState(issue, grouped.logs, today);
      const latestWith = <K extends "kinds" | "timing">(k: K) => [...own].reverse().find((l) => l[k]?.length)?.[k];
      const note = [...own].reverse().find((l) => l.notes)?.notes ?? issue.notes;
      return {
        bodyPart: issue.bodyPart,
        status: issue.endDate ? "resolved" as const : "open" as const,
        since: issue.startDate,
        ...(issue.endDate ? { until: issue.endDate } : {}),
        days: st.durationDays + 1,
        ...(st.severity !== undefined ? { now: st.severity } : {}),
        ...(own.length > 1 ? { course: own.slice(-6).map((l) => l.severity).join(" → ") } : {}),
        ...(!issue.endDate ? { trend: STATUS_LABELS[st.status].toLowerCase() } : {}),
        ...(latestWith("kinds") ? { feels: latestWith("kinds")!.map((k) => KIND_LABELS[k].toLowerCase()) } : {}),
        ...(latestWith("timing") ? { hurts: latestWith("timing")!.map((t) => TIMING_LABELS[t].toLowerCase()) } : {}),
        ...(issue.watchCategories?.length ? { aggravatedBy: issue.watchCategories } : {}),
        ...(note ? { note } : {}),
      };
    });
}

export interface OutdoorAscentSummary {
  date: string;
  grade: string;
  style?: string;
  crag?: string;
}

/** Most recent `limit` outdoor ascents, newest first - a grade-history snapshot, not the full log. */
export function buildOutdoorAscentContext(ascents: OutdoorAscent[], limit = OUTDOOR_ASCENT_LIMIT): OutdoorAscentSummary[] {
  return [...ascents]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((a) => ({ date: a.date, grade: a.grade, style: a.style, crag: a.crag }));
}

// --- Orchestrator ----------------------------------------------------------

export interface AIContextSource {
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  phaseDefs: PhaseDef[];
  workouts: Workout[];
  benchmarks: Benchmark[];
  trainingBlocks: TrainingBlock[];
  goals: GoalEvent[];
  dailyMetrics: DailyMetricEntry[];
  painLogs: PainLog[];
  /** Optional so callers from before pain issues keep compiling; trainingState has it. */
  painIssues?: PainIssue[];
  outdoorAscents: OutdoorAscent[];
  weekNotes: WeekNote[];
  /** The athlete's own value types - optional so callers from before them keep compiling. */
  valueDefs?: ValueDef[];
  /** The benchmark tests: with them, results are described by their conditions ("Edge depth 20 mm"). */
  benchmarkTypes?: BenchmarkTypeDef[];
}

/** A benchmark result for a prompt: the stored result, with the names its values lack. */
export type AIBenchmark = Omit<Benchmark, "values"> & {
  /** The other values it was recorded with ("Edge depth 20 mm"), named. */
  conditions?: string;
  /** Present when a lower result is the better one. */
  better?: "lower";
};

/** The results with their conditions spelled out (the ids in `values` mean nothing to a reader). */
export function describeBenchmarks(results: Benchmark[], types: BenchmarkTypeDef[] | undefined, defs: ValueDef[] | undefined): AIBenchmark[] {
  return results.map(({ values, ...b }) => {
    const type = types?.find((t) => t.id === b.typeId);
    if (!type) return b;
    const conditions = values ? otherValuesText({ ...b, values }, resolveFields(type, defs ?? [])) : "";
    return { ...b, ...(conditions ? { conditions } : {}), ...(type.direction === "lower" ? { better: "lower" as const } : {}) };
  });
}

export interface AIContextProfile {
  exerciseModalities?: ExerciseModalitySummary[];
  /** Names only - see `buildArchivedExerciseNames`. */
  archivedExercises?: string[];
  analyticsCategories?: AnalyticsCategorySummary[];
  /** `customValuesReference` text - only when there are value types of the athlete's own. */
  customValues?: string;
  phases?: string[];
  /** Completed sessions in full: the history window's recent weeks, or (analyze) the chosen weeks. */
  recentWorkouts: RecentWorkoutSummary[];
  /** One line per older week - not for analyze, which is scoped to its own weeks. */
  weeklyHistory?: WeekHistorySummary[];
  benchmarks: AIBenchmark[];
  trainingBlocks?: TrainingBlockSummary[];
  goals?: GoalSummary[];
  readiness?: ReadinessSnapshot;
  painIssues?: PainIssueSummary[];
  outdoorAscents?: OutdoorAscentSummary[];
  weekNotes?: WeekNote[];
}

/**
 * Builds the full condensed profile for one AI prompt, gated by `mode` and
 * `sharing`. Pure - the caller (`lib/ai/coachPrompt.ts`) owns the
 * surrounding prompt text (goal, framing, output instructions) and just
 * `JSON.stringify`s whichever fields of this profile it renders.
 *
 * `targetWeekIds` is the modal's own selected week range - required
 * (non-empty) for "generate"/"analyze" (both are always built from an
 * explicit range in the UI); omitted for "context", which has no range to
 * scope to, so training-block/competition windowing there uses the single
 * current week instead - the profile still surfaces the athlete's *current*
 * block/upcoming events rather than nothing.
 */
export function buildAIContextProfile(
  mode: AIPromptMode,
  source: AIContextSource,
  sharing: AISharingPreferences,
  asOf: Date,
  targetWeekIds: string[] = [],
  model: ModelOptions = {},
  history: AIHistoryWindow = DEFAULT_AI_HISTORY,
): AIContextProfile {
  // "Analyze Past" already scopes itself to the picked week range and
  // doesn't need the full exercise/phase catalog.
  const includeCatalog = mode !== "analyze";

  const noteSharing = workoutNoteSharing(sharing);
  const recentWorkouts =
    mode === "analyze"
      ? buildWorkoutsInWeeks(source.workouts, source.exerciseTypes, targetWeekIds, noteSharing)
      : buildRecentWorkouts(source.workouts, source.exerciseTypes, asOf, history.fullWeeks, noteSharing);

  const benchmarks =
    mode === "analyze" ? buildBenchmarksInWeeks(source.benchmarks, targetWeekIds) : source.benchmarks;

  const windowWeekIds = mode === "context" ? [getWeekId(asOf)] : targetWeekIds;

  const profile: AIContextProfile = { recentWorkouts, benchmarks: describeBenchmarks(benchmarks, source.benchmarkTypes, source.valueDefs) };

  if (mode !== "analyze" && history.summaryWeeks > 0) {
    const phaseOf = sharing.trainingBlocks
      ? (weekId: string) => source.phaseDefs.find((p) => p.id === getDominantBlockForWeek(source.trainingBlocks, weekId)?.phaseId)?.name
      : undefined;
    profile.weeklyHistory = buildWeeklyHistory(source.workouts, source.exerciseTypes, source.analyticsCategories, historyWeekIds(asOf, history).summary, phaseOf);
  }

  if (includeCatalog) {
    profile.exerciseModalities = buildExerciseModalities(source.exerciseTypes);
    const archived = buildArchivedExerciseNames(source.exerciseTypes);
    if (archived.length) profile.archivedExercises = archived;
    profile.analyticsCategories = buildAnalyticsCategorySummaries(source.analyticsCategories);
    const customValues = customValuesReference(source.valueDefs ?? []);
    if (customValues) profile.customValues = customValues;
    profile.phases = source.phaseDefs.filter((p) => !p.archived).map((p) => p.name);
  }
  if (sharing.trainingBlocks) {
    profile.trainingBlocks = buildTrainingBlockContext(source.trainingBlocks, source.phaseDefs, windowWeekIds, sharing.notes);
  }
  if (sharing.competitions) {
    profile.goals = buildGoalContext(source.goals, asOf);
  }
  if (sharing.readinessMetrics) {
    profile.readiness = buildReadinessSnapshot(source.workouts, source.dailyMetrics, asOf, model,
      sharing.painLogs ? painLevelOn(source.painIssues ?? [], source.painLogs, localIsoDate(asOf)) : undefined);
  }
  if (sharing.painLogs) {
    profile.painIssues = buildPainIssueContext(source.painLogs, source.painIssues, asOf);
  }
  if (sharing.outdoorAscents) {
    profile.outdoorAscents = buildOutdoorAscentContext(source.outdoorAscents);
  }
  if (sharing.notes) {
    profile.weekNotes = buildWeekNoteContext(source.weekNotes, windowWeekIds);
  }
  return profile;
}
