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
import type { SpeechVoice } from "../timer/timerCues";

export type LiveAction = {
  kind: "pause" | "resume" | "add30" | "sessionPause" | "sessionResume";
  at: number;
  seq: number;
  /** A session pause that also paused the timer (or a session resume that resumed it) - the service did it while the page slept. */
  withTimer?: boolean;
};

/** How the service plays its cues (the plan says when). */
export interface ServiceOptions {
  sound: boolean;
  vibrate: boolean;
  /** 0.1 - 1. */
  volume: number;
  /** Set the phone's media volume to `volume` while a cue plays, then restore it. */
  volumeSetsMedia: boolean;
  /** The beep style's tones: cue kind -> [frequency Hz, length ms, delay ms, gain?][]. */
  tones: Record<string, (number | undefined)[][]>;
  /** How announcements sound. */
  speech: SpeechVoice;
}

/** What the phone's text-to-speech offers (Android). */
export interface SpeechChoices {
  engines: { name: string; label: string }[];
  /** The engine the voices belong to (the phone's default when none was asked for). */
  engine: string;
  voices: { name: string; locale: string; network: boolean }[];
}

interface TimerServicePlugin {
  start(options: LiveTimerConfig & ServiceOptions): Promise<void>;
  update(options: LiveTimerConfig & ServiceOptions): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<{ running: boolean }>;
  takeActions(): Promise<{ actions: LiveAction[] }>;
  speechChoices(options: { engine: string | null }): Promise<SpeechChoices>;
  measureSpeech(options: { texts: string[] } & SpeechVoice): Promise<{ seconds: number[] }>;
  previewSpeech(options: { text: string; volume: number; volumeSetsMedia: boolean } & SpeechVoice): Promise<void>;
  addListener(event: "action", handler: (action: LiveAction) => void): Promise<PluginListenerHandle>;
}

const TimerService = registerPlugin<TimerServicePlugin>("TimerService");

export const liveTimerAvailable = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** Sends the current plan; resolves false if Android refused (then the app falls back to plain notifications). */
export async function sendLiveTimer(config: LiveTimerConfig, options: ServiceOptions): Promise<boolean> {
  if (!liveTimerAvailable()) return false;
  try {
    await TimerService.update({ ...config, ...options });
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

/** The engines and voices the phone has; null when there is no native speech (web) or it did not answer. */
export async function loadSpeechChoices(engine: string | null): Promise<SpeechChoices | null> {
  if (!liveTimerAvailable()) return null;
  try {
    return await TimerService.speechChoices({ engine });
  } catch {
    return null;
  }
}

/** Says `text` once, with the chosen engine and voice - exactly as the timer service will. */
export async function previewNativeSpeech(text: string, speech: SpeechVoice, volume: number, volumeSetsMedia: boolean): Promise<boolean> {
  if (!liveTimerAvailable()) return false;
  try {
    await TimerService.previewSpeech({ text, volume, volumeSetsMedia, ...speech });
    return true;
  } catch {
    return false;
  }
}

/** How long each text takes to say with this voice (rendered by the engine, not played); `null` for one that could not be told. */
export async function measureNativeSpeech(texts: string[], speech: SpeechVoice): Promise<(number | null)[] | null> {
  if (!liveTimerAvailable() || texts.length === 0) return null;
  try {
    const { seconds } = await TimerService.measureSpeech({ texts, ...speech });
    return texts.map((_, i) => (typeof seconds?.[i] === "number" && seconds[i] > 0 ? seconds[i] : null));
  } catch {
    return null;
  }
}
