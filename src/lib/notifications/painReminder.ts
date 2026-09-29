import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { localIsoDate } from '../dateUtils';
import type { PainIssue, PainLog } from '../types';
import type { PainCheckInPrefs } from '../preferences/migrate';
import { unCheckedFor, inSentence } from '../pain/issues';
import { reminderId, checkNotificationPermission, cancelRemindersOfType } from './shared';
import { computeDailyMetricsReminderTime } from './dailyMetricsReminder';

/**
 * The pain check-in reminder (PAIN_PLAN.md): one notification at the
 * chosen time when an open issue has gone `reminderDays` without a
 * check-in. Reconciled from scratch on every refresh, like the other
 * reminders - checking in clears it the next time the app runs.
 */
export function painReminderId(): number {
  return reminderId('pain', 'pain-check-in');
}

/** The body text, or null when nothing is overdue. */
export function painReminderText(issues: PainIssue[], logs: PainLog[], todayIso: string, days: number): string | null {
  const overdue = unCheckedFor(issues, logs, todayIso, days);
  if (overdue.length === 0) return null;
  const names = overdue.map((i) => i.bodyPart);
  return overdue.length === 1
    ? `How's your ${inSentence(names[0])}? A tap in the app keeps its history straight.`
    : `How are ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}? A tap in the app keeps their history straight.`;
}

export async function syncPainReminder(issues: PainIssue[], logs: PainLog[], prefs: PainCheckInPrefs, asOf: Date = new Date()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if ((await checkNotificationPermission()) !== 'granted') return;
  await cancelRemindersOfType('pain');
  if (!prefs.reminder) return;
  const body = painReminderText(issues, logs, localIsoDate(asOf), prefs.reminderDays);
  if (!body) return;
  const at = computeDailyMetricsReminderTime(asOf, prefs.reminderTime);
  if (at <= asOf) return;
  await LocalNotifications.schedule({
    notifications: [{ id: painReminderId(), title: 'Pain check-in', body, schedule: { at }, isExactNotification: false }],
  });
}
