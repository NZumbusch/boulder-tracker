/**
 * What a running circuit shows outside its own screen: the minimised pill
 * in the session, and the session's corner bubble when the whole session is
 * minimised. `CircuitRunner` writes it; the pill and the bubble read it and
 * can ask for the runner to be opened or paused.
 */
export const circuitHud = $state({
  /** A circuit is mounted and not finished. */
  active: false,
  /** "Rest" / "Go" / "Switch" / "Get ready" / "Paused". */
  phase: "",
  /** The exercise on, or coming up. */
  exercise: "",
  /** The step's clock as shown: a countdown, or the count-up of an open set. */
  time: "",
  running: false,
  /** CSS colour of the phase. */
  accent: "",
  /** Set by the pill/bubble; the session opens the runner and clears it. */
  openRequested: false,
});

let toggle: (() => void) | null = null;

/** The runner registers its pause/resume so the pill can offer it. */
export function setCircuitToggle(fn: (() => void) | null) {
  toggle = fn;
}

export function toggleCircuit() {
  toggle?.();
}

export function resetCircuitHud() {
  circuitHud.active = false;
  circuitHud.openRequested = false;
  toggle = null;
}
