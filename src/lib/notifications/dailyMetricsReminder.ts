import { Capacitor } from '@capacitor/core';
import { trainingDayDate, localIsoDate } from '../dateUtils';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { DailyMetricEntry } from '../types';
import { reminderId, checkNotificationPermission, cancelRemindersOfType } from './shared';
import { isLoggedMetricValue } from '../analytics/metricValues';

/**
 * Evening reminder for missing daily metrics. Fires once,
 * at a configurable time, when today's sleep score, HRV, or resting heart
 * rate is still unlogged - the well-known `MetricDef` ids Home's
 * quick-entry already uses (`DEFAULT_METRIC_DEFS`, `constants.ts`), not
 * new ones. Any one of the three missing counts as "still missing" - the
 * point is nudging toward a completed check-in, not each metric having its
 * own reminder.
 */

const QUICK_ENTRY_METRIC_IDS = ['sleep-score', 'hrv', 'rhr'];

/** The one fixed id this reminder always uses - it's a single recurring notification, not one per anything variable. */
export function dailyMetricsReminderId(): number {
  return reminderId('dailyMetrics', 'daily-metrics-reminder');
}

/** True if at least one of the quick-entry metrics has no real entry (a zero doesn't count) for `todayIso` (`YYYY-MM-DD`). */
export function isDailyMetricsEntryMissing(dailyMetrics: DailyMetricEntry[], todayIso: string): boolean {
  return QUICK_ENTRY_METRIC_IDS.some(
    (metricId) => !dailyMetrics.some((m) => m.metricId === metricId && m.date === todayIso && isLoggedMetricValue(m.value)),
  );
}

/** `timeHHMM` ("20:00") resolved against `asOf`'s calendar day, in local time. */
export function computeDailyMetricsReminderTime(asOf: Date, timeHHMM: string): Date {
  const [h, m] = timeHHMM.split(':').map(Number);
  const at = new Date(asOf);
  at.setHours(h, m, 0, 0);
  return at;
}

/**
 * Reconciles the daily-metrics reminder with today's actual logged state:
 * cancels any previously-pending one (never another type's - see
 * `cancelRemindersOfType`), then reschedules a single notification for
 * today's configured time only if at least one quick-entry metric is
 * still missing *and* that time hasn't already passed. A time that's
 * already passed today is deliberately left unscheduled rather than
 * retroactively fired or pushed to tomorrow - the next sync (whenever the
 * app next runs, same "re-sync on refresh, no persisted delta" pattern
 * `syncFatigueReminders` already uses) picks up fresh state for whatever
 * day it actually is then.
 *
 * "Today" starts at `dayStartHour` (the "New day starts at" setting), not
 * at midnight: opened at 00:40 after an evening session it is still the day
 * before, whose reminder time has passed, so no new-day reminder appears
 * until the app is next used after that hour.
 *
 * No-ops on web and when permission isn't granted, so it's always safe to
 * call from `refresh()` without checking the platform first.
 */
export async function syncDailyMetricsReminder(
  dailyMetrics: DailyMetricEntry[],
  timeHHMM: string,
  asOf: Date = new Date(),
  dayStartHour = 0,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await checkNotificationPermission();
  if (permission !== 'granted') return;

  await cancelRemindersOfType('dailyMetrics');

  const day = trainingDayDate(asOf, dayStartHour);
  if (!isDailyMetricsEntryMissing(dailyMetrics, localIsoDate(day))) return;

  const at = computeDailyMetricsReminderTime(day, timeHHMM);
  if (at <= asOf) return;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: dailyMetricsReminderId(),
        title: "Log today's metrics",
        body: "Sleep, HRV, or resting heart rate is still missing for today.",
        schedule: { at },
        isExactNotification: false,
      },
    ],
  });
}
