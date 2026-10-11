import { trainingState } from "../state.svelte";
import { _dbState, initDB, setDbState, setDemoMode } from "../storage/persistence";
import { buildDemoData } from "./demoData";
import { TOUR_STEPS, type TourStep } from "./steps";
import { openWorkout, closeWorkout, workoutModal } from "../workoutModal.svelte";
import { checklistState } from "../home/checklistState.svelte";
import { toast } from "../toast.svelte";

/**
 * Runs the launch tour (`TOUR_STEPS`, drawn by `TourOverlay.svelte`) on
 * example data.
 *
 * The example data replaces the in-memory database for the tour's length
 * and the real one is put back afterwards. Demo mode (persistence.ts)
 * blocks every write, sync, backup, reminder and widget update meanwhile,
 * and the overlay swallows all taps, so the tour can't change anything -
 * the real data is never touched, only set aside.
 *
 * The same example data also backs "look around" (`startExample`): no
 * steps and no tap-swallowing overlay, just a banner with Exit
 * (ExampleDataBanner.svelte). Starting a session is refused while it runs
 * (`trainingState.startSession`); anything else done in it is in memory
 * only and goes with the example data.
 */
class Tour {
  active = $state(false);
  /** "Look around" is on: example data without the guided steps. */
  example = $state(false);
  index = $state(0);
  #real: unknown = null;
  /** The tour opened the session viewer (a step's `openWorkout`) and closes it again. */
  #openedWorkout = false;

  get step(): TourStep {
    return TOUR_STEPS[this.index];
  }
  get count(): number {
    return TOUR_STEPS.length;
  }

  /** Swaps the example data in for the real data (kept aside) and blocks every write. */
  async #enter(): Promise<void> {
    await initDB();
    this.#real = _dbState;
    setDemoMode(true);
    setDbState(buildDemoData());
    trainingState.demoActive = true;
    await trainingState.refresh();
    trainingState.selectedWeekId = trainingState.currentWeekId;
  }

  /** Puts the real data back. */
  async #leave(): Promise<void> {
    setDbState(this.#real);
    this.#real = null;
    setDemoMode(false);
    trainingState.demoActive = false;
    await trainingState.refresh();
    trainingState.navigate("home");
  }

  async start(): Promise<void> {
    if (this.active || this.example || trainingState.isSessionActive) return;
    checklistState.markTourSeen();
    await this.#enter();
    this.index = 0;
    this.active = true;
    trainingState.navigate(this.step.view);
  }

  /** "Look around with example data": the real data set aside until `endExample`. */
  async startExample(): Promise<void> {
    if (this.active || this.example || trainingState.isSessionActive) return;
    toast.dismiss();
    await this.#enter();
    this.example = true;
    trainingState.navigate("home");
  }

  async endExample(): Promise<void> {
    if (!this.example) return;
    this.example = false;
    await this.#leave();
  }

  go(index: number): void {
    if (!this.active) return;
    this.index = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    if (trainingState.view !== this.step.view) trainingState.navigate(this.step.view);
    this.#syncWorkout();
  }

  /** Opens the step's session in the viewer, or closes the one an earlier step opened. */
  #syncWorkout(): void {
    const id = this.step.openWorkout;
    const workout = id ? trainingState.workouts.find((w) => w.id === id) : undefined;
    if (workout) {
      if (workoutModal.workout?.id !== id) openWorkout(workout, "view");
      this.#openedWorkout = true;
    } else if (this.#openedWorkout) {
      closeWorkout();
      this.#openedWorkout = false;
    }
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
    if (this.#openedWorkout) {
      closeWorkout();
      this.#openedWorkout = false;
    }
    await this.#leave();
  }
}

export const tour = new Tour();
