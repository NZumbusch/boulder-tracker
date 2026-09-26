import { trainingState } from "../state.svelte";
import { _dbState, initDB, setDbState, setDemoMode } from "../storage/persistence";
import { buildDemoData } from "./demoData";
import { TOUR_STEPS, type TourStep } from "./steps";

/**
 * Runs the launch tour (`TOUR_STEPS`, drawn by `TourOverlay.svelte`) on
 * example data.
 *
 * The example data replaces the in-memory database for the tour's length
 * and the real one is put back afterwards. Demo mode (persistence.ts)
 * blocks every write, sync, backup, reminder and widget update meanwhile,
 * and the overlay swallows all taps, so the tour can't change anything -
 * the real data is never touched, only set aside.
 */
class Tour {
  active = $state(false);
  index = $state(0);
  #real: unknown = null;

  get step(): TourStep {
    return TOUR_STEPS[this.index];
  }
  get count(): number {
    return TOUR_STEPS.length;
  }

  async start(): Promise<void> {
    if (this.active || trainingState.isSessionActive) return;
    await initDB();
    this.#real = _dbState;
    setDemoMode(true);
    setDbState(buildDemoData());
    trainingState.demoActive = true;
    await trainingState.refresh();
    trainingState.selectedWeekId = trainingState.currentWeekId;
    this.index = 0;
    this.active = true;
    trainingState.navigate(this.step.view);
  }

  go(index: number): void {
    if (!this.active) return;
    this.index = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    if (trainingState.view !== this.step.view) trainingState.navigate(this.step.view);
  }

  next(): void {
    if (this.index === TOUR_STEPS.length - 1) void this.end();
    else this.go(this.index + 1);
  }

  back(): void {
    this.go(this.index - 1);
  }

  async end(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    setDbState(this.#real);
    this.#real = null;
    setDemoMode(false);
    trainingState.demoActive = false;
    await trainingState.refresh();
    trainingState.navigate("home");
  }
}

export const tour = new Tour();
