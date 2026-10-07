/**
 * Muting the timer's sound for now, without touching Settings: the beeps
 * and spoken announcements stop (so they don't cut across a podcast or
 * music), the haptics stay. Lives only for the page - a reload or the end
 * of the session ends it, so the next session never starts silent by
 * accident, and the saved volume is never changed.
 */
export const cueMute = $state({ muted: false });

export function toggleCueMute() {
  cueMute.muted = !cueMute.muted;
}

export function setCueMuted(muted: boolean) {
  cueMute.muted = muted;
}
