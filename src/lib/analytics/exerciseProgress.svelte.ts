/** Which exercise's progress sheet is open, if any. */
class ExerciseProgressState {
  typeId = $state<string | null>(null);
}

export const exerciseProgressState = new ExerciseProgressState();
export const openExerciseProgress = (typeId: string) => (exerciseProgressState.typeId = typeId);
