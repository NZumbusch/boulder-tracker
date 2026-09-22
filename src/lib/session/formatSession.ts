/**
 * Display formatting for a running session. Separate from
 * `activeSession.ts` (which is behaviour) and pure, so the readouts the
 * bubble and the modal header share can't drift apart.
 */

/**
 * Elapsed milliseconds as a clock: `M:SS` under an hour, `H:MM:SS` over
 * it. Seconds are shown because during a session this is a stopwatch -
 * a readout that only changes once a minute reads as frozen.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}`
    : `${minutes}:${ss}`;
}

/** Whole minutes as `45m` / `1h 52m` - for durations being compared, not counted up. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
