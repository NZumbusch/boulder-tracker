import type { AnalyticsCategory, ExerciseTypeDef, TrainingTargets, Workout } from "../types";

/**
 * Training targets - a few numbers a normal week should add up to - and how
 * a week or a few weeks measure against them. Pure; Home, Insights and the
 * AI prompt all read these.
 */

export const hasTargets = (t: TrainingTargets | undefined): t is TrainingTargets =>
  !!t && (t.sessionsPerWeek !== undefined || t.loadMin !== undefined || t.loadMax !== undefined || t.fingerDays !== undefined || Object.keys(t.categoryShares ?? {}).length > 0);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString("en");

/** The targets as the AI is told them. */
export function describeTargets(t: TrainingTargets | undefined, categories: readonly AnalyticsCategory[]): string {
  if (!hasTargets(t)) return "";
  const parts: string[] = [];
  if (t.sessionsPerWeek !== undefined) parts.push(`${t.sessionsPerWeek} session${t.sessionsPerWeek === 1 ? "" : "s"} a week`);
  if (t.loadMin !== undefined && t.loadMax !== undefined) parts.push(`weekly load ${n0(t.loadMin)}-${n0(t.loadMax)}`);
  else if (t.loadMax !== undefined) parts.push(`weekly load up to ${n0(t.loadMax)}`);
  else if (t.loadMin !== undefined) parts.push(`weekly load at least ${n0(t.loadMin)}`);
  if (t.fingerDays !== undefined) parts.push(`finger work on ${t.fingerDays} day${t.fingerDays === 1 ? "" : "s"} a week`);
  const shares = Object.entries(t.categoryShares ?? {})
    .map(([id, share]) => `${categories.find((c) => c.id === id)?.name ?? id} ${pct(share)}`)
    .join(", ");
  if (shares) parts.push(`time split ${shares}`);
  return parts.join("; ");
}

export interface WeekProgress {
  sessions?: { done: number; target: number };
  load?: { value: number; min?: number; max?: number; state: "below" | "in" | "above" };
  fingerDays?: { done: number; target: number };
}

/**
 * A week's completed sessions against the weekly targets. `isFingerDay`
 * says whether a session counts as finger work (its day is then counted
 * once, however many such sessions it had).
 */
export function weekProgress(t: TrainingTargets | undefined, completed: readonly Workout[], isFingerDay: (w: Workout) => boolean): WeekProgress {
  const out: WeekProgress = {};
  if (!t) return out;
  const done = completed.filter((w) => w.status === "completed");
  if (t.sessionsPerWeek !== undefined) out.sessions = { done: done.length, target: t.sessionsPerWeek };
  if (t.loadMin !== undefined || t.loadMax !== undefined) {
    const value = done.reduce((s, w) => s + (w.loadFactor || 0), 0);
    out.load = { value, ...(t.loadMin !== undefined ? { min: t.loadMin } : {}), ...(t.loadMax !== undefined ? { max: t.loadMax } : {}), state: t.loadMax !== undefined && value > t.loadMax ? "above" : t.loadMin !== undefined && value < t.loadMin ? "below" : "in" };
  }
  if (t.fingerDays !== undefined) {
    const days = new Set(done.filter(isFingerDay).map((w) => (w.date ?? w.dayOfWeek ?? w.id).slice(0, 10)));
    out.fingerDays = { done: days.size, target: t.fingerDays };
  }
  return out;
}

export interface MixGap {
  name: string;
  /** Share of training time over the window, 0-1. */
  actual: number;
  target: number;
  /** actual - target, in share points (-0.1 = ten points short). */
  gap: number;
}

/** Each targeted category's share of the time in `minutesByCategory` (names) against its target, biggest gap first. */
export function mixGaps(t: TrainingTargets | undefined, minutesByCategory: Record<string, number>, categories: readonly AnalyticsCategory[]): MixGap[] {
  const shares = t?.categoryShares;
  if (!shares) return [];
  const total = Object.values(minutesByCategory).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return Object.entries(shares)
    .map(([id, target]) => {
      const name = categories.find((c) => c.id === id)?.name ?? id;
      const actual = (minutesByCategory[name] ?? 0) / total;
      return { name, actual, target, gap: actual - target };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/** A one-line verdict for the week card: "3 of 4 sessions · load 2,870 (in range)". */
export function weekProgressText(p: WeekProgress): string {
  const parts: string[] = [];
  if (p.sessions) parts.push(`${p.sessions.done} of ${p.sessions.target} sessions`);
  if (p.load) parts.push(`load ${n0(p.load.value)} ${p.load.state === "in" ? "in range" : p.load.state === "above" ? `over ${n0(p.load.max ?? 0)}` : `under ${n0(p.load.min ?? 0)}`}`);
  if (p.fingerDays) parts.push(`fingers ${p.fingerDays.done} of ${p.fingerDays.target} days`);
  return parts.join(" · ");
}

/** Whether a session had finger work: a logged exercise in one of the categories that load the fingers. */
export function isFingerSession(w: Workout, exerciseTypes: readonly ExerciseTypeDef[], categories: readonly AnalyticsCategory[], fingerIds: Iterable<string>): boolean {
  const ids = new Set(fingerIds);
  return w.exercises.some((slot) => {
    if (slot.skipped || !slot.logged) return false;
    const raw = slot.categoryId ?? exerciseTypes.find((t) => t.id === slot.typeId)?.category;
    const id = categories.find((c) => c.id === raw || c.name === raw)?.id ?? raw;
    return !!id && ids.has(id);
  });
}
