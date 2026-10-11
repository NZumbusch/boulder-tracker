import type {
  AnalyticsCategory, Benchmark, BenchmarkTypeDef, DailyMetricEntry, ExerciseSlot, ExerciseTypeDef, OutdoorAscent, ValueDef, Workout,
  TrainingTargets,
} from "../types";
import type { WeightUnit } from "../units";
import { getWeekDates, getWeekId, decrementWeekId, toUtcDayIndex } from "../dateUtils";
import { calculateRollingAcwr, CONSECUTIVE_TRAINING_DAY_THRESHOLD } from "./loadAnalytics";
import { computeFatigueDecay, computeHrvBaseline, type FatigueModel } from "./readiness";
import { workoutPlannedLoad, workoutActualLoad } from "./load";
import { loggedMetrics } from "./metricValues";
import { benchmarkChanges, sendsSummary } from "./progress";
import { plannedTestsByType, testStatuses, DEFAULT_RETEST_WEEKS } from "../benchmarks/testSlot";
import { bodyweightsOf } from "../benchmarks/series";
import { isSkippedWorkout, workoutDay, isoDayIndex } from "../planning/weekStatus";
import { slotTypeName, slotValues } from "../exerciseSlot";
import { setRows } from "../exercise/setRows";
import { parseFontGrade } from "./grades";
import { WEEK_DAYS } from "../constants";
import { hasTargets, isFingerSession, mixGaps, weekProgress } from "./targets";
import { buildWeeklyHistory } from "./weekSummary";

/**
 * Insights: plain-language findings from the athlete's own data, one list
 * for the four things they open Analytics to answer - should I push or rest
 * today, am I getting stronger, am I following a balanced plan, how are
 * climbing and recovery going. Every finding is a fixed rule over numbers
 * the app already computes (nothing is invented or AI-written), carries
 * the numbers it rests on, and says which chart or sheet to open for more.
 * Thresholds that are a matter of taste come in `config`.
 */

export type InsightGroup = "push" | "strength" | "plan" | "body";
export type InsightTone = "risk" | "caution" | "good" | "info";

/** Where tapping a finding goes: the ACWR sheet, or a chart on one of the Analytics tabs. */
export type InsightLink =
  | { kind: "acwr" }
  | { kind: "plan" }
  | { kind: "panel"; tab: "training" | "body" | "performance"; section: string };

export interface Insight {
  id: string;
  group: InsightGroup;
  tone: InsightTone;
  title: string;
  detail?: string;
  link?: InsightLink;
}

export interface InsightConfig {
  acwrZones: { sweetMin: number; caution: number; highRisk: number };
  fatigueModel: FatigueModel;
  /** A category you train regularly, untouched this many days. */
  staleDays: number;
  /** 4-week plan adherence under this (0-1) is called out. */
  adherenceLow: number;
  hrvDip: number;
  sleepLow: number;
  /** A test is due this many weeks after its last result. */
  retestWeeks: number;
}

export const DEFAULT_INSIGHT_CONFIG: Omit<InsightConfig, "fatigueModel"> = {
  acwrZones: { sweetMin: 0.8, caution: 1.3, highRisk: 1.5 },
  staleDays: 14,
  adherenceLow: 0.6,
  hrvDip: 0.1,
  sleepLow: 60,
  retestWeeks: DEFAULT_RETEST_WEEKS,
};

export interface InsightInputs {
  asOf: Date;
  /** Every session ever (completed ones count; planned ones are read through `workoutsForWeek`). */
  workouts: Workout[];
  /** A week's sessions as the plan shows them (`getWorkoutsForWeek`): planned and completed. */
  workoutsForWeek: (weekId: string) => Workout[];
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
  valueDefs: ValueDef[];
  weightUnit: WeightUnit;
  dailyMetrics: DailyMetricEntry[];
  ascents: OutdoorAscent[];
  /** The weekly targets, if the athlete set any, and the categories that count as finger work. */
  targets?: TrainingTargets;
  fingerIds?: Iterable<string>;
  config: InsightConfig;
}

const TONE_ORDER: Record<InsightTone, number> = { risk: 0, caution: 1, info: 2, good: 3 };
const DAY_MS = 86_400_000;
const n0 = (v: number) => Math.round(v).toLocaleString("en");
const dayIndex = (asOf: Date) => toUtcDayIndex(asOf.toISOString());

function zoneTone(ratio: number, z: InsightConfig["acwrZones"]): InsightTone {
  if (ratio > z.highRisk) return "risk";
  if (ratio > z.caution) return "caution";
  if (ratio >= z.sweetMin) return "good";
  return "info";
}

function zoneName(ratio: number, z: InsightConfig["acwrZones"]): string {
  if (ratio > z.highRisk) return "high risk";
  if (ratio > z.caution) return "caution";
  if (ratio >= z.sweetMin) return "the sweet spot";
  return "low";
}

// --- Push or rest ----------------------------------------------------------------

function acwrInsight(i: InsightInputs): Insight {
  const r = calculateRollingAcwr(i.workouts, i.asOf);
  const link: InsightLink = { kind: "acwr" };
  if (!r.sufficient || r.ratio === undefined) {
    return {
      id: "acwr",
      group: "push",
      tone: "info",
      title: "Load ratio not counted yet",
      detail: r.insufficientReason === "break"
        ? `Only ${r.activeWeeks} of the last 4 weeks have a session (3 are needed), so your usual week is too small to compare with.`
        : "It needs 28 days of logged sessions to mean anything.",
      link,
    };
  }
  const tone = zoneTone(r.ratio, i.config.acwrZones);
  return {
    id: "acwr",
    group: "push",
    tone,
    title: `Load is ${r.ratio.toFixed(2)}× your usual week`,
    detail: `${zoneName(r.ratio, i.config.acwrZones)[0].toUpperCase()}${zoneName(r.ratio, i.config.acwrZones).slice(1)}: ${n0(r.acuteLoad)} in the last 7 days against ${n0(r.chronicLoad)} on average over 4 weeks.`,
    link,
  };
}

/**
 * Rated load runs above or below the exercise estimate a plan is made of;
 * this is how much, over the last sessions, so a planned session can be put
 * on the same scale as logged ones.
 */
export function ratingScale(workouts: Workout[], limit = 8): number {
  const recent = workouts
    .filter((w) => w.status === "completed" && w.date && w.loadFactor > 0)
    .sort((a, b) => b.date!.localeCompare(a.date!))
    .slice(0, limit);
  const estimate = recent.reduce((s, w) => s + workoutActualLoad(w.exercises, w.groups), 0);
  const rated = recent.reduce((s, w) => s + w.loadFactor, 0);
  if (estimate <= 0 || rated <= 0) return 1;
  return Math.min(2, Math.max(0.5, rated / estimate));
}

/** What ACWR becomes by Sunday if the rest of the week's planned sessions are done. */
function whatIfInsight(i: InsightInputs): Insight | undefined {
  const weekId = getWeekId(i.asOf);
  const dates = getWeekDates(weekId);
  if (!dates) return undefined;
  const today = i.asOf.getDay();
  const todayIndex = isoDayIndex(WEEK_DAYS[(today + 6) % 7]);
  const left = i.workoutsForWeek(weekId).filter((w) => {
    if (w.status !== "planned" || isSkippedWorkout(w)) return false;
    const day = workoutDay(w);
    return day !== undefined && isoDayIndex(day) >= todayIndex;
  });
  if (left.length === 0) return undefined;
  const scale = ratingScale(i.workouts);
  const startMs = dates.start.getTime();
  const simulated: Workout[] = left.map((w) => {
    const idx = isoDayIndex(workoutDay(w)!);
    return {
      ...w,
      status: "completed" as const,
      date: new Date(startMs + idx * DAY_MS).toISOString().slice(0, 10),
      loadFactor: workoutPlannedLoad(w.exercises, w.groups) * scale,
    };
  });
  const added = simulated.reduce((s, w) => s + w.loadFactor, 0);
  const real = i.workouts.filter((w) => !simulated.some((s) => s.id === w.id));
  const end = new Date(dates.end.getUTCFullYear(), dates.end.getUTCMonth(), dates.end.getUTCDate(), 12);
  const after = calculateRollingAcwr([...real, ...simulated], end);
  if (!after.sufficient || after.ratio === undefined) return undefined;
  return {
    id: "whatif",
    group: "push",
    tone: zoneTone(after.ratio, i.config.acwrZones),
    title: `Rest of the week as planned: ratio ${after.ratio.toFixed(2)}`,
    detail: `${left.length} session${left.length === 1 ? "" : "s"} left, about ${n0(added)} load${Math.abs(scale - 1) > 0.15 ? ` (your ratings usually run ${scale.toFixed(1)}× the plan's estimate)` : ""}. An estimate: lighten a session if it lands in the red.`,
    link: { kind: "acwr" },
  };
}

function fatigueInsight(i: InsightInputs): Insight | undefined {
  const completed = i.workouts.filter((w) => w.status === "completed" && w.date);
  const f = computeFatigueDecay(completed, i.asOf, i.config.fatigueModel);
  const areas: [string, number][] = [];
  for (const [label, v] of [["Fingers", f.fingers], ["Arms", f.arms], ["Core", f.core], ["Systemic", f.systemic]] as [string, number | undefined][]) {
    if (v !== undefined) areas.push([label, v]);
  }
  if (areas.length === 0) return undefined;
  const [name, value] = [...areas].sort((a, b) => b[1] - a[1])[0];
  const tone: InsightTone = value >= 8.5 ? "risk" : value >= 7 ? "caution" : value < 4 ? "good" : "info";
  return {
    id: "fatigue",
    group: "push",
    tone,
    title: tone === "good" ? "Fresh: no area above 4/10" : `${name} fatigue ${value.toFixed(1)}/10`,
    detail: tone === "good" ? `Highest is ${name.toLowerCase()} at ${value.toFixed(1)}/10.` : "From your recent session ratings, fading as you rest.",
    link: { kind: "panel", tab: "training", section: "section-fatigue" },
  };
}

function streakInsight(i: InsightInputs): Insight | undefined {
  const days = new Set(i.workouts.filter((w) => w.status === "completed" && w.date).map((w) => toUtcDayIndex(w.date!)));
  const today = dayIndex(i.asOf);
  let run = 0;
  // A run that includes today counts, and so does one that ended yesterday.
  for (let d = days.has(today) ? today : today - 1; days.has(d); d--) run++;
  if (run < CONSECUTIVE_TRAINING_DAY_THRESHOLD) return undefined;
  return { id: "streak", group: "push", tone: "caution", title: `${run} training days in a row`, detail: "A rest day soon keeps recovery ahead of load." };
}

// --- Getting stronger ------------------------------------------------------------

/** The one number to follow for an exercise: its heaviest set, else its longest hold, else its most reps. */
function bestOfSlot(slot: ExerciseSlot): { value: number; unit: "kg" | "s" | "reps" } | undefined {
  if (slot.skipped || !slot.logged) return undefined;
  const rows = setRows(slotValues(slot), ["weight", "timeOn", "reps"]);
  const max = (k: "weight" | "timeOn" | "reps") => Math.max(0, ...rows.map((r) => r[k] ?? 0));
  if (max("weight") > 0) return { value: max("weight"), unit: "kg" };
  if (max("timeOn") > 0) return { value: max("timeOn"), unit: "s" };
  if (max("reps") > 0) return { value: max("reps"), unit: "reps" };
  return undefined;
}

function recordInsights(i: InsightInputs): Insight[] {
  const today = dayIndex(i.asOf);
  const byType = new Map<string, { name: string; day: number; value: number; unit: "kg" | "s" | "reps" }[]>();
  for (const w of i.workouts) {
    if (w.status !== "completed" || !w.date) continue;
    const day = toUtcDayIndex(w.date);
    if (day > today) continue;
    for (const slot of w.exercises) {
      const best = bestOfSlot(slot);
      if (!best) continue;
      const list = byType.get(slot.typeId) ?? [];
      list.push({ name: slotTypeName(slot, i.exerciseTypes), day, ...best });
      byType.set(slot.typeId, list);
    }
  }
  const out: { insight: Insight; day: number }[] = [];
  for (const [typeId, all] of byType) {
    // One value per session day (the best of it), oldest first.
    const perDay = new Map<number, (typeof all)[number]>();
    for (const p of all) if (!perDay.has(p.day) || p.value > perDay.get(p.day)!.value) perDay.set(p.day, p);
    const series = [...perDay.values()].sort((a, b) => a.day - b.day);
    if (series.length < 3) continue;
    const latest = series[series.length - 1];
    const before = Math.max(...series.slice(0, -1).map((p) => p.value));
    if (today - latest.day > 28 || latest.value <= before) continue;
    const fmt = (v: number) => (latest.unit === "kg" ? `${Math.round(v * 10) / 10} kg` : latest.unit === "s" ? `${v} s` : `${v} reps`);
    out.push({
      day: latest.day,
      insight: { id: `record-${typeId}`, group: "strength", tone: "good", title: `New best: ${latest.name} ${fmt(latest.value)}`, detail: `Up from ${fmt(before)} over ${series.length} sessions.`, link: { kind: "panel", tab: "performance", section: "section-benchmarks" } },
    });
  }
  return out.sort((a, b) => b.day - a.day).slice(0, 3).map((o) => o.insight);
}

function benchmarkInsights(i: InsightInputs): Insight[] {
  const bw = bodyweightsOf(i.dailyMetrics);
  const today = dayIndex(i.asOf);
  const out: Insight[] = [];
  for (const s of benchmarkChanges(i.benchmarks, i.benchmarkTypes, 0, today, i.valueDefs, i.weightUnit, bw)) {
    if (s.points.length < 2) continue;
    const last = s.points[s.points.length - 1];
    const sign = last.pct >= 0 ? "+" : "−";
    out.push({
      id: `bench-${s.typeKey}`,
      group: "strength",
      tone: last.pct > 2 ? "good" : last.pct < -2 ? "caution" : "info",
      title: `${s.name}: ${sign}${Math.abs(Math.round(last.pct))}% since your first test`,
      detail: `${s.points.length} tests so far.`,
      link: { kind: "panel", tab: "performance", section: "section-benchmarkOverview" },
    });
  }
  return out.slice(0, 3);
}

function retestInsight(i: InsightInputs): Insight | undefined {
  const planned = plannedTestsByType(i.workouts, i.benchmarks);
  const status = testStatuses(i.benchmarkTypes, i.benchmarks, i.asOf, new Set(planned.keys()), i.config.retestWeeks);
  const due = status.filter((s) => s.due).sort((a, b) => (b.weeksSince ?? 0) - (a.weeksSince ?? 0));
  const link: InsightLink = { kind: "panel", tab: "performance", section: "section-benchmarks" };
  const open = due.filter((s) => !s.scheduled);
  if (open.length > 0) {
    const first = open[0];
    return {
      id: "retest",
      group: "strength",
      tone: "info",
      title: `Retest due: ${first.type.name}`,
      detail: `Last done ${first.weeksSince} weeks ago${open.length > 1 ? `; ${open.length - 1} more are due too` : ""}. Plan one in a session, or have the AI schedule them.`,
      link,
    };
  }
  const next = status.find((s) => s.scheduled);
  if (!next) return undefined;
  const where = planned.get(next.type.id)?.[0];
  return { id: "retest", group: "strength", tone: "info", title: `Test planned: ${next.type.name}`, detail: where ? `${where.day ?? "In"} ${where.session ? `${where.session}, ` : ""}week ${where.week.split("-W")[1]}.` : undefined, link };
}

// --- Following a balanced plan ---------------------------------------------------

function adherenceInsights(i: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const thisWeek = getWeekId(i.asOf);
  let done = 0;
  let missed = 0;
  for (let k = 1, w = decrementWeekId(thisWeek); k <= 4; k++, w = decrementWeekId(w)) {
    for (const s of i.workoutsForWeek(w)) {
      if (s.status === "completed") done++;
      else if (!isSkippedWorkout(s)) missed++;
    }
  }
  if (done + missed >= 3) {
    const share = done / (done + missed);
    out.push({
      id: "adherence",
      group: "plan",
      tone: share >= 0.8 ? "good" : share < i.config.adherenceLow ? "caution" : "info",
      title: `${Math.round(share * 100)}% of planned sessions done, last 4 weeks`,
      detail: `${done} of ${done + missed} (skipped sessions don't count against you).`,
      link: { kind: "panel", tab: "training", section: "section-load" },
    });
  }
  const todayIndex = isoDayIndex(WEEK_DAYS[(i.asOf.getDay() + 6) % 7]);
  const missedNow = i.workoutsForWeek(thisWeek).filter((s) => {
    if (s.status !== "planned" || isSkippedWorkout(s)) return false;
    const d = workoutDay(s);
    return d !== undefined && isoDayIndex(d) < todayIndex;
  });
  if (missedNow.length > 0) {
    out.push({
      id: "missed-now",
      group: "plan",
      tone: "info",
      title: `${missedNow.length} session${missedNow.length === 1 ? "" : "s"} missed this week`,
      link: { kind: "plan" },
      detail: missedNow.map((s) => s.notes || "Session").slice(0, 3).join(", "),
    });
  }
  return out;
}

/** Categories trained now and then, with how long since the last one. */
function staleInsights(i: InsightInputs): Insight[] {
  const today = dayIndex(i.asOf);
  const name = (slot: ExerciseSlot) => {
    const id = slot.categoryId ?? i.exerciseTypes.find((t) => t.id === slot.typeId)?.category;
    return i.analyticsCategories.find((c) => c.id === id)?.name ?? id ?? "Other";
  };
  const last = new Map<string, number>();
  const sessions = new Map<string, number>();
  for (const w of i.workouts) {
    if (w.status !== "completed" || !w.date) continue;
    const day = toUtcDayIndex(w.date);
    if (day > today) continue;
    const seen = new Set<string>();
    for (const slot of w.exercises) if (slot.logged && !slot.skipped) seen.add(name(slot));
    for (const cat of seen) {
      last.set(cat, Math.max(last.get(cat) ?? -Infinity, day));
      if (today - day <= 84) sessions.set(cat, (sessions.get(cat) ?? 0) + 1);
    }
  }
  return [...last.entries()]
    .filter(([cat, day]) => cat !== "Other" && (sessions.get(cat) ?? 0) >= 3 && today - day > i.config.staleDays)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([cat, day]) => ({
      id: `stale-${cat}`,
      group: "plan" as const,
      tone: "caution" as const,
      title: `No ${cat} work for ${today - day} days`,
      detail: `You did it in ${sessions.get(cat)} sessions over the last 12 weeks.`,
      link: { kind: "panel" as const, tab: "training" as const, section: "section-mix" },
    }));
}

// --- Targets ----------------------------------------------------------------

const WEEKS_FOR_TARGETS = 4;
const MIX_GAP_POINTS = 0.08;

/** How the last four full weeks measure against the weekly targets, as findings. */
function targetInsights(i: InsightInputs): Insight[] {
  const t = i.targets;
  if (!hasTargets(t)) return [];
  const out: Insight[] = [];
  const weekIds: string[] = [];
  for (let w = decrementWeekId(getWeekId(i.asOf)), k = 0; k < WEEKS_FOR_TARGETS; k++, w = decrementWeekId(w)) weekIds.unshift(w);
  const isFinger = (w: Workout) => isFingerSession(w, i.exerciseTypes, i.analyticsCategories, i.fingerIds ?? []);
  const weeks = weekIds.map((id) => {
    const sessions = i.workoutsForWeek(id).filter((w) => w.status === "completed");
    return { id, count: sessions.length, p: weekProgress(t, sessions, isFinger) };
  });
  const link: InsightLink = { kind: "panel", tab: "training", section: "section-load" };
  const active = weeks.filter((w) => w.count > 0);
  if (active.length < 2) return out;

  if (t.sessionsPerWeek !== undefined) {
    const avg = active.reduce((s, w) => s + w.count, 0) / active.length;
    const shown = Math.round(avg * 10) / 10;
    out.push({
      id: "target-sessions",
      group: "plan",
      tone: avg >= t.sessionsPerWeek ? "good" : avg < t.sessionsPerWeek * 0.75 ? "caution" : "info",
      title: avg >= t.sessionsPerWeek ? `On target: ${shown} sessions a week` : `${shown} sessions a week, target ${t.sessionsPerWeek}`,
      detail: `Average over the last ${active.length} weeks with training.`,
      link,
    });
  }
  if (t.loadMin !== undefined || t.loadMax !== undefined) {
    const inRange = active.filter((w) => w.p.load?.state === "in").length;
    const off = active.filter((w) => w.p.load && w.p.load.state !== "in");
    out.push({
      id: "target-load",
      group: "plan",
      tone: off.length === 0 ? "good" : off.some((w) => w.p.load!.state === "above") ? "caution" : "info",
      title: `Weekly load in your range ${inRange} of ${active.length} weeks`,
      detail: off.length ? off.map((w) => `W${w.id.split("-W")[1]} ${n0(w.p.load!.value)} (${w.p.load!.state === "above" ? "over" : "under"})`).join(", ") : undefined,
      link,
    });
  }
  if (t.fingerDays !== undefined) {
    const last = weeks[weeks.length - 1].p.fingerDays;
    if (last && last.done !== last.target) {
      out.push({ id: "target-fingers", group: "plan", tone: last.done < last.target ? "info" : "caution", title: `Finger work on ${last.done} day${last.done === 1 ? "" : "s"} last week, target ${last.target}`, link });
    }
  }
  if (t.categoryShares && Object.keys(t.categoryShares).length) {
    const history = buildWeeklyHistory(i.workouts, i.exerciseTypes, i.analyticsCategories, weekIds);
    const minutes: Record<string, number> = {};
    for (const w of history) for (const [cat, m] of Object.entries(w.minutesByCategory ?? {})) minutes[cat] = (minutes[cat] ?? 0) + m;
    const gaps = mixGaps(t, minutes, i.analyticsCategories).filter((g) => Math.abs(g.gap) >= MIX_GAP_POINTS).slice(0, 2);
    for (const g of gaps) {
      out.push({
        id: `target-mix-${g.name}`,
        group: "plan",
        tone: "caution",
        title: `${g.name} is ${Math.round(g.actual * 100)}% of your time, target ${Math.round(g.target * 100)}%`,
        detail: `${g.gap < 0 ? "Short" : "Over"} by ${Math.round(Math.abs(g.gap) * 100)} points over the last ${WEEKS_FOR_TARGETS} weeks.`,
        link: { kind: "panel", tab: "training", section: "section-mix" },
      });
    }
  }
  return out;
}

// --- Climbing and recovery -------------------------------------------------------

function climbingInsight(i: InsightInputs): Insight | undefined {
  if (i.ascents.length === 0) return undefined;
  const today = dayIndex(i.asOf);
  const recent = i.ascents.filter((a) => a.date && today - toUtcDayIndex(a.date) <= 28 && toUtcDayIndex(a.date) <= today);
  const season = sendsSummary(i.ascents, i.asOf);
  const hardestIn = (list: OutdoorAscent[]) => list.reduce<OutdoorAscent | undefined>((b, a) => {
    const rank = parseFontGrade(a.grade);
    return rank !== undefined && (b === undefined || rank > (parseFontGrade(b.grade) ?? -Infinity)) ? a : b;
  }, undefined);
  const link: InsightLink = { kind: "panel", tab: "performance", section: "section-outdoor" };
  if (recent.length === 0) {
    return { id: "sends", group: "body", tone: "info", title: "No outdoor sends in 4 weeks", detail: season.hardest ? `Hardest this season: ${season.hardest.grade} (${season.hardest.name}).` : undefined, link };
  }
  const hard = hardestIn(recent);
  return {
    id: "sends",
    group: "body",
    tone: "info",
    title: `${recent.length} outdoor send${recent.length === 1 ? "" : "s"} in 4 weeks`,
    detail: `${hard ? `Hardest ${hard.grade}` : ""}${season.hardest && hard && season.hardest.id !== hard.id ? `; season best ${season.hardest.grade}` : ""}.`.replace(/^;\s*/, ""),
    link,
  };
}

function recoveryInsights(i: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const today = dayIndex(i.asOf);
  const readings = loggedMetrics(i.dailyMetrics);
  const recentOf = (metricId: string, days: number) =>
    readings.filter((m) => m.metricId === metricId && today - toUtcDayIndex(m.date) < days && toUtcDayIndex(m.date) <= today).map((m) => m.value);
  const avg = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

  const baseline = computeHrvBaseline(i.dailyMetrics, i.asOf);
  const hrv = recentOf("hrv", 3);
  if (baseline && hrv.length > 0) {
    const dip = 1 - avg(hrv) / baseline;
    if (dip >= i.config.hrvDip) {
      out.push({
        id: "hrv",
        group: "body",
        tone: "caution",
        title: `HRV ${Math.round(dip * 100)}% below baseline`,
        detail: `Last 3 days average ${Math.round(avg(hrv))} ms against ${Math.round(baseline)} ms over 14 days.`,
        link: { kind: "panel", tab: "body", section: "section-recoveryTrend" },
      });
    }
  }
  const sleep = recentOf("sleep-score", 3);
  if (sleep.length >= 2 && avg(sleep) < i.config.sleepLow) {
    out.push({ id: "sleep", group: "body", tone: "caution", title: `Low sleep score: ${Math.round(avg(sleep))} lately`, link: { kind: "panel", tab: "body", section: "section-recoveryTrend" } });
  }
  return out;
}

// --- All ---------------------------------------------------------------------------

/** Every finding that applies, most serious first within each group. */
export function buildInsights(input: InsightInputs): Insight[] {
  const found: (Insight | undefined)[] = [
    acwrInsight(input),
    whatIfInsight(input),
    fatigueInsight(input),
    streakInsight(input),
    ...recordInsights(input),
    ...benchmarkInsights(input),
    retestInsight(input),
    ...adherenceInsights(input),
    ...staleInsights(input),
    ...targetInsights(input),
    climbingInsight(input),
    ...recoveryInsights(input),
  ];
  const list = found.filter((x): x is Insight => x !== undefined);
  return list.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

export const INSIGHT_GROUPS: { id: InsightGroup; label: string; question: string }[] = [
  { id: "push", label: "Push or rest", question: "Should I train hard today?" },
  { id: "strength", label: "Getting stronger", question: "Am I getting stronger?" },
  { id: "plan", label: "The plan", question: "Am I following a balanced plan?" },
  { id: "body", label: "Climbing & recovery", question: "How are climbing and recovery going?" },
];
