/**
 * The "Auto" way of speaking the exercises: instead of fixed offsets, it
 * looks at how long each rest is and how long the words take to say, and
 * picks what to say and when so that it fits - finishing before the set
 * starts and keeping clear of the 3-2-1 beeps and the warning beep.
 *
 * Pure: `circuitRun.buildCircuitLive` asks it per rest and puts the answer
 * on the schedule.
 */

/** Marks the short silent break inside an announcement ("Next" ... "Push-ups"); the speakers split on it. */
export const SPEECH_PAUSE = "\u001f";
export const SPEECH_PAUSE_SECONDS = 0.4;

/** "Next", a beat, then the name - the plain way of saying what is coming. */
export const nextText = (name: string) => `Next${SPEECH_PAUSE}${name}`;

/** Spoken characters per second at normal speed (a typical TTS voice, a little on the slow side so we over- rather than under-estimate). */
const CHARS_PER_SECOND = 12;
/** Engine start-up and the tail of the last word. */
const SPEECH_OVERHEAD_SECONDS = 0.35;

/** What the phone's speech engine measured for a phrase, in seconds; `undefined` if it has not (yet). */
export type SpeechMeasure = (part: string) => number | undefined;

/** Tail of the last word and the engine's start-up when a measured phrase is played. */
const MEASURED_OVERHEAD_SECONDS = 0.2;

/**
 * How long `text` takes to say, pauses included: the measured length of its
 * parts when the engine has told us all of them, otherwise a guess from the
 * characters and the speaking speed `rate` (1 = normal).
 */
export function estimateSpeechSeconds(text: string, rate = 1, measure?: SpeechMeasure): number {
  const parts = text.split(SPEECH_PAUSE);
  const measured = measure ? parts.map((p) => (p ? measure(p) : 0)) : [];
  if (measure && measured.every((m): m is number => m !== undefined)) {
    return measured.reduce((a, b) => a + b, 0) + MEASURED_OVERHEAD_SECONDS + (parts.length - 1) * SPEECH_PAUSE_SECONDS;
  }
  const chars = parts.join(" ").length;
  const speed = Math.min(2, Math.max(0.5, rate));
  return chars / CHARS_PER_SECOND / speed + SPEECH_OVERHEAD_SECONDS + (parts.length - 1) * SPEECH_PAUSE_SECONDS;
}

/** "12 reps", "40 seconds", "1 minute 30" - the set's target, or "" when it has none. */
export function targetSpeech(target: { reps?: number; seconds?: number }): string {
  if (target.reps && target.reps > 0) return `${target.reps} ${target.reps === 1 ? "rep" : "reps"}`;
  const s = Math.round(target.seconds ?? 0);
  if (s <= 0) return "";
  if (s < 60) return `${s} ${s === 1 ? "second" : "seconds"}`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m} ${m === 1 ? "minute" : "minutes"}${rest ? ` ${rest}` : ""}`;
}

/** Name and target as one phrase: "Push-ups, 12 reps". */
export const exercisePhrase = (name: string, target: string) => (target ? `${name}, ${target}` : name);

/** Gap kept after a step begins, so speech does not talk over the step's own beep. */
export const START_MARGIN = 0.7;
const TICK_GUARD = 3.5;
const PLAIN_GUARD = 0.5;
/** A reminder is only worth it if it sits at least this long after the first announcement. */
const MIN_REMINDER_GAP = 12;

export interface RestSpeechInput {
  kind: "leadIn" | "transition" | "roundRest";
  /** The rest's length, in seconds. */
  seconds: number;
  /** The exercise that comes next, and its target phrase ("12 reps", or ""). */
  name: string;
  target: string;
  /** Speaking speed of the voice. */
  rate: number;
  /** The engine's own timing of phrases, when it has given any. */
  measure?: SpeechMeasure;
  /** A later round: the listener knows the routine, so say less (no "Rest."). */
  trimmed?: boolean;
  /** The 3-2-1 beeps are on. */
  ticks: boolean;
  /** Seconds before the end of a round rest at which the warning beep sounds (0 = none). */
  warningSeconds: number;
}

export interface RestSpeech {
  /** Things to say, each at an offset in seconds from the start of the rest. */
  cues: { offset: number; text: string }[];
  /** Whether the next exercise was named during the rest (if not, say it as the set starts). */
  covered: boolean;
}

export function planRestSpeech(i: RestSpeechInput): RestSpeech {
  const tickGuard = i.ticks && i.seconds > 4 ? TICK_GUARD : PLAIN_GUARD;
  const warns = i.kind === "roundRest" && i.warningSeconds > 0 && i.seconds > i.warningSeconds + 3;
  const endGuard = Math.max(tickGuard, warns ? i.warningSeconds + PLAIN_GUARD : 0);
  const phrase = exercisePhrase(i.name, i.target);
  const prefix = i.trimmed ? "" : i.kind === "roundRest" ? "Rest. " : i.kind === "leadIn" ? "Get ready. " : "";
  // Fullest first; the first one that fits the rest is used.
  const candidates = [...(prefix ? [`${prefix}Next${SPEECH_PAUSE}${phrase}`] : []), `Next${SPEECH_PAUSE}${phrase}`, phrase, i.name];
  const room = i.seconds - START_MARGIN - tickGuard;
  const first = candidates.find((text) => estimateSpeechSeconds(text, i.rate, i.measure) <= room);
  if (!first) return { cues: [], covered: false };

  const cues = [{ offset: START_MARGIN, text: first }];
  if (i.kind !== "leadIn") {
    // The long rests: say it again, timed to end just before the guard at the end.
    const reminder = `Next${SPEECH_PAUSE}${phrase}`;
    const length = estimateSpeechSeconds(reminder, i.rate, i.measure);
    const offset = i.seconds - endGuard - length - 0.5;
    const firstEnds = START_MARGIN + estimateSpeechSeconds(first, i.rate, i.measure);
    if (offset >= firstEnds + MIN_REMINDER_GAP) cues.push({ offset, text: reminder });
  }
  return { cues, covered: true };
}
