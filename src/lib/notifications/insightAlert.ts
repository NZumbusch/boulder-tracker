import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { trainingDayDate } from '../dateUtils';
import type { Insight } from '../analytics/insights';
import { reminderId, checkNotificationPermission, cancelRemindersOfType } from './shared';

/**
 * The heads-up: one notification in the morning when Insights has found
 * something that needs attention - a load spike, a long run of training
 * days, a dip in HRV. Worked out whenever the app opens and reconciled from
 * scratch each time (like the other reminders), so a finding that has gone
 * by then is simply not scheduled.
 */
export function insightAlertId(): number {
  return reminderId('insight', 'heads-up');
}

/** What is worth waking the phone for: the serious findings, a run of training days, an HRV dip. */
export function alertInsights(insights: Insight[]): Insight[] {
  return insights.filter((i) => i.tone === 'risk' || i.id === 'streak' || i.id === 'hrv');
}

/** The notification's words, or null when there is nothing to say. */
export function insightAlertText(insights: Insight[]): { title: string; body: string } | null {
  const found = alertInsights(insights);
  if (found.length === 0) return null;
  const [first, ...rest] = found;
  const more = rest.length ? ` (+${rest.length} more in Insights)` : '';
  return { title: first.title, body: `${first.detail ?? 'Open Insights for the numbers behind it.'}${more}` };
}

/** The next time `hour` o'clock comes round: today if it hasn't passed, else tomorrow. */
export function nextAlertTime(asOf: Date, hour: number, dayStartHour = 0): Date {
  const day = trainingDayDate(asOf, dayStartHour);
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0);
  return at > asOf ? at : new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1, hour, 0, 0);
}

export async function syncInsightAlert(insights: Insight[], enabled: boolean, hour: number, asOf: Date = new Date(), dayStartHour = 0): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if ((await checkNotificationPermission()) !== 'granted') return;
  await cancelRemindersOfType('insight');
  if (!enabled) return;
  const text = insightAlertText(insights);
  if (!text) return;
  await LocalNotifications.schedule({
    notifications: [{ id: insightAlertId(), title: text.title, body: text.body, schedule: { at: nextAlertTime(asOf, hour, dayStartHour) }, isExactNotification: false }],
  });
}
