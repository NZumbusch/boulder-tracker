import { measureNativeSpeech } from "../native/timerService";
import type { SpeechVoice } from "./timerCues";
import type { SpeechMeasure } from "./announcePlan";

/**
 * The real length of spoken phrases, from the phone's own speech engine
 * (Android renders each one to audio without playing it). Remembered per
 * voice, speed and pitch, so each phrase is measured once. A planner that
 * asks for a phrase not yet known gets `undefined` and falls back to its
 * estimate; the phrase is recorded as missing so `measureMissing` can fetch
 * it and the plan can be made again with the real length.
 */
const known = new Map<string, number>();
/** Phrases that failed to measure, so they are not asked for again and again. */
const failed = new Set<string>();

const voiceKey = (s: SpeechVoice) => `${s.engine ?? ""}|${s.voice ?? ""}|${s.rate}|${s.pitch}`;
const keyOf = (s: SpeechVoice, part: string) => `${voiceKey(s)}|${part}`;

export interface Measurer {
  measure: SpeechMeasure;
  /** Phrases the planner asked about that are not known yet. */
  missing: () => string[];
}

export function measurerFor(speech: SpeechVoice): Measurer {
  const missing = new Set<string>();
  return {
    measure: (part) => {
      const k = keyOf(speech, part);
      const seconds = known.get(k);
      if (seconds === undefined && !failed.has(k)) missing.add(part);
      return seconds;
    },
    missing: () => [...missing],
  };
}

/** Measures `parts` with this voice; true if anything new was learned. */
export async function measureMissing(parts: string[], speech: SpeechVoice): Promise<boolean> {
  const wanted = [...new Set(parts)];
  if (wanted.length === 0) return false;
  const result = await measureNativeSpeech(wanted, speech);
  let learned = false;
  wanted.forEach((part, i) => {
    const k = keyOf(speech, part);
    const seconds = result?.[i];
    if (typeof seconds === "number") {
      known.set(k, seconds);
      learned = true;
    } else {
      failed.add(k);
    }
  });
  return learned;
}
