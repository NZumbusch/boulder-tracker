/**
 * When to ask for reminders. Not at first launch (a system dialog over the
 * welcome, before the person knows what the app does), but once they have
 * finished a session and the rating reminder makes sense. The ask itself
 * happens once, ever (`UiStore.maybePromptForNotifications`).
 */
export interface PromptState {
  native: boolean;
  loading: boolean;
  welcomeDone: boolean;
  completedSessions: number;
  sessionRunning: boolean;
  /** The fatigue-rating step is open: it is the moment to finish, not to ask. */
  ratingOpen: boolean;
  /** The tour or "look around" is running on example data. */
  exampleData: boolean;
}

export function shouldAskForNotifications(s: PromptState): boolean {
  return s.native && !s.loading && s.welcomeDone && s.completedSessions >= 1 && !s.sessionRunning && !s.ratingOpen && !s.exampleData;
}
