/**
 * The page's side of the Android timer service (`plugins/timer-service`).
 *
 * The service shows the running timer as an ongoing notification with a
 * live countdown and plays its cues while the app is in the background,
 * ducking any music rather than pausing it. The page hands it the plan
 * (`lib/timer/liveTimer.ts`) whenever the timer changes, and mirrors the
 * notification's Pause / Resume / +30 s buttons back into its own state.
 *
 * Everything here is a no-op on the web.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { LiveTimerConfig } from "../timer/liveTimer";

export type LiveAction = { kind: "pause" | "resume" | "add30" | "sessionPause" | "sessionResume"; at: number; seq: number };

interface TimerServicePlugin {
  start(options: LiveTimerConfig & { sound: boolean; vibrate: boolean }): Promise<void>;
  update(options: LiveTimerConfig & { sound: boolean; vibrate: boolean }): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<{ running: boolean }>;
  takeActions(): Promise<{ actions: LiveAction[] }>;
  addListener(event: "action", handler: (action: LiveAction) => void): Promise<PluginListenerHandle>;
}

const TimerService = registerPlugin<TimerServicePlugin>("TimerService");

export const liveTimerAvailable = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** Sends the current plan; resolves false if Android refused (then the app falls back to plain notifications). */
export async function sendLiveTimer(config: LiveTimerConfig, sound: boolean, vibrate: boolean): Promise<boolean> {
  if (!liveTimerAvailable()) return false;
  try {
    await TimerService.update({ ...config, sound, vibrate });
    return true;
  } catch {
    return false;
  }
}

export async function stopLiveTimer(): Promise<void> {
  if (!liveTimerAvailable()) return;
  try {
    await TimerService.stop();
  } catch {
    // Nothing running.
  }
}

export async function onLiveTimerAction(handler: (action: LiveAction) => void): Promise<() => void> {
  if (!liveTimerAvailable()) return () => {};
  const handle = await TimerService.addListener("action", handler);
  return () => void handle.remove();
}

/** Notification button presses the page hasn't applied yet, oldest first. */
export async function takeLiveActions(): Promise<LiveAction[]> {
  if (!liveTimerAvailable()) return [];
  try {
    return (await TimerService.takeActions()).actions ?? [];
  } catch {
    return [];
  }
}
