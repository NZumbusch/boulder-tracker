import { READINESS_CAUTION_THRESHOLD, READINESS_GOOD_THRESHOLD } from "./readiness";

/**
 * What this morning's numbers say about today, in words that describe and
 * don't instruct (the athlete knows things the app doesn't): HRV against your
 * baseline, last night's sleep, Body Battery and the readiness score each
 * count for, against or neither, and the sum leans one of three ways. Where
 * today's planned session is much heavier or lighter than your usual, it says
 * so. Pure; every threshold comes in so Settings can move it.
 */

export type DayLean = "good" | "steady" | "easy";

export interface DaySignalsInput {
  readinessScore?: number;
  hrv?: number;
  hrvBaseline?: number;
  /** Fraction below baseline that counts as a dip (0.1 = 10 %). */
  hrvDip: number;
  sleepScore?: number;
  sleepLow: number;
  /** Morning Body Battery (the day's highest so far). */
  bodyBattery?: number;
  bodyBatteryLow: number;
  /** Planned load of today's sessions and your usual planned session load, when there is a session. */
  planned?: { load: number; usual: number };
}

export interface DaySignals {
  lean: DayLean;
  headline: string;
  /** One line per signal that counted, for or against. */
  reasons: string[];
  /** A note on today's session against your usual, if it stands out. */
  plan?: string;
  /** How many signals there were to go on (0 = nothing, no verdict). */
  signals: number;
}

const HEADLINE: Record<DayLean, string> = {
  good: "The signals look good for a full session.",
  steady: "The signals are mixed - a normal day.",
  easy: "The signals point to taking it easier today.",
};

export function daySignals(i: DaySignalsInput): DaySignals | null {
  let score = 0;
  let signals = 0;
  const reasons: string[] = [];

  if (i.hrv !== undefined && i.hrvBaseline !== undefined && i.hrvBaseline > 0) {
    signals++;
    const d = (i.hrv - i.hrvBaseline) / i.hrvBaseline;
    const pct = Math.round(Math.abs(d) * 100);
    if (d <= -i.hrvDip) { score -= 1; reasons.push(`HRV ${Math.round(i.hrv)} ms is ${pct} % below your baseline`); }
    else if (d >= 0.03) { score += 1; reasons.push(`HRV ${Math.round(i.hrv)} ms is ${pct} % above your baseline`); }
  }
  if (i.sleepScore !== undefined) {
    signals++;
    if (i.sleepScore < i.sleepLow) { score -= 1; reasons.push(`sleep score ${Math.round(i.sleepScore)} is low`); }
    else if (i.sleepScore >= 80) { score += 1; reasons.push(`sleep score ${Math.round(i.sleepScore)} is good`); }
  }
  if (i.bodyBattery !== undefined) {
    signals++;
    if (i.bodyBattery < i.bodyBatteryLow) { score -= 1; reasons.push(`Body Battery only reached ${Math.round(i.bodyBattery)}`); }
    else if (i.bodyBattery >= 80) { score += 1; reasons.push(`Body Battery reached ${Math.round(i.bodyBattery)}`); }
  }
  if (i.readinessScore !== undefined) {
    signals++;
    if (i.readinessScore < READINESS_CAUTION_THRESHOLD) { score -= 2; reasons.push(`readiness is ${Math.round(i.readinessScore)}`); }
    else if (i.readinessScore < READINESS_GOOD_THRESHOLD) { score -= 1; reasons.push(`readiness is ${Math.round(i.readinessScore)}`); }
    else if (i.readinessScore >= 85) { score += 1; reasons.push(`readiness is ${Math.round(i.readinessScore)}`); }
  }
  // Fewer than two signals is not enough for a verdict.
  if (signals < 2) return null;

  const lean: DayLean = score >= 2 ? "good" : score <= -2 ? "easy" : "steady";
  let plan: string | undefined;
  if (i.planned && i.planned.usual > 0 && i.planned.load > 0) {
    const ratio = i.planned.load / i.planned.usual;
    if (lean === "easy" && ratio >= 1.2) plan = "Today's planned session is heavier than your usual - the one to look at if you want to trim something.";
    else if (lean === "good" && ratio <= 0.8) plan = "Today's planned session is lighter than your usual - there is room for more if you feel like it.";
  }
  return { lean, headline: HEADLINE[lean], reasons, ...(plan ? { plan } : {}), signals };
}

/** The usual planned load of a session: the median `plannedLoad` of your recent completed sessions that had one. */
export function usualPlannedLoad(recent: { plannedLoad?: number }[], count = 10): number {
  const loads = recent.map((w) => w.plannedLoad ?? 0).filter((l) => l > 0).slice(-count).sort((a, b) => a - b);
  if (loads.length < 3) return 0;
  const m = Math.floor(loads.length / 2);
  return loads.length % 2 ? loads[m] : (loads[m - 1] + loads[m]) / 2;
}
