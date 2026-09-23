import type { DailyMetricEntry, PainLog, Workout } from "../types";
import { decrementWeekId, getWeekId, toUtcDayIndex } from "../dateUtils";
import { calculateAcwrForWeeks, correlatePainWithLoadSpikes, findRecoveryWarnings } from "../analytics/loadAnalytics";
import { loggedMetrics } from "../analytics/metricValues";

export type AlertSeverity = "risk" | "caution" | "info";

export interface HomeAlert {
  /** Stable per alert, for keyed rendering. */
  id: string;
  severity: AlertSeverity;
  text: string;
  /** A completed session the alert is about, when tapping it should open that session's fatigue rating. */
  rateWorkoutId?: string;
}

export interface AlertInputs {
  asOf: Date;
  workouts: Workout[];
  dailyMetrics: DailyMetricEntry[];
  painLogs: PainLog[];
  /** ISO timestamp of the last successful backup export, if any. */
  lastBackupAt?: string;
  /** Upcoming or current trips with sessions still planned on their days (see `sessionsDuringTrip`). */
  tripConflicts?: { tripName: string; dates: string; count: number }[];
  enabled: { recovery: boolean; pain: boolean; missingData: boolean; backup: boolean; tripConflict?: boolean };
  /** Settings -> Training model / Layout; each falls back to this module's default. */
  config?: { restDays?: number; backupDays?: number; acwrHighRisk?: number };
}

/** Pain logged within this many days shows up. */
export const PAIN_ALERT_DAYS = 7;
/** A metric you normally log is flagged once it has gone this many days without a reading. */
export const METRIC_GAP_DAYS = 5;
/** ...but only if it was logged at some point in this many days - otherwise it isn't something you track. */
const METRIC_TRACKED_WINDOW_DAYS = 30;
/** Completed sessions this recent without fatigue ratings get a nudge. */
const UNRATED_SESSION_DAYS = 3;
/** A backup older than this is flagged. */
export const BACKUP_STALE_DAYS = 14;
/** With no backup at all, stay quiet until there's this much to lose. */
const BACKUP_MIN_SESSIONS = 10;
/** How many weeks back the load-spike check looks (it needs a previous week to compare against). */
const RECOVERY_LOOKBACK_WEEKS = 6;

const METRIC_NAMES: Record<string, string> = { "sleep-score": "sleep score", hrv: "HRV", rhr: "resting heart rate" };

function daysAgo(isoDate: string, asOf: Date): number {
  return toUtcDayIndex(asOf.toISOString()) - toUtcDayIndex(isoDate);
}

/**
 * The things on Home worth knowing before training today, most serious
 * first. Every source is an existing analysis (`findRecoveryWarnings`,
 * `correlatePainWithLoadSpikes`) narrowed to what's current - an old
 * warning belongs in Analytics, not here. Empty when nothing's wrong.
 */
export function buildAlerts(input: AlertInputs): HomeAlert[] {
  const { asOf, workouts, dailyMetrics, painLogs, enabled } = input;
  const alerts: HomeAlert[] = [];
  const currentWeekId = getWeekId(asOf);
  const weekIds: string[] = [currentWeekId];
  for (let i = 1; i < RECOVERY_LOOKBACK_WEEKS; i++) weekIds.unshift(decrementWeekId(weekIds[0]));
  const previousWeekId = weekIds[weekIds.length - 2];

  if (enabled.recovery) {
    for (const warning of findRecoveryWarnings(workouts, dailyMetrics, weekIds, input.config?.restDays)) {
      const isWeek = /^\d{4}-W\d{2}$/.test(warning.date);
      const current = isWeek ? warning.date === currentWeekId || warning.date === previousWeekId : daysAgo(warning.date, asOf) <= 1;
      if (current) alerts.push({ id: `recovery-${warning.date}`, severity: "risk", text: warning.reason });
    }
  }

  if (enabled.pain) {
    const recent = painLogs.filter((p) => daysAgo(p.date, asOf) >= 0 && daysAgo(p.date, asOf) <= PAIN_ALERT_DAYS);
    const nearSpike = new Map(
      correlatePainWithLoadSpikes(recent, calculateAcwrForWeeks(workouts, weekIds), input.config?.acwrHighRisk).map((c) => [c.painLogId, c.loadSpikeNearby]),
    );
    for (const log of [...recent].sort((a, b) => b.severity - a.severity)) {
      const ago = daysAgo(log.date, asOf);
      const when = ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`;
      alerts.push({
        id: `pain-${log.id}`,
        severity: log.severity >= 6 ? "risk" : "caution",
        text: `${log.bodyPart} ${log.severity}/10, ${when}${nearSpike.get(log.id) ? " - near a load spike" : ""}`,
      });
    }
  }

  if (enabled.missingData) {
    const readings = loggedMetrics(dailyMetrics);
    for (const [metricId, name] of Object.entries(METRIC_NAMES)) {
      const days = readings.filter((m) => m.metricId === metricId).map((m) => daysAgo(m.date, asOf)).filter((d) => d >= 0);
      if (days.length === 0) continue;
      const newest = Math.min(...days);
      if (newest >= METRIC_GAP_DAYS && newest <= METRIC_TRACKED_WINDOW_DAYS) {
        alerts.push({ id: `gap-${metricId}`, severity: "info", text: `No ${name} logged in ${newest} days` });
      }
    }
    for (const w of workouts) {
      if (w.status !== "completed" || !w.date) continue;
      const ago = daysAgo(w.date, asOf);
      if (ago < 0 || ago > UNRATED_SESSION_DAYS) continue;
      if (w.fingers === undefined && w.systemic === undefined) {
        alerts.push({ id: `unrated-${w.id}`, severity: "info", text: `Rate how "${w.notes || "your session"}" felt`, rateWorkoutId: w.id });
      }
    }
  }

  if (enabled.tripConflict) {
    for (const c of input.tripConflicts ?? []) {
      if (c.count === 0) continue;
      alerts.push({
        id: `trip-${c.tripName}`,
        severity: "caution",
        text: `${c.count} session${c.count === 1 ? "" : "s"} still planned during ${c.tripName} (${c.dates})`,
      });
    }
  }

  const backupDays = input.config?.backupDays ?? BACKUP_STALE_DAYS;
  if (enabled.backup && backupDays > 0) {
    const completedCount = workouts.filter((w) => w.status === "completed").length;
    if (!input.lastBackupAt) {
      if (completedCount >= BACKUP_MIN_SESSIONS) alerts.push({ id: "backup", severity: "info", text: "No backup exported from this device yet" });
    } else {
      const age = daysAgo(input.lastBackupAt, asOf);
      if (age > backupDays) alerts.push({ id: "backup", severity: "info", text: `Last backup ${age} days ago` });
    }
  }

  const rank: Record<AlertSeverity, number> = { risk: 0, caution: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
