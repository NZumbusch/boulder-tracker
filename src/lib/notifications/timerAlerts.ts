import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderId, cancelRemindersOfType, checkNotificationPermission, requestNotificationPermission } from './shared';
import type { TimerAlert } from '../timer/timerAlerts';

/**
 * Hands the session timer's upcoming moments (rest over, countdown done,
 * the optional warning) to Android while the app is in the background,
 * and takes them back when it returns. What to alert about is decided in
 * `lib/timer/timerAlerts.ts`; this is only the native plumbing.
 *
 * Its own channel at high importance, so a rest-over alert vibrates and
 * pops up over whatever is on screen, unlike the quiet daily reminders.
 */
const CHANNEL_ID = 'timer';
let channelReady = false;

async function ensureChannel() {
  if (channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Session timer',
      description: 'Rest over, countdown finished',
      importance: 5,
      vibration: true,
      visibility: 1,
    });
  } catch {
    // Older Android has no channels; the default one still works.
  }
  channelReady = true;
}

/** Asks for notification permission the first time a timer is started (a real tap, which Android needs). */
export async function ensureTimerAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const state = await checkNotificationPermission();
  if (state === 'granted') return true;
  if (state === 'denied') return false;
  return (await requestNotificationPermission()) === 'granted';
}

export async function scheduleTimerAlerts(alerts: TimerAlert[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || alerts.length === 0) return;
  if ((await checkNotificationPermission()) !== 'granted') return;
  await ensureChannel();
  await cancelRemindersOfType('timer');
  await LocalNotifications.schedule({
    notifications: alerts.map((alert, i) => ({
      id: reminderId('timer', `alert-${i}`),
      title: alert.title,
      body: alert.body,
      channelId: CHANNEL_ID,
      schedule: { at: new Date(alert.atMs), allowWhileIdle: true },
    })),
  });
}

export async function cancelTimerAlerts(): Promise<void> {
  await cancelRemindersOfType('timer');
}

/**
 * Whether Android lets the app fire alerts on the exact second. Android 14
 * turns this off for new installs; without it a rest-over alert can come
 * minutes late. 'unsupported' on web.
 */
export async function exactAlarmStatus(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
    return exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'granted';
  }
}

/** Opens Android's "Alarms & reminders" setting for the app. */
export async function openExactAlarmSetting(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.changeExactNotificationSetting();
}
