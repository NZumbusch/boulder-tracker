/**
 * The timer's cues as the page plays them: short synthesized tones (Web
 * Audio) and vibration patterns - one per event, each recognisable
 * without looking: a rising pair to go, a single tone to come off, a
 * falling triple for the long rest, a rising triple when it's all done,
 * a double for the 15 s warning, a click for the 3-2-1.
 *
 * The Android timer service plays the same tones natively while the app is
 * in the background (`plugins/timer-service/.../CuePlayer.java`): the page
 * hands it the chosen style's table with the plan (`tonesFor`), so a new
 * style only has to be added here.
 *
 * Synthesized rather than bundled audio files, and created lazily on a
 * real user gesture - the unlock browsers require for Web Audio.
 */

import type { SoundPreset } from "./timerCues";

export type CueKind = "work" | "rest" | "setRest" | "leadIn" | "done" | "tick" | "warn";

/** [frequency Hz, length ms, delay ms, gain?] */
type Tone = [number, number, number, number?];

/** Each beep style: the same seven cues, in a different voice. "classic" is the original. */
export const CUE_PRESETS: Record<SoundPreset, Record<CueKind, Tone[]>> = {
  classic: {
    warn: [[740, 90, 0], [740, 90, 160]],
    work: [[880, 120, 0], [1320, 220, 120]],
    rest: [[660, 260, 0]],
    setRest: [[660, 180, 0], [520, 180, 190], [400, 320, 380]],
    leadIn: [[520, 200, 0]],
    done: [[660, 180, 0], [880, 180, 190], [1320, 420, 380]],
    tick: [[1000, 70, 0, 0.12]],
  },
  // Lower and rounder - easier on the ears in a quiet room.
  soft: {
    warn: [[440, 120, 0], [440, 120, 190]],
    work: [[523, 150, 0], [784, 280, 150]],
    rest: [[392, 320, 0]],
    setRest: [[392, 200, 0], [330, 200, 210], [262, 380, 420]],
    leadIn: [[330, 240, 0]],
    done: [[392, 200, 0], [523, 200, 210], [784, 480, 420]],
    tick: [[660, 80, 0, 0.1]],
  },
  // High and short - cuts through a loud gym.
  sharp: {
    warn: [[1568, 60, 0], [1568, 60, 110]],
    work: [[1760, 80, 0], [2093, 150, 100]],
    rest: [[1175, 170, 0]],
    setRest: [[1175, 120, 0], [988, 120, 130], [784, 220, 260]],
    leadIn: [[1047, 120, 0]],
    done: [[1175, 120, 0], [1568, 120, 130], [2093, 320, 260]],
    tick: [[2000, 45, 0, 0.1]],
  },
  // Bell-like pairs that ring out.
  chime: {
    warn: [[988, 200, 0], [988, 200, 220]],
    work: [[784, 320, 0], [1175, 520, 160]],
    rest: [[587, 520, 0]],
    setRest: [[784, 300, 0], [659, 300, 260], [523, 560, 520]],
    leadIn: [[659, 300, 0]],
    done: [[523, 280, 0], [659, 280, 240], [784, 280, 480], [1047, 700, 720]],
    tick: [[1319, 90, 0, 0.1]],
  },
};

export const CUE_TONES = CUE_PRESETS.classic;

export const SOUND_PRESET_LABELS: Record<SoundPreset, { label: string; hint: string }> = {
  classic: { label: "Classic", hint: "The original beeps" },
  soft: { label: "Soft", hint: "Lower and rounder" },
  sharp: { label: "Sharp", hint: "High and short, cuts through a loud gym" },
  chime: { label: "Chime", hint: "Bell-like, rings out" },
};

export const CUE_VIBRATION: Record<CueKind, number | number[]> = {
  warn: [80, 80, 80],
  work: [120, 60, 220],
  rest: 180,
  setRest: [160, 80, 160, 80, 260],
  leadIn: 100,
  done: [200, 100, 200, 100, 400],
  tick: 40,
};

export class CueSound {
  private audioContext: AudioContext | null = null;

  constructor(private readonly enabled: { sound: () => boolean; vibrate: () => boolean; volume?: () => number; preset?: () => SoundPreset }) {}

  /**
   * Creates (or resumes) the AudioContext - call it synchronously inside a
   * real tap. Cues fire from effects, after the gesture has ended, and a
   * context first created there starts suspended and never makes a sound.
   */
  unlock(): void {
    if (!this.enabled.sound()) return;
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === "suspended") void this.audioContext.resume();
    } catch {
      // Web Audio unavailable - degrade silently, like vibration and keep-awake.
    }
  }

  /** Plays a cue; `preset` overrides the chosen style (a preview in settings). */
  play(kind: CueKind, preset?: SoundPreset): void {
    const style = preset ?? this.enabled.preset?.() ?? "classic";
    for (const [frequency, durationMs, delayMs, gain] of CUE_PRESETS[style][kind]) this.tone(frequency, durationMs, delayMs, gain);
    this.buzz(CUE_VIBRATION[kind]);
  }

  private tone(frequency: number, durationMs: number, delayMs: number, gain = 0.2): void {
    if (!this.enabled.sound()) return;
    try {
      this.audioContext ??= new AudioContext();
      const ctx = this.audioContext;
      const start = ctx.currentTime + delayMs / 1000;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.frequency.value = frequency;
      amp.gain.setValueAtTime(gain * (this.enabled.volume?.() ?? 1), start);
      amp.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + durationMs / 1000);
    } catch {
      // Web Audio unavailable or blocked.
    }
  }

  private buzz(pattern: number | number[]): void {
    if (!this.enabled.vibrate()) return;
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // No vibration.
    }
  }
}

/** The chosen style's tones in the shape the Android service takes: cue kind -> [freq, ms, delay, gain][]. */
export function tonesFor(preset: SoundPreset): Record<CueKind, Tone[]> {
  return CUE_PRESETS[preset] ?? CUE_PRESETS.classic;
}
