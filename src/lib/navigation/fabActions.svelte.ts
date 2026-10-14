/**
 * What the floating + does where it is context-aware. The Plan screen owns
 * "add a session on the selected day" (it knows the day) and registers it
 * here while it is shown; the + itself lives in the app shell.
 */
class FabActions {
  addToPlan = $state<(() => void) | null>(null);
}

export const fabActions = new FabActions();
