import type { ExternalActivity, Workout } from "../types";
import { weekIdOfIso } from "../dateUtils";
import { calculateLoadFactor } from "../analytics/load";

/**
 * Imported activities as training load. A run, ride or walk is not a session
 * you rated, so it is given an effort (1-10, the same scale as the ratings)
 * and goes through the same formula as a rated session, minutes x effort^1.2
 * (`calculateLoadFactor`). That makes it comparable to climbing load and lets
 * the load ratio, fatigue and readiness count it.
 *
 * Effort comes from, in order: the rating you gave on the watch (`stats.rpe`), the heart rate (for the endurance types, where
 * it says something: average heart rate as a share of your highest seen), else
 * the effort you set for that kind of activity (Settings -> Training model ->
 * Other training). 0 for a kind means "don't count it".
 *
 * Nothing is stored: the load is computed from the activities each time, so
 * changing a setting changes the past too, and removing an activity removes
 * its load. The pseudo-sessions only ever go into load, fatigue and readiness,
 * never into lists, History or the session count.
 */

export type EffortKind = "walk" | "hike" | "run" | "ride" | "swim" | "ski" | "strength" | "workout" | "climb" | "other";

export const EFFORT_KINDS: { kind: EffortKind; label: string; default: number }[] = [
  { kind: "walk", label: "Walks", default: 2 },
  { kind: "hike", label: "Hikes", default: 4 },
  { kind: "run", label: "Runs", default: 6 },
  { kind: "ride", label: "Rides", default: 5 },
  { kind: "swim", label: "Swims", default: 5 },
  { kind: "ski", label: "Skiing", default: 4 },
  { kind: "strength", label: "Weight training", default: 5 },
  { kind: "workout", label: "Other workouts", default: 4 },
  { kind: "climb", label: "Climbing recorded on a watch", default: 6 },
  { kind: "other", label: "Anything else", default: 3 },
];

/** Which kind an imported activity's type is. */
export function effortKindOf(type: string): EffortKind {
  const t = type.toLowerCase();
  if (/walk/.test(t)) return "walk";
  if (/hike|trek/.test(t)) return "hike";
  if (/run|jog/.test(t)) return "run";
  if (/ride|bike|cycl/.test(t)) return "ride";
  if (/swim/.test(t)) return "swim";
  if (/ski|snowboard/.test(t)) return "ski";
  if (/weight|strength/.test(t)) return "strength";
  if (/climb|boulder/.test(t)) return "climb";
  if (/workout|hiit|cardio|badminton|yoga|row|elliptical|tennis|squash/.test(t)) return "workout";
  return "other";
}

/** Kinds where average heart rate says how hard it was (not weights, where the heart rate stays low). */
const HEART_RATE_KINDS = new Set<EffortKind>(["walk", "hike", "run", "ride", "swim", "ski", "workout"]);

export interface ExternalLoadConfig {
  /** Count imported activities at all. */
  enabled: boolean;
  /** Effort 0-10 per kind; 0 = not counted. */
  effort: Record<EffortKind, number>;
  /** Use average heart rate where it applies. */
  useHeartRate: boolean;
  /** How much of its load counts next to climbing, 0-2 (1 = the same). */
  weight: number;
}

export const DEFAULT_EXTERNAL_LOAD: ExternalLoadConfig = {
  enabled: true,
  effort: Object.fromEntries(EFFORT_KINDS.map((k) => [k.kind, k.default])) as Record<EffortKind, number>,
  useHeartRate: true,
  weight: 1,
};

/** Average heart rate as a share of the highest, to effort 1-10 (piecewise, at 50/60/70/80/90/95 %). */
const HR_STEPS: [share: number, effort: number][] = [[0.5, 1], [0.6, 3], [0.7, 5], [0.8, 7], [0.9, 9], [0.95, 10]];

export function effortFromHeartRate(avgHr: number, maxHr: number): number {
  const share = avgHr / maxHr;
  if (share <= HR_STEPS[0][0]) return HR_STEPS[0][1];
  for (let i = 1; i < HR_STEPS.length; i++) {
    const [s1, e1] = HR_STEPS[i];
    if (share <= s1) {
      const [s0, e0] = HR_STEPS[i - 1];
      return e0 + ((share - s0) / (s1 - s0)) * (e1 - e0);
    }
  }
  return 10;
}

/** Your highest heart rate in the imported activities (the 99th percentile, so one spike doesn't set it), or 190 when there are too few. */
export function estimateMaxHr(activities: Pick<ExternalActivity, "maxHr">[]): number {
  const values = activities.map((a) => a.maxHr).filter((h): h is number => !!h && h >= 120 && h <= 230).sort((a, b) => a - b);
  if (values.length < 10) return 190;
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.99))];
}

/** The effort (0-10) of one activity under `config`; 0 = not counted. */
export function externalEffort(a: ExternalActivity, config: ExternalLoadConfig, maxHr: number): number {
  const kind = effortKindOf(a.type);
  const byKind = config.effort[kind] ?? 0;
  if (byKind <= 0) return 0;
  // A rating you gave the workout on the watch beats any guess from heart rate or kind.
  if (a.stats?.rpe) return Math.max(0.5, Math.min(10, a.stats.rpe));
  if (config.useHeartRate && a.avgHr && HEART_RATE_KINDS.has(kind)) return Math.max(0.5, Math.min(10, effortFromHeartRate(a.avgHr, maxHr)));
  return byKind;
}

/** One activity's load, comparable to a rated session's `loadFactor`; 0 when it isn't counted. */
export function externalLoad(a: ExternalActivity, config: ExternalLoadConfig, maxHr: number): number {
  const effort = externalEffort(a, config, maxHr);
  const minutes = (a.movingSec || a.durationSec) / 60;
  if (effort <= 0 || minutes < 1) return 0;
  return Math.round(calculateLoadFactor(minutes, effort, effort, effort) * config.weight);
}

/** Id prefix of the pseudo-sessions, so anything can tell them from real ones. */
export const EXTERNAL_WORKOUT_PREFIX = "ext:";
export const isExternalWorkout = (w: Pick<Workout, "id">) => w.id.startsWith(EXTERNAL_WORKOUT_PREFIX);

/**
 * The activities as completed sessions for load, fatigue and readiness only.
 * The rating goes on the systemic axis (a run tires the whole body, not the
 * fingers), so it adds to systemic fatigue and leaves the finger and arm
 * readings alone.
 */
export function externalAsWorkouts(activities: ExternalActivity[], config: ExternalLoadConfig): Workout[] {
  if (!config.enabled) return [];
  const maxHr = estimateMaxHr(activities);
  const out: Workout[] = [];
  for (const a of activities) {
    const loadFactor = externalLoad(a, config, maxHr);
    if (loadFactor <= 0) continue;
    const effort = externalEffort(a, config, maxHr);
    out.push({
      id: `${EXTERNAL_WORKOUT_PREFIX}${a.id}`,
      status: "completed",
      date: a.date,
      weekId: weekIdOfIso(a.date),
      loadFactor,
      systemic: Math.min(10, Math.round(effort * config.weight * 10) / 10),
      actualDuration: Math.round((a.movingSec || a.durationSec) / 60),
      notes: a.name,
      exercises: [],
    } as Workout);
  }
  return out;
}
