import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderId, checkNotificationPermission, cancelRemindersOfType } from './shared';

/**
 * The evening before an undecided Plan B starts: "Plan A or Plan B?" - with
 * the outdoor forecast when the Plan B has an outdoor side, which is what
 * usually decides it. One per upcoming occurrence; a decided one gets none.
 * Reconciled from scratch on every sync, like the other reminder types.
 */

export interface PlanBReminderInput {
  altId: string;
  /** The occurrence key (the week it starts in). */
  key: string;
  label?: string;
  /** "YYYY-MM-DD", the stretch's first day. */
  firstDate: string;
  decided: boolean;
  /** "Sat: prime at Frankenjura", when there's a forecast for the outdoor side. */
  hint?: string;
}

export interface PlannedReminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/** Which reminders to schedule as of `now`: undecided occurrences whose evening-before (at `timeHHMM`, local) is still ahead. */
export function planBReminders(inputs: PlanBReminderInput[], now: Date, timeHHMM: string): PlannedReminder[] {
  const [h, m] = timeHHMM.split(':').map(Number);
  const result: PlannedReminder[] = [];
  for (const input of inputs) {
    if (input.decided) continue;
    const [y, mo, d] = input.firstDate.split('-').map(Number);
    const at = new Date(y, mo - 1, d - 1, h, m, 0, 0);
    if (at <= now) continue;
    const name = input.label || 'Plan B';
    result.push({
      id: reminderId('planB', `${input.altId}:${input.key}`),
      at,
      title: 'Tomorrow: Plan A or Plan B?',
      body: `${name}${input.hint ? ` - ${input.hint}` : ''}. Start or log either one and that decides it.`,
    });
  }
  return result;
}

/** No-ops on web and without permission, so it's always safe to call from `refresh()`. */
export async function syncPlanBReminders(inputs: PlanBReminderInput[], timeHHMM: string, now: Date = new Date()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if ((await checkNotificationPermission()) !== 'granted') return;
  await cancelRemindersOfType('planB');
  const reminders = planBReminders(inputs, now, timeHHMM);
  if (reminders.length === 0) return;
  await LocalNotifications.schedule({
    notifications: reminders.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at }, isExactNotification: false })),
  });
}
