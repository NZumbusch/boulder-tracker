/**
 * Muting the timer's sound: the beeps and spoken announcements stop (so they
 * don't cut across a podcast or music), the haptics stay. Muted and a cue
 * volume of 0 are the same thing - the mute button drops the volume to 0
 * and remembers the level it came from, and dragging the slider to 0 reads
 * as muted. Unmuting (button, or any slider move) brings the level back.
 */
import { trainingState } from '../state.svelte';

/** Where the volume was before the button muted it; null when 0 is the user's own setting. */
let restoreTo: number | null = null;
const FALLBACK_VOLUME = 0.6;

export const cueMute = {
  get muted() {
    return trainingState.timerCues.volume <= 0;
  },
};

export function toggleCueMute() {
  setCueMuted(!cueMute.muted);
}

export function setCueMuted(muted: boolean) {
  if (muted === cueMute.muted) return;
  if (muted) {
    restoreTo = trainingState.timerCues.volume;
    trainingState.setTimerCues({ volume: 0 });
  } else if (restoreTo !== null) {
    trainingState.setTimerCues({ volume: restoreTo || FALLBACK_VOLUME });
    restoreTo = null;
  } else {
    trainingState.setTimerCues({ volume: FALLBACK_VOLUME });
  }
}

/** The session ended: undo a mute the button made, but leave a volume of 0 the user chose themselves. */
export function endSessionMute() {
  if (restoreTo !== null && cueMute.muted) setCueMuted(false);
  restoreTo = null;
}
