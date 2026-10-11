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
  /**
   * The list it was opened from (a Plan week, History, Today), in that
   * list's order - the viewer swipes through it. Empty when opened alone.
   */
  siblings: Workout[];
}>({ workout: null, mode: 'view', isNew: false, siblings: [] });

export function openWorkout(workout: Workout, mode: 'view' | 'edit' = 'view', isNew = false, siblings: Workout[] = []) {
  workoutModal.workout = $state.snapshot(workout) as Workout;
  workoutModal.mode = mode;
  workoutModal.isNew = isNew;
  workoutModal.siblings = siblings.some((w) => w.id === workout.id) ? ($state.snapshot(siblings) as Workout[]) : [];
}

export function closeWorkout() {
  workoutModal.workout = null;
  workoutModal.isNew = false;
  workoutModal.siblings = [];
}

/** Where the open session sits in the list it came from, or null when it came alone. */
export function siblingPosition(): { index: number; total: number } | null {
  const id = workoutModal.workout?.id;
  const index = workoutModal.siblings.findIndex((w) => w.id === id);
  return index === -1 || workoutModal.siblings.length < 2 ? null : { index, total: workoutModal.siblings.length };
}

/** Shows the previous (-1) or next (+1) session of that list. False at either end. */
export function stepWorkout(dir: 1 | -1): boolean {
  const pos = siblingPosition();
  if (!pos || workoutModal.mode !== 'view') return false;
  const next = workoutModal.siblings[pos.index + dir];
  if (!next) return false;
  workoutModal.workout = next;
  return true;
}

/** A saved edit replaces that session's entry, so swiping back shows the new version. */
export function updateSibling(workout: Workout) {
  workoutModal.siblings = workoutModal.siblings.map((w) => (w.id === workout.id ? ($state.snapshot(workout) as Workout) : w));
}
