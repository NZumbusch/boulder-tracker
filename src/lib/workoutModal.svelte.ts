import type { Workout } from './types';

/**
 * The one workout modal: `view` is the default, `edit` is the editor. The
 * live session is the third state but keeps its own modal (it works on its
 * own copy of the workout and minimises to the bubble) - Start hands over
 * to it, and finishing lands back here in `view`.
 *
 * Holds a snapshot of the workout rather than an id: a provisional
 * (copy-on-write) week's sessions aren't in the workout store, so an id
 * lookup would miss them.
 */
export const workoutModal = $state<{
  workout: Workout | null;
  mode: 'view' | 'edit';
  /** A session that doesn't exist yet - cancelling its editor closes, since there's nothing to view. */
  isNew: boolean;
}>({ workout: null, mode: 'view', isNew: false });

export function openWorkout(workout: Workout, mode: 'view' | 'edit' = 'view', isNew = false) {
  workoutModal.workout = $state.snapshot(workout) as Workout;
  workoutModal.mode = mode;
  workoutModal.isNew = isNew;
}

export function closeWorkout() {
  workoutModal.workout = null;
  workoutModal.isNew = false;
}
