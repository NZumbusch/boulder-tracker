import { SPEECH_PAUSE, SPEECH_PAUSE_SECONDS } from "./announcePlan";

/**
 * Spoken announcements in the page - the fallback for when the Android
 * timer service isn't the one speaking (web, or the service refused). The
 * service has its own text-to-speech for a locked phone.
 *
 * A `SPEECH_PAUSE` in the text is a short silence: the parts are spoken one
 * after the other with a gap (the browser has no silent utterance).
 */
let current = 0;

export function speakText(text: string, volume = 1, rate = 1, pitch = 1): void {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const parts = text.split(SPEECH_PAUSE).filter(Boolean);
  const id = ++current; // a newer announcement ends the rest of an older one
  try {
    window.speechSynthesis.cancel(); // a late announcement should not queue up behind an old one
    const say = (i: number) => {
      if (id !== current || i >= parts.length) return;
      const utterance = new SpeechSynthesisUtterance(parts[i]);
      utterance.volume = Math.min(1, Math.max(0, volume));
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onend = () => setTimeout(() => say(i + 1), SPEECH_PAUSE_SECONDS * 1000);
      window.speechSynthesis.speak(utterance);
    };
    say(0);
  } catch {
    // No speech available - the beeps still play.
  }
}
