import { storage } from '../storage';
import { workoutPlannedLoad, type Workout } from '../types';
import { generateId } from '../utils';
import { sortWorkoutsBySchedule } from '../planning/sortWorkouts';
import { toStoredWorkout } from '../planning/weekProjection';

/**
 * Workout CRUD and the load calc calls that go with it.
 */
export class WorkoutStore {
  workouts = $state<Workout[]>([]);

  /**
   * Reloads workouts from storage.
   */
  async load() {
    const workouts = await storage.getWorkouts();

    // Data Cleanup: Fix workouts with 0 plannedLoad that have exercises (Legacy bug).
    // Only counts as a change when the recomputed value actually differs -
    // a session whose slots carry no `prescribed` (a spontaneous one, say)
    // legitimately *has* zero planned load, and re-"fixing" it to zero on
    // every load would rewrite the whole workout table on every app start.
    let changed = false;
    workouts.forEach(workout => {
      if ((!workout.plannedLoad || workout.plannedLoad === 0) && workout.exercises.length > 0) {
        const recomputed = workoutPlannedLoad(workout.exercises);
        if (recomputed !== (workout.plannedLoad ?? 0)) {
          workout.plannedLoad = recomputed;
          changed = true;
        }
      }
    });
    if (changed) {
      // Save back the fixed workouts silently
      await storage._saveWorkouts(workouts);
    }

    this.workouts = workouts;
  }

  get completedWorkouts() {
    return this.workouts.filter(w => w.status === 'completed');
  }

  /** Materialises a provisional week: see `storage.materializeWeek`. */
  async materializeWeek(weekId: string, projected: Workout[]) {
    await storage.materializeWeek(weekId, projected.map(toStoredWorkout));
  }

  /**
   * A week's still-planned sessions in schedule order (day, then start
   * time) rather than storage order - this feeds the "+" screen's
   * "Planned for this week" list, which read as arbitrarily ordered
   * because storage returns insertion order. Shares one comparator with
   * the Training Plan week view so the two can't disagree.
   */
  getPlannedWorkoutsForWeek(weekId: string) {
    return sortWorkoutsBySchedule(
      this.workouts.filter(w => w.weekId === weekId && w.status === 'planned'),
    );
  }

  /**
   * Saves a workout to storage. Recalculates the aggregate planned load
   * from its exercises before persisting.
   */
  async saveWorkout(workout: Workout) {
    // `toStoredWorkout` drops the transient `provisional` flag: a session
    // opened from a provisional week carries it, and it must never reach
    // storage (see `lib/planning/weekProjection.ts`).
    const data = toStoredWorkout($state.snapshot(workout));

    data.plannedLoad = workoutPlannedLoad(data.exercises);

    await storage.saveWorkout(data);
  }

  async deleteWorkout(id: string) {
    await storage.deleteWorkout(id);
  }

  /**
   * Duplicates an existing workout, regenerating the workout's id and every
   * exercise slot's id so the duplicate never collides with the original.
   */
  async duplicateWorkout(workout: Workout) {
    const data = toStoredWorkout($state.snapshot(workout));
    const duplicated: Workout = {
      ...data,
      id: generateId(),
      status: 'planned',
      date: null,
      exercises: data.exercises.map(e => ({ ...e, id: generateId() }))
    };
    await storage.saveWorkout(duplicated);
  }
}
