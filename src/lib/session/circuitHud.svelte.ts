import type { ExerciseValues } from "../types";

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
  /** The run has been started (not still waiting for Start), and how many sets it has recorded - what stopping the session would keep. */
  started: false,
  sets: 0,
  /** The circuit's name, for what is said about it. */
  name: "",
});

let toggle: (() => void) | null = null;
let settler: (() => Record<string, ExerciseValues | undefined>) | null = null;

/** The runner registers what it has recorded so far, for the session to log when it is stopped. */
export function setCircuitSettler(fn: (() => Record<string, ExerciseValues | undefined>) | null) {
  settler = fn;
}

/** What each member of the running circuit did so far (undefined = no set done); `null` when none runs. */
export function settleCircuit(): Record<string, ExerciseValues | undefined> | null {
  return settler ? settler() : null;
}

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
  circuitHud.started = false;
  circuitHud.sets = 0;
  circuitHud.name = "";
  toggle = null;
  settler = null;
}
