/**
 * A pausable clock kept as timestamps, not as a counter.
 *
 * The stopwatch and countdown used to add one per `setInterval` tick. A
 * phone throttles or stops timers for a backgrounded app, so a counter
 * falls behind the moment the screen locks - a three-minute rest could
 * still read 2:40 when you came back. Time banked from earlier stretches
 * plus "running since" is exact whenever it is read, and survives the app
 * being killed (it is saved with the rest of the timer state).
 */

export interface Clock {
  /** Running time banked from previous stretches, in ms. */
  bankedMs: number;
  /** Epoch ms the current stretch began, or `null` while stopped. */
  runningSince: number | null;
}

export const STOPPED_CLOCK: Clock = { bankedMs: 0, runningSince: null };

export function clockElapsedMs(clock: Clock, now: number): number {
  return clock.bankedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}

export function startClock(clock: Clock, now: number): Clock {
  return clock.runningSince === null ? { ...clock, runningSince: now } : clock;
}

export function pauseClock(clock: Clock, now: number): Clock {
  return clock.runningSince === null ? clock : { bankedMs: clockElapsedMs(clock, now), runningSince: null };
}

/** A countdown's time left in ms, floored at 0. */
export function countdownRemainingMs(targetSeconds: number, clock: Clock, now: number): number {
  return Math.max(0, targetSeconds * 1000 - clockElapsedMs(clock, now));
}
