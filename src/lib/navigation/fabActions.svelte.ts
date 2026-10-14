/**
 * What the floating + does where it is context-aware. The Plan screen owns
 * "add a session on the selected day" (it knows the day) and registers it
 * here while it is shown; the + itself lives in the app shell.
 */
class FabActions {
  addToPlan = $state<(() => void) | null>(null);
  /** Scrolled out of the way (down through content); it slides back on scrolling up. */
  hidden = $state(false);
}

export const fabActions = new FabActions();
