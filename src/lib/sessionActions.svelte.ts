import type { Workout } from './types';

/**
 * The long-press quick actions for a session row (Plan, Home, History):
 * one sheet, mounted once in App, opened with a snapshot of the session.
 * See `SessionActionsSheet.svelte`.
 */
export const sessionActions = $state<{ workout: Workout | null; siblings: Workout[] }>({ workout: null, siblings: [] });

export function openSessionActions(workout: Workout, siblings: Workout[] = []) {
  sessionActions.workout = $state.snapshot(workout) as Workout;
  sessionActions.siblings = $state.snapshot(siblings) as Workout[];
}

export function closeSessionActions() {
  sessionActions.workout = null;
  sessionActions.siblings = [];
}
