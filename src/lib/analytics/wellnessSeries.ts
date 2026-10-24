import type { DailyMetricEntry } from "../types";
import { BODY_BATTERY_HIGH_METRIC, BODY_BATTERY_LOW_METRIC, BREATHING_METRIC, STEPS_METRIC, STRESS_METRIC, VO2MAX_METRIC } from "../constants";
import { buildRecoverySeries, type RecoveryDay } from "./recoverySeries";

/**
 * The wearable-only measures for Analytics' Wellness card: each as day-by-day
 * readings with a 7-day average and your own 28-day normal range, built by
 * the same `buildRecoverySeries` as HRV, sleep and resting heart rate.
 */

export interface WellnessMeasure {
  id: string;
  label: string;
  unit: string;
  /** Which way is better, for the wording ("above your usual"); undefined where neither is ("breathing rate"). */
  higherIsBetter?: boolean;
  /** The metric ids drawn (Body Battery draws its highest and lowest of the day). */
  series: { id: string; label: string; colorSlot: 1 | 2 | 3 | 4 }[];
}

export const WELLNESS_MEASURES: WellnessMeasure[] = [
  { id: "body-battery", label: "Body Battery", unit: "pts", higherIsBetter: true, series: [{ id: BODY_BATTERY_HIGH_METRIC.id, label: "Highest", colorSlot: 1 }, { id: BODY_BATTERY_LOW_METRIC.id, label: "Lowest", colorSlot: 3 }] },
  { id: "stress", label: "Stress", unit: "pts", higherIsBetter: false, series: [{ id: STRESS_METRIC.id, label: "Daily average", colorSlot: 3 }] },
  { id: "steps", label: "Steps", unit: "", higherIsBetter: true, series: [{ id: STEPS_METRIC.id, label: "Steps", colorSlot: 2 }] },
  { id: "breathing", label: "Breathing", unit: "br/min", series: [{ id: BREATHING_METRIC.id, label: "While asleep", colorSlot: 4 }] },
  { id: "vo2max", label: "VO2max", unit: "ml/kg/min", higherIsBetter: true, series: [{ id: VO2MAX_METRIC.id, label: "Running", colorSlot: 1 }] },
];

/** The measures that have at least one reading in the window - the card offers only those. */
export function measuresWithData(entries: DailyMetricEntry[], firstDay: number, lastDay: number): WellnessMeasure[] {
  return WELLNESS_MEASURES.filter((m) => m.series.some((s) => buildRecoverySeries(entries, { id: s.id, higherIsBetter: true }, firstDay, lastDay).some((d) => d.value !== undefined)));
}

export interface WellnessSummary {
  /** Latest reading in the window and its day. */
  latest?: { value: number; date: string };
  /** The 7-day average at the latest day. */
  avg?: number;
  /** The normal range (baseline ± 1 SD) at the latest day. */
  range?: { low: number; high: number };
  /** Where the latest 7-day average sits against the normal range. */
  position?: "above" | "within" | "below";
}

/** What to say about one series now: its latest reading, 7-day average and where that stands against your usual. */
export function summariseSeries(days: RecoveryDay[]): WellnessSummary {
  const lastWithValue = [...days].reverse().find((d) => d.value !== undefined);
  const lastDay = days[days.length - 1];
  const out: WellnessSummary = {};
  if (lastWithValue) out.latest = { value: lastWithValue.value!, date: lastWithValue.date };
  const ref = [...days].reverse().find((d) => d.avg !== undefined && d.baseline !== undefined) ?? lastDay;
  if (ref?.avg !== undefined) out.avg = ref.avg;
  if (ref?.baseline !== undefined && ref.sd !== undefined) {
    out.range = { low: ref.baseline - ref.sd, high: ref.baseline + ref.sd };
    if (ref.avg !== undefined) out.position = ref.avg > out.range.high ? "above" : ref.avg < out.range.low ? "below" : "within";
  }
  return out;
}
