import type { PainIssue, PainLog, Workout } from "../../types";
import { toUtcDayIndex } from "../../dateUtils";
import { painLevelOn } from "../../pain/issues";
import { calculateRollingAcwr } from "../loadAnalytics";
import { computeFatigueDecay, computeReadiness, hrvBaselineAt, type FatigueModel, type ReadinessConfig } from "../readiness";
import { dayIndexToAsOf, dayIndexToIso, localDayIndex } from "../recoverySeries";
import { DaySeries } from "./daySeries";
import type { ReadingsModel } from "./readingsModel";
import type { Warmable } from "./warmer";

/**
 * Home's readiness score as it would have read on each day - the same `computeReadiness` inputs Home uses, so today's
 * point on the Recovery chart and Home's ring agree - for one snapshot of the sessions, the readings, the open pain and
 * the settings. Worked out a day at a time and kept (`DaySeries`).
 *
 * Immutable like `ReadingsModel`: the sessions and pain entries are copied into plain objects when the model is made.
 *
 * Each day only sees the sessions up to and including that day (the fatigue model treats anything "in the future" of its
 * as-of date as happening today, which would pull later hard sessions back into a rest day). Of those it uses the ones
 * that can still matter: recent ones, the first session ever (the load ratio needs to know how long you have trained) and,
 * per rating, the latest session carrying it (a rating nobody gave lately is "not rated", not "fresh"). Fatigue fades by
 * half every half-life, so what is older than `FATIGUE_HALF_LIVES` of them is under a thousandth of a point.
 */

const FATIGUE_HALF_LIVES = 14;
/** The rolling load ratio looks this many days back. */
const ACWR_DAYS = 28;
const AXES = ["fingers", "arms", "core", "systemic"] as const;
const MAX_WARM_DAYS = 1100;

export interface ReadinessInputs {
  /** Sessions as they count for load (`trainingState.workoutsForLoad`); only completed ones with a date are used. */
  workouts: readonly Workout[];
  pain?: { issues: readonly PainIssue[]; logs: readonly PainLog[] };
  config: ReadinessConfig;
  halfLife: number | Partial<FatigueModel>;
}

interface Session { w: Workout; day: number }

export class ReadinessModel implements Warmable {
  readonly #sessions: Session[];
  readonly #pain?: { issues: PainIssue[]; logs: PainLog[] };
  readonly #config: ReadinessConfig;
  readonly #halfLife: number | Partial<FatigueModel>;
  readonly #reach: number;
  readonly #scores: DaySeries<number | null>;
  #warmed = false;

  constructor(private readonly readings: ReadingsModel, inputs: ReadinessInputs) {
    // Only what the calculation reads, copied: no reference to the live (reactive) objects is kept.
    this.#sessions = inputs.workouts
      .filter((w) => w.status === "completed" && w.date)
      .map((w): Session => ({
        day: toUtcDayIndex(w.date!),
        w: { id: w.id, status: "completed", date: w.date, weekId: w.weekId, loadFactor: w.loadFactor, exercises: [], fingers: w.fingers, arms: w.arms, core: w.core, systemic: w.systemic } as Workout,
      }))
      .sort((a, b) => a.day - b.day);
    this.#pain = inputs.pain ? { issues: inputs.pain.issues.map((i) => ({ ...i })), logs: inputs.pain.logs.map((l) => ({ ...l })) } : undefined;
    this.#config = { ...inputs.config, use: { ...inputs.config.use } };
    this.#halfLife = typeof inputs.halfLife === "number" ? inputs.halfLife : { ...inputs.halfLife };
    const halfLifeDays = typeof this.#halfLife === "number" ? this.#halfLife : this.#halfLife.halfLifeDays ?? 3;
    this.#reach = Math.max(ACWR_DAYS, Math.ceil(FATIGUE_HALF_LIVES * halfLifeDays));
    this.#scores = new DaySeries((day) => this.#compute(day));
  }

  /** The score on `day`, or null when no input was usable that day. */
  score(day: number): number | null {
    return this.#scores.get(day);
  }

  /** The scores from `firstDay` to `lastDay`; days without a score are left out. */
  range(firstDay: number, lastDay: number): Map<number, number> {
    const out = new Map<number, number>();
    for (let day = firstDay; day <= lastDay; day++) {
      const s = this.score(day);
      if (s !== null) out.set(day, s);
    }
    return out;
  }

  /** The first day there is anything to say about, for the warm-up's far end. */
  #firstDay(): number | undefined {
    const days = [this.#sessions[0]?.day, ...["sleep-score", "sleep-duration", "hrv"].map((id) => this.readings.firstReadingDay(id))].filter((d): d is number => d !== undefined);
    return days.length ? Math.min(...days) : undefined;
  }

  warm(budgetMs: number): boolean {
    if (this.#warmed) return true;
    const first = this.#firstDay();
    const top = localDayIndex(new Date());
    if (first === undefined) return (this.#warmed = true);
    return (this.#warmed = this.#scores.warmDown(top, Math.max(first, top - MAX_WARM_DAYS), budgetMs));
  }

  #compute(day: number): number | null {
    const sessions = this.#sessions;
    // Sessions up to and including the day.
    let lo = 0;
    let hi = sessions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sessions[mid].day <= day) lo = mid + 1;
      else hi = mid;
    }
    const upTo = lo;
    let start = upTo;
    while (start > 0 && day - sessions[start - 1].day < this.#reach) start--;
    const extra = new Set<number>();
    if (start > 0) extra.add(0);
    for (const axis of AXES) {
      for (let i = start - 1; i >= 0; i--) {
        if (sessions[i].w[axis] !== undefined) { extra.add(i); break; }
      }
    }
    const seen: Workout[] = [...[...extra].sort((a, b) => a - b).map((i) => sessions[i].w)];
    for (let i = start; i < upTo; i++) seen.push(sessions[i].w);

    const asOf = dayIndexToAsOf(day);
    const fatigue = computeFatigueDecay(seen, asOf, this.#halfLife);
    const result = computeReadiness(
      {
        fatigue: { fingers: fatigue.fingers, core: fatigue.core, systemic: fatigue.systemic },
        acwr: calculateRollingAcwr(seen, asOf),
        sleep: this.readings.readings("sleep-score").get(day),
        sleepHours: this.readings.readings("sleep-duration").get(day),
        napHours: this.readings.readings("nap-duration").get(day),
        hrv: this.readings.readings("hrv").get(day),
        hrvBaseline: hrvBaselineAt(this.readings.hrvReadings(), day),
        pain: this.#pain ? painLevelOn(this.#pain.issues, this.#pain.logs, dayIndexToIso(day)) : undefined,
      },
      this.#config,
    );
    return result.score ?? null;
  }
}
