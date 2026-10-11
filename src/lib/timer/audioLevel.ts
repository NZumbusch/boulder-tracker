/**
 * One dial for how much the timer interrupts whatever else is playing: a
 * shortcut over the individual settings (beeps, the 3-2-1, spoken
 * announcements), which stay editable. The level is never stored - it is
 * read back from those settings, and "custom" is what is left when they
 * match none of the steps.
 */
import type { TimerCues } from "./timerCues";

export const AUDIO_LEVELS = ["silent", "beeps", "voice", "full"] as const;
export type AudioLevel = (typeof AUDIO_LEVELS)[number];

export const AUDIO_LEVEL_LABELS: Record<AudioLevel, { label: string; hint: string }> = {
  silent: { label: "Silent", hint: "No beeps, no voice. Vibration and the notification carry on." },
  beeps: { label: "Beeps", hint: "One beep when a set or rest changes. No 3-2-1, no voice." },
  voice: { label: "Voice", hint: "Only the spoken announcements (the next exercise). No beeps." },
  full: { label: "Everything", hint: "Beeps, the 3-2-1 and the spoken announcements." },
};

/** The sound-related settings a level looks at and sets. */
export interface AudioState {
  beep: boolean;
  ticks: boolean;
  warn: boolean;
  announce: boolean;
}

export function audioStateOf(beep: boolean, ticks: boolean, warn: boolean, cues: TimerCues): AudioState {
  return { beep, ticks, warn, announce: cues.announce.enabled };
}

/** What each step sets. The 15 s warning is a beep too, so every step below "everything" turns it off; "everything" leaves it as it is. */
export function settingsFor(level: AudioLevel, current: AudioState): AudioState {
  switch (level) {
    case "silent": return { beep: false, ticks: false, warn: false, announce: false };
    case "beeps": return { beep: true, ticks: false, warn: false, announce: false };
    case "voice": return { beep: false, ticks: false, warn: false, announce: true };
    case "full": return { beep: true, ticks: true, warn: current.warn, announce: true };
  }
}

/** The step the settings sit on, or "custom". The 15 s warning only counts where it could be heard. */
export function levelOf(s: AudioState): AudioLevel | "custom" {
  for (const level of AUDIO_LEVELS) {
    const want = settingsFor(level, s);
    if (want.beep === s.beep && want.ticks === s.ticks && want.announce === s.announce && want.warn === s.warn) return level;
  }
  return "custom";
}
