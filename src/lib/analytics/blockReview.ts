import type { Benchmark, BenchmarkTypeDef, ExerciseTypeDef, AnalyticsCategory, OutdoorAscent, TrainingBlock, ValueDef, Workout } from "../types";
import { decrementWeekId, getWeekId, toUtcDayIndex, weekDayIsos, weekMondayIso, weekSundayIso } from "../dateUtils";
import { blockFirstWeekId, blockLastWeekId, blockWeekIds } from "../planning/trainingBlocks";
import { isSkippedWorkout, isoDayIndex, workoutDay } from "../planning/weekStatus";
import { WEEK_DAYS } from "../constants";
import { buildWeeklyHistory } from "./weekSummary";
import { benchmarkChanges } from "./progress";
import { parseFontGrade } from "./grades";
import type { WeightUnit } from "../units";
import type { Bodyweight } from "../benchmarks/series";

/**
 * A look back over a training block: what was planned and done, how the
 * load moved, where the time went, which tests changed and what was sent.
 * Pure - Insights, the block list and the AI prompt all read it.
 */

export interface BlockReview {
  blockId: string;
  name: string;
  from: string;
  to: string;
  /** Weeks of the block up to and including the running one. */
  weeks: number;
  /** The block has not finished: its last weeks are still to come. */
  running: boolean;
  /** The block starts or ends part-way through a week: the weekly figures count those weeks whole, the sessions and tests count from the block's own days. */
  partial: boolean;
  sessions: { done: number; planned: number };
  /** Load per week, oldest first, for the weeks that have started. */
  weeklyLoad: { weekId: string; load: number }[];
  /** First week's load to the last full week's, in % - only with two weeks of training. */
  loadChange?: number;
  /** The biggest categories by time, as shares of the block's training time. */
  mix: { name: string; share: number }[];
  tests: { name: string; before: number; after: number; change: number }[];
  sends: { count: number; hardest?: string };
}

export interface BlockReviewInputs {
  block: TrainingBlock;
  asOf: Date;
  workoutsForWeek: (weekId: string) => Workout[];
  workouts: Workout[];
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
  valueDefs: ValueDef[];
  weightUnit: WeightUnit;
  bodyweights?: Bodyweight[];
  ascents: OutdoorAscent[];
}

export function buildBlockReview(input: BlockReviewInputs): BlockReview | undefined {
  const { block, asOf } = input;
  const current = getWeekId(asOf);
  const first = blockFirstWeekId(block);
  const last = blockLastWeekId(block);
  if (first > current) return undefined;
  const weekIds = blockWeekIds(block).filter((w) => w <= current);
  if (weekIds.length === 0) return undefined;
  const todayIndex = isoDayIndex(WEEK_DAYS[(asOf.getDay() + 6) % 7]);

  let done = 0;
  let planned = 0;
  const weeklyLoad = weekIds.map((weekId) => {
    // Sessions count by their own day, so a block that starts or ends mid-week takes only its days of that week (one with no day stays with the week).
    const days = weekDayIsos(weekId);
    const whole = input.workoutsForWeek(weekId);
    const sessions = whole.filter((w) => {
      const d = workoutDay(w);
      const iso = d === undefined ? undefined : days[isoDayIndex(d)];
      return iso === undefined || (iso >= block.startDate && iso <= block.endDate);
    });
    const completed = sessions.filter((w) => w.status === "completed");
    // What was due: a finished week's leftover sessions, or the running week's on days already past.
    const missed = sessions.filter((w) => {
      if (w.status !== "planned" || isSkippedWorkout(w)) return false;
      if (weekId < current) return true;
      const d = workoutDay(w);
      return d !== undefined && isoDayIndex(d) < todayIndex;
    });
    done += completed.length;
    planned += completed.length + missed.length;
    return { weekId, load: whole.filter((w) => w.status === "completed").reduce((s, w) => s + (w.loadFactor || 0), 0) };
  });

  const full = weeklyLoad.filter((w) => w.weekId < current);
  const trained = full.filter((w) => w.load > 0);
  const loadChange = trained.length >= 2 && trained[0].load > 0 ? ((trained[trained.length - 1].load / trained[0].load) - 1) * 100 : undefined;

  const history = buildWeeklyHistory(input.workouts, input.exerciseTypes, input.analyticsCategories, weekIds);
  const minutes: Record<string, number> = {};
  for (const w of history) for (const [cat, m] of Object.entries(w.minutesByCategory ?? {})) minutes[cat] = (minutes[cat] ?? 0) + m;
  const total = Object.values(minutes).reduce((a, b) => a + b, 0);
  const mix = total > 0 ? Object.entries(minutes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, m]) => ({ name, share: m / total })) : [];

  const startDay = toUtcDayIndex(block.startDate);
  const lastWeek = weekIds[weekIds.length - 1];
  const endDay = Math.min(toUtcDayIndex(block.endDate), toUtcDayIndex(weekSundayIso(lastWeek)));
  const tests: BlockReview["tests"] = [];
  for (const s of benchmarkChanges(input.benchmarks, input.benchmarkTypes, 0, endDay, input.valueDefs, input.weightUnit, input.bodyweights ?? [])) {
    const inBlock = s.points.filter((p) => p.day >= startDay);
    if (inBlock.length === 0) continue;
    const base = [...s.points].reverse().find((p) => p.day < startDay) ?? (inBlock.length > 1 ? inBlock[0] : undefined);
    if (!base) continue;
    const last = inBlock[inBlock.length - 1];
    if (last === base) continue;
    tests.push({ name: s.name, before: base.value, after: last.value, change: ((100 + last.pct) / (100 + base.pct) - 1) * 100 });
  }

  const inSends = input.ascents.filter((a) => a.date && toUtcDayIndex(a.date) >= startDay && toUtcDayIndex(a.date) <= endDay);
  let hardest: OutdoorAscent | undefined;
  for (const a of inSends) {
    const rank = parseFontGrade(a.grade);
    if (rank !== undefined && (hardest === undefined || rank > (parseFontGrade(hardest.grade) ?? -Infinity))) hardest = a;
  }

  return {
    blockId: block.id,
    name: block.name,
    from: first,
    to: last,
    weeks: weekIds.length,
    running: last >= current,
    partial: block.startDate !== weekMondayIso(first) || block.endDate !== weekSundayIso(last),
    sessions: { done, planned },
    weeklyLoad,
    ...(loadChange !== undefined ? { loadChange } : {}),
    mix,
    tests,
    sends: { count: inSends.length, ...(hardest ? { hardest: hardest.grade } : {}) },
  };
}

const wk = (id: string) => `W${id.split("-W")[1]}`;
const n0 = (v: number) => Math.round(v).toLocaleString("en");
const signed = (v: number) => `${v >= 0 ? "+" : "-"}${Math.abs(Math.round(v))}%`;

/** The review as plain lines, for the AI and for a notification-sized summary. */
export function blockReviewLines(r: BlockReview): string[] {
  const lines = [`${r.name} ${wk(r.from)}-${wk(r.to)} (${r.weeks} week${r.weeks === 1 ? "" : "s"}${r.running ? ", still running" : ""}${r.partial ? ", starts or ends mid-week" : ""})`];
  if (r.sessions.planned > 0) lines.push(`Sessions: ${r.sessions.done} of ${r.sessions.planned} done (${Math.round((r.sessions.done / r.sessions.planned) * 100)}%)`);
  const loads = r.weeklyLoad.filter((w) => w.load > 0);
  if (loads.length) lines.push(`Load per week: ${loads.map((w) => `${wk(w.weekId)} ${n0(w.load)}`).join(", ")}${r.loadChange !== undefined ? ` (${signed(r.loadChange)} first to last full week)` : ""}`);
  if (r.mix.length) lines.push(`Most time: ${r.mix.map((m) => `${m.name} ${Math.round(m.share * 100)}%`).join(", ")}`);
  for (const t of r.tests) lines.push(`Test ${t.name}: ${signed(t.change)}`);
  if (r.sends.count) lines.push(`Outdoor sends: ${r.sends.count}${r.sends.hardest ? `, hardest ${r.sends.hardest}` : ""}`);
  return lines;
}

/** The most recent block that has ended within `withinWeeks`, or the one running - what is worth reviewing now. */
export function blockToReview(blocks: readonly TrainingBlock[], asOf: Date, withinWeeks = 2): TrainingBlock | undefined {
  const current = getWeekId(asOf);
  const ended = blocks.filter((b) => blockLastWeekId(b) < current).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  if (!ended) return undefined;
  let cutoff = current;
  for (let i = 0; i < withinWeeks; i++) cutoff = decrementWeekId(cutoff);
  return blockLastWeekId(ended) >= cutoff ? ended : undefined;
}
