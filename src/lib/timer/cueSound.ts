/**
 * The timer's cues as the page plays them: short synthesized tones (Web
 * Audio) and vibration patterns - one per event, each recognisable
 * without looking: a rising pair to go, a single tone to come off, a
 * falling triple for the long rest, a rising triple when it's all done,
 * a double for the 15 s warning, a click for the 3-2-1.
 *
 * The Android timer service plays the same table natively while the app is
 * in the background (`plugins/timer-service/.../CuePlayer.java`) - keep
 * the two in step.
 *
 * Synthesized rather than bundled audio files, and created lazily on a
 * real user gesture - the unlock browsers require for Web Audio.
 */

export type CueKind = "work" | "rest" | "setRest" | "leadIn" | "done" | "tick" | "warn";

/** [frequency Hz, length ms, delay ms, gain?] */
type Tone = [number, number, number, number?];

export const CUE_TONES: Record<CueKind, Tone[]> = {
  warn: [[740, 90, 0], [740, 90, 160]],
  work: [[880, 120, 0], [1320, 220, 120]],
  rest: [[660, 260, 0]],
  setRest: [[660, 180, 0], [520, 180, 190], [400, 320, 380]],
  leadIn: [[520, 200, 0]],
  done: [[660, 180, 0], [880, 180, 190], [1320, 420, 380]],
  tick: [[1000, 70, 0, 0.12]],
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

  constructor(private readonly enabled: { sound: () => boolean; vibrate: () => boolean }) {}

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

  play(kind: CueKind): void {
    for (const [frequency, durationMs, delayMs, gain] of CUE_TONES[kind]) this.tone(frequency, durationMs, delayMs, gain);
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
      amp.gain.setValueAtTime(gain, start);
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
