import type { Workout, DailyMetricEntry } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { loggedMetrics } from "./metricValues";
import { ACWR_HIGH_RISK_RATIO, type RollingAcwrResult } from "./loadAnalytics";

/**
 * Pure, independently-testable readiness/fatigue engine. Home's readiness hero and fatigue bars, and later the Analytics
 * fatigue panel, all render values computed here rather than each deriving
 * their own - one source of truth, so they can never disagree.
 */

const FATIGUE_AXES = ["fingers", "arms", "core", "systemic"] as const;
type FatigueAxis = (typeof FATIGUE_AXES)[number];

export interface FatigueCoverage {
  /** Completed workouts considered (whatever `workouts` array was passed in - see the function doc). */
  total: number;
  fingers: number;
  arms: number;
  core: number;
  systemic: number;
}

export interface FatigueDecayResult {
  fingers: number | undefined;
  arms: number | undefined;
  core: number | undefined;
  systemic: number | undefined;
  coverage: FatigueCoverage;
}

/**
 * Exponentially-decayed fatigue per axis. Each axis is a weighted average of
 * that axis's own logged values across completed workouts, weighted by
 * `0.5 ^ (daysAgo / halfLifeDays)` - a workout with no value for an axis
 * (arms is the common case for any workout logged before its slider
 * existed) is excluded from that axis's average
 * entirely, never imputed with a placeholder value. An axis with zero
 * workouts carrying it anywhere in `workouts` comes back `undefined`, not 0.
 *
 * `coverage` reports, out of the workouts actually passed in, how many
 * carried each axis - callers use this for a coverage note (e.g. "arms: 4
 * of 27 sessions") rather than
 * presenting a sparse axis as equally reliable. This function applies no
 * history window of its own for that count - the decay weighting alone
 * already makes old workouts' contribution negligible, so pass in whatever
 * window (recent N, or all-time) makes sense for the caller's own coverage
 * message.
 */
export function computeFatigueDecay(workouts: Workout[], asOf: Date, halfLifeDays = 3): FatigueDecayResult {
  const completed = workouts.filter((w) => w.status === "completed" && w.date);
  const asOfDay = toUtcDayIndex(asOf.toISOString());

  const coverage: FatigueCoverage = { total: completed.length, fingers: 0, arms: 0, core: 0, systemic: 0 };
  const weightedSum: Record<FatigueAxis, number> = { fingers: 0, arms: 0, core: 0, systemic: 0 };
  const weightTotal: Record<FatigueAxis, number> = { fingers: 0, arms: 0, core: 0, systemic: 0 };

  for (const w of completed) {
    const daysAgo = Math.max(0, asOfDay - toUtcDayIndex(w.date!));
    const weight = Math.pow(0.5, daysAgo / halfLifeDays);
    for (const axis of FATIGUE_AXES) {
      const value = w[axis];
      if (value === undefined) continue;
      coverage[axis]++;
      weightedSum[axis] += weight * value;
      weightTotal[axis] += weight;
    }
  }

  const axisValue = (axis: FatigueAxis): number | undefined =>
    weightTotal[axis] > 0 ? weightedSum[axis] / weightTotal[axis] : undefined;

  return {
    fingers: axisValue("fingers"),
    arms: axisValue("arms"),
    core: axisValue("core"),
    systemic: axisValue("systemic"),
    coverage,
  };
}

/**
 * Average of the `hrv` `DailyMetricEntry` values over the trailing `days`
 * window ending at `asOf` (inclusive of both ends), or `undefined` if none
 * were logged in that window - readiness treats "no baseline yet" as a
 * missing input, not a 0. Zero entries are not readings (`isLoggedMetricValue`)
 * and are skipped, so a week without a tracker leaves the baseline alone.
 */
export function computeHrvBaseline(dailyMetrics: DailyMetricEntry[], asOf: Date, days = 14): number | undefined {
  const asOfDay = toUtcDayIndex(asOf.toISOString());
  const values = loggedMetrics(dailyMetrics)
    .filter((m) => m.metricId === "hrv")
    .filter((m) => {
      const day = toUtcDayIndex(m.date);
      return day <= asOfDay && asOfDay - day < days;
    })
    .map((m) => m.value);
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type ReadinessStatus = "good" | "caution" | "risk" | "neutral";

export interface ReadinessInputs {
  fatigue: { fingers?: number; core?: number; systemic?: number };
  acwr: RollingAcwrResult;
  /** Today's `sleep-score` DailyMetricEntry value, assumed 0-100 ("pts") - see SLEEP_SCORE_LOW_THRESHOLD's doc comment for why that range is this stage's own assumption. */
  sleep?: number;
  /**
   * Hours asleep last night (`sleep-duration`, from Health Connect). Only
   * used when there's no sleep score for the day - the score, where a
   * wearable gives one, already weighs duration and quality.
   */
  sleepHours?: number;
  /**
   * Hours of naps today (`nap-duration`). A boost on top of `sleepHours`:
   * a nap between two sessions lifts readiness for the second. Only with a
   * night to add to, and not when there's a sleep score.
   */
  napHours?: number;
  /** Today's `hrv` DailyMetricEntry value (ms). */
  hrv?: number;
  /** `computeHrvBaseline`'s output - required alongside `hrv` for the HRV signal to be usable at all. */
  hrvBaseline?: number;
}

export interface ReadinessResult {
  /** 0-100, or `undefined` when literally no input was usable (a brand-new install with nothing logged). */
  score: number | undefined;
  status: ReadinessStatus;
  /** Describes state and its implication; deliberately never issues a training instruction - the athlete has context the app doesn't. */
  advice: string;
  inputsUsed: { fatigue: boolean; acwr: boolean; sleep: boolean; hrv: boolean };
  /** Names which inputs actually fed the score, e.g. "Fatigue only - no HRV baseline yet". */
  confidence: string;
  /**
   * Points each input took off `READINESS_BASE_SCORE`, before clamping -
   * the breakdown Home shows when the ring is tapped. 0 for an input that
   * was missing or cost nothing.
   */
  penalties: { fatigue: number; acwr: number; sleep: number; hrv: number };
}

// Tunable weights/thresholds - named rules of thumb documented at their
// definition, same precedent as loadAnalytics.ts's RAMP_RATE_SPIKE_THRESHOLD/
// ACWR_HIGH_RISK_RATIO: not derived from this codebase, adjustable later.
export const READINESS_BASE_SCORE = 100;
/** Fatigue (1-10 RPE-like scale) can cost up to this many points, scaled linearly from 1 (fresh, 0 cost) to 10 (max cost). */
export const MAX_FATIGUE_PENALTY = 45;
/** A rolling ACWR ratio at/above ACWR_HIGH_RISK_RATIO costs this many points (capped - a further-elevated ratio costs no more). Below 1 (under-training relative to baseline) costs nothing. */
export const MAX_ACWR_PENALTY = 25;
/** Sleep score costs up to this many points, scaled linearly from SLEEP_SCORE_LOW_THRESHOLD (0 cost) down to 0 (max cost). No UI wrote the `sleep-score` metric before Home's quick-entry, so this 0-100 range is that feature's own assumption (matching common wearable sleep-score scales), not a pre-existing app convention. */
export const MAX_SLEEP_PENALTY = 15;
export const SLEEP_SCORE_LOW_THRESHOLD = 60;
/** Without a score, sleep shorter than this costs points, up to MAX_SLEEP_PENALTY at SLEEP_SHORT_RANGE_HOURS less. */
export const SLEEP_SHORT_HOURS = 7;
export const SLEEP_SHORT_RANGE_HOURS = 3;
/** HRV costs up to this many points once its dip below the 14-day baseline exceeds HRV_DIP_THRESHOLD_PCT, scaling to max cost at a 100% dip. */
export const MAX_HRV_PENALTY = 15;
export const HRV_DIP_THRESHOLD_PCT = 0.1;
export const READINESS_GOOD_THRESHOLD = 70;

/**
 * The user-adjustable parts of the readiness model (Settings -> Training
 * model). Defaults are the constants above, so passing nothing keeps the
 * model exactly as documented.
 */
export interface ReadinessConfig {
  /** Inputs switched off never feed the score and aren't reported as missing. */
  use: { fatigue: boolean; acwr: boolean; sleep: boolean; hrv: boolean };
  sleepLow: number;
  /** Sleep duration below which sleep costs points, when there's no score. */
  sleepShortHours: number;
  /** As a fraction: 0.1 = 10% below baseline. */
  hrvDip: number;
  /** The ACWR ratio at which the load penalty reaches its maximum. */
  acwrHighRisk: number;
}

export const DEFAULT_READINESS_CONFIG: ReadinessConfig = {
  use: { fatigue: true, acwr: true, sleep: true, hrv: true },
  sleepLow: SLEEP_SCORE_LOW_THRESHOLD,
  sleepShortHours: SLEEP_SHORT_HOURS,
  hrvDip: HRV_DIP_THRESHOLD_PCT,
  acwrHighRisk: ACWR_HIGH_RISK_RATIO,
};
export const READINESS_CAUTION_THRESHOLD = 40;

// Mirrors calculateLoadFactor's own fingers/systemic/core weighting
// (src/lib/types.ts) so "what predicts training stress" is one consistent
// model across load and readiness. `arms` is deliberately excluded here too -
// same reasoning as calculateLoadFactor: collecting arms and using it in a
// load/fatigue formula are separate decisions, and only the first was made.
const FATIGUE_WEIGHTS: Record<"fingers" | "core" | "systemic", number> = { fingers: 0.45, systemic: 0.45, core: 0.1 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function compositeFatigue(fatigue: ReadinessInputs["fatigue"]): number | undefined {
  let weightedSum = 0;
  let weightTotal = 0;
  (Object.keys(FATIGUE_WEIGHTS) as Array<keyof typeof FATIGUE_WEIGHTS>).forEach((axis) => {
    const value = fatigue[axis];
    if (value === undefined) return;
    weightedSum += FATIGUE_WEIGHTS[axis] * value;
    weightTotal += FATIGUE_WEIGHTS[axis];
  });
  return weightTotal > 0 ? weightedSum / weightTotal : undefined;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function buildAdvice(config: ReadinessConfig, args: {
  fatigueUsed: boolean;
  fatigueComposite: number | undefined;
  acwrUsed: boolean;
  acwr: RollingAcwrResult;
  sleepUsed: boolean;
  sleep: number | undefined;
  sleepHours: number | undefined;
  napHours: number;
  hrvUsed: boolean;
  hrvDipPct: number;
}): string {
  const clauses: string[] = [];

  if (args.fatigueUsed && args.fatigueComposite! >= 7) {
    clauses.push("fingers and systemic fatigue are elevated");
  } else if (args.fatigueUsed && args.fatigueComposite! <= 3) {
    clauses.push("fatigue is low - fingers and systemic feel fresh");
  }

  if (args.acwrUsed && args.acwr.ratio! > config.acwrHighRisk) {
    clauses.push("acute load is well above your chronic baseline");
  } else if (args.acwrUsed && args.acwr.ratio! < 0.8) {
    clauses.push("acute load is well below your chronic baseline");
  }

  if (args.sleepUsed && args.sleep !== undefined && args.sleep < config.sleepLow) {
    clauses.push("sleep score is below usual");
  } else if (args.sleepUsed && args.sleep === undefined && args.sleepHours! < config.sleepShortHours) {
    clauses.push(`sleep was short (${args.sleepHours!.toFixed(1)} h${args.napHours > 0 ? " with naps" : ""})`);
  }

  if (args.hrvUsed && args.hrvDipPct > config.hrvDip) {
    clauses.push("HRV is down from your 14-day baseline");
  }

  if (clauses.length === 0) return "Fatigue and load look manageable.";

  const [first, ...rest] = clauses;
  return rest.length > 0 ? `${capitalize(first)}; ${rest.join("; ")}.` : `${capitalize(first)}.`;
}

function buildConfidence(
  inputsUsed: ReadinessResult["inputsUsed"],
  acwr: RollingAcwrResult,
  use: ReadinessConfig["use"],
): string {
  const present: string[] = [];
  const missing: string[] = [];

  // An input switched off in Settings is neither present nor missing.
  if (inputsUsed.fatigue) present.push("fatigue");
  else if (use.fatigue) missing.push("fatigue");

  if (inputsUsed.acwr) present.push("load (ACWR)");
  else if (!use.acwr) { /* off */ }
  else if (acwr.ratio !== undefined && !acwr.sufficient) missing.push("load (still building a 28-day history)");
  else missing.push("load");

  if (inputsUsed.sleep) present.push("sleep");
  else if (use.sleep) missing.push("sleep");

  if (inputsUsed.hrv) present.push("HRV baseline");
  else if (use.hrv) missing.push("HRV baseline");

  const allOn = use.fatigue && use.acwr && use.sleep && use.hrv;
  if (missing.length === 0 && allOn) return "Full picture - fatigue, load, sleep and HRV all available.";
  if (missing.length === 0 && present.length > 0) return `${capitalize(present.join(", "))} - everything you've switched on.`;
  if (present.length === 0) return "No inputs available yet.";
  return `${capitalize(present.join(", "))} only - no ${missing.join(", ")} yet.`;
}

function readinessStatus(score: number): ReadinessStatus {
  if (score >= READINESS_GOOD_THRESHOLD) return "good";
  if (score >= READINESS_CAUTION_THRESHOLD) return "caution";
  return "risk";
}

/**
 * Combines rolling fatigue decay, the rolling ACWR ratio, sleep score and
 * HRV-vs-baseline into a single 0-100 readiness score.
 * Every input is optional and independently gated - a missing or
 * not-yet-trustworthy input (e.g. an ACWR window that isn't `sufficient`
 * yet) contributes nothing to the score rather than a fabricated default,
 * and `inputsUsed`/`confidence` say plainly what actually fed the number so
 * the UI never presents a partially-informed score as complete.
 */
export function computeReadiness(inputs: ReadinessInputs, config: ReadinessConfig = DEFAULT_READINESS_CONFIG): ReadinessResult {
  const { fatigue, acwr, sleep, hrv, hrvBaseline } = inputs;
  const napHours = inputs.sleepHours !== undefined ? Math.max(0, inputs.napHours ?? 0) : 0;
  const sleepHours = inputs.sleepHours !== undefined ? inputs.sleepHours + napHours : undefined;
  const { use, sleepLow, hrvDip, acwrHighRisk } = config;
  const sleepShortHours = config.sleepShortHours ?? SLEEP_SHORT_HOURS;

  const fatigueComposite = use.fatigue ? compositeFatigue(fatigue) : undefined;
  const fatigueUsed = fatigueComposite !== undefined;
  const fatiguePenalty = fatigueUsed ? ((fatigueComposite! - 1) / 9) * MAX_FATIGUE_PENALTY : 0;

  const acwrUsed = use.acwr && acwr.sufficient && acwr.ratio !== undefined;
  const acwrPenalty = acwrUsed
    ? clamp((acwr.ratio! - 1) / (acwrHighRisk - 1), 0, 1) * MAX_ACWR_PENALTY
    : 0;

  // A sleep score when there is one, else hours asleep.
  const sleepUsed = use.sleep && (sleep !== undefined || sleepHours !== undefined);
  const sleepPenalty = !sleepUsed
    ? 0
    : sleep !== undefined
      ? sleep < sleepLow ? ((sleepLow - sleep) / sleepLow) * MAX_SLEEP_PENALTY : 0
      : clamp((sleepShortHours - sleepHours!) / SLEEP_SHORT_RANGE_HOURS, 0, 1) * MAX_SLEEP_PENALTY;

  const hrvUsed = use.hrv && hrv !== undefined && hrvBaseline !== undefined && hrvBaseline > 0;
  const hrvDipPct = hrvUsed ? (hrvBaseline! - hrv!) / hrvBaseline! : 0;
  const hrvPenalty =
    hrvUsed && hrvDipPct > hrvDip
      ? clamp((hrvDipPct - hrvDip) / (1 - hrvDip), 0, 1) * MAX_HRV_PENALTY
      : 0;

  const inputsUsed = { fatigue: fatigueUsed, acwr: acwrUsed, sleep: sleepUsed, hrv: hrvUsed };
  const penalties = { fatigue: fatiguePenalty, acwr: acwrPenalty, sleep: sleepPenalty, hrv: hrvPenalty };
  const anyInputUsed = fatigueUsed || acwrUsed || sleepUsed || hrvUsed;

  if (!anyInputUsed) {
    return {
      score: undefined,
      status: "neutral",
      advice: "No data yet - log a session or today's metrics to see your readiness.",
      inputsUsed,
      confidence: "No inputs available yet.",
      penalties,
    };
  }

  const score = clamp(READINESS_BASE_SCORE - fatiguePenalty - acwrPenalty - sleepPenalty - hrvPenalty, 0, 100);

  return {
    score,
    status: readinessStatus(score),
    advice: buildAdvice({ ...config, sleepShortHours }, { fatigueUsed, fatigueComposite, acwrUsed, acwr, sleepUsed, sleep, sleepHours, napHours, hrvUsed, hrvDipPct }),
    inputsUsed,
    confidence: buildConfidence(inputsUsed, acwr, use),
    penalties,
  };
}
