/**
 * Spoken announcements in the page - the fallback for when the Android
 * timer service isn't the one speaking (web, or the service refused). The
 * service has its own text-to-speech for a locked phone.
 */
export function speakText(text: string, volume = 1): void {
  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = Math.min(1, Math.max(0, volume));
    window.speechSynthesis.cancel(); // a late announcement should not queue up behind an old one
    window.speechSynthesis.speak(utterance);
  } catch {
    // No speech available - the beeps still play.
  }
}
