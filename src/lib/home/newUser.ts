/**
 * "Is this a new user?" for Home: nothing real logged yet. Planned sessions
 * don't count (the welcome's starter plan creates those); a completed
 * session, a metric, a benchmark, a pain entry or a send does.
 */
export interface DataCounts {
  workouts: { status?: string }[];
  dailyMetrics: unknown[];
  benchmarks: unknown[];
  painLogs: unknown[];
  outdoorAscents: unknown[];
}

export function hasAnyData(d: DataCounts): boolean {
  return d.workouts.some((w) => w.status === "completed") || d.dailyMetrics.length > 0 || d.benchmarks.length > 0 || d.painLogs.length > 0 || d.outdoorAscents.length > 0;
}

/**
 * The cards that are only an empty shell before there is data: the ring,
 * the four "+ Log today" rows, empty fatigue bars, progress and recent
 * activity with nothing in them, alerts. Hidden by the "Simple Home until I
 * have data" setting; all of them return with the first real entry.
 */
export const SIMPLE_HOME_HIDDEN: readonly string[] = ["readiness", "metrics", "fatigue", "progress", "recentActivity", "alerts"];

export function isHiddenWhileNew(sectionId: string, simpleHome: boolean, hasData: boolean): boolean {
  return simpleHome && !hasData && SIMPLE_HOME_HIDDEN.includes(sectionId);
}
