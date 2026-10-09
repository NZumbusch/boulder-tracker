/**
 * The timer's cue settings that are more than an on/off: how loud, whether
 * that moves the phone's media volume, and the spoken announcements
 * (which exercise to say, and when - before a set, at the start of a rest,
 * before it ends). One validated object so a stored value can never put the
 * timer in a state it can't play.
 */
export interface AnnounceRules {
  /** Master switch. */
  enabled: boolean;
  /**
   * "auto": the timer works out what to say and when from each rest's length and how long the words take (the rules below are ignored).
   * "custom": the rules below, to the second.
   */
  mode: "auto" | "custom";
  /** Say the exercise's name when its set starts... */
  work: boolean;
  /** ...this many seconds before it starts (0 = on the start; up to 30, during the rest before). */
  workLead: number;
  /** Say "next: X" when a rest or a switch begins... */
  restStart: boolean;
  /** ...this many seconds after it begins. */
  restStartDelay: number;
  /** Say "next: X" this many seconds before a rest ends (0 = off) - for the long rests, when the phone is down. */
  restEnd: number;
}

/** The beep styles (their tones are in `cueSound.ts`). */
export const SOUND_PRESETS = ["classic", "soft", "sharp", "chime"] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number];

/** How announcements sound. Engine and voice are the phone's own (Android), by name; null = its default. */
export interface SpeechVoice {
  engine: string | null;
  voice: string | null;
  /** Speaking speed, 0.5 - 2 (1 = normal). */
  rate: number;
  /** 0.5 - 2 (1 = normal). */
  pitch: number;
}

export interface TimerCues {
  /** Cue loudness, 0.1 - 1 (1 = as before this setting existed). */
  volume: number;
  /** While a cue plays (Android), the phone's media volume is set to `volume` of its maximum, then put back. */
  volumeSetsMedia: boolean;
  /** Which set of beeps. */
  sound: SoundPreset;
  /**
   * What happens to a podcast or audiobook playing meanwhile (Android):
   * "lower" asks it to get quieter for each cue; "mix" plays the cue over it
   * without asking, for players that stop instead of lowering.
   */
  otherAudio: "lower" | "mix";
  announce: AnnounceRules;
  speech: SpeechVoice;
}

export const DEFAULT_ANNOUNCE: AnnounceRules = { enabled: true, mode: "auto", work: true, workLead: 0, restStart: true, restStartDelay: 0, restEnd: 0 };
export const DEFAULT_SPEECH: SpeechVoice = { engine: null, voice: null, rate: 1, pitch: 1 };
export const DEFAULT_TIMER_CUES: TimerCues = { volume: 1, volumeSetsMedia: false, sound: "classic", otherAudio: "lower", announce: { ...DEFAULT_ANNOUNCE }, speech: { ...DEFAULT_SPEECH } };

export const ANNOUNCE_LIMITS = { workLead: { min: 0, max: 30 }, restStartDelay: { min: 0, max: 30 }, restEnd: { min: 0, max: 60 } } as const;

export function validateTimerCues(raw: unknown): TimerCues {
  const d = DEFAULT_TIMER_CUES;
  if (typeof raw !== "object" || raw === null) return { ...d, announce: { ...d.announce }, speech: { ...d.speech } };
  const c = raw as Record<string, unknown>;
  const a = typeof c.announce === "object" && c.announce !== null ? (c.announce as Record<string, unknown>) : {};
  const sp = typeof c.speech === "object" && c.speech !== null ? (c.speech as Record<string, unknown>) : {};
  const name = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null);
  const factor = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(2, Math.max(0.5, Math.round(v * 20) / 20)) : def);
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const secs = (v: unknown, def: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
  const L = ANNOUNCE_LIMITS;
  return {
    volume: typeof c.volume === "number" && Number.isFinite(c.volume) ? Math.min(1, Math.max(0.1, Math.round(c.volume * 100) / 100)) : d.volume,
    volumeSetsMedia: bool(c.volumeSetsMedia, d.volumeSetsMedia),
    sound: SOUND_PRESETS.includes(c.sound as SoundPreset) ? (c.sound as SoundPreset) : d.sound,
    otherAudio: c.otherAudio === "mix" ? "mix" : "lower",
    announce: {
      enabled: bool(a.enabled, DEFAULT_ANNOUNCE.enabled),
      // A value saved before Auto existed was tuned by hand: it stays as it was.
      mode: a.mode === "auto" || a.mode === "custom" ? a.mode : typeof a.enabled === "boolean" ? "custom" : DEFAULT_ANNOUNCE.mode,
      work: bool(a.work, DEFAULT_ANNOUNCE.work),
      workLead: secs(a.workLead, DEFAULT_ANNOUNCE.workLead, L.workLead.min, L.workLead.max),
      restStart: bool(a.restStart, DEFAULT_ANNOUNCE.restStart),
      restStartDelay: secs(a.restStartDelay, DEFAULT_ANNOUNCE.restStartDelay, L.restStartDelay.min, L.restStartDelay.max),
      restEnd: secs(a.restEnd, DEFAULT_ANNOUNCE.restEnd, L.restEnd.min, L.restEnd.max),
    },
    speech: { engine: name(sp.engine), voice: name(sp.voice), rate: factor(sp.rate, 1), pitch: factor(sp.pitch, 1) },
  };
}
