/**
 * What the floating + does where it is context-aware. The Plan screen owns
 * "add a session on the selected day" (it knows the day) and registers it
 * here while it is shown; the + itself lives in the app shell.
 */
class FabActions {
  addToPlan = $state<(() => void) | null>(null);
  /**
   * Whether the floating + is on this screen (the shell sets it). A screen that
   * would offer its own "add" for the same action leaves it out while this is
   * true: one + per screen.
   */
  showing = $state(false);
}

export const fabActions = new FabActions();
