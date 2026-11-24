import type { Workout } from "../types";

/**
 * Which session the Quick log editor is open for (`QuickLogSheet`, mounted
 * once in App.svelte) - opened from the session viewer or the session's
 * actions sheet, which closes itself first.
 */
export const quickLog = $state<{ workout: Workout | null }>({ workout: null });

export function openQuickLog(workout: Workout): void {
  quickLog.workout = $state.snapshot(workout) as Workout;
}

export function closeQuickLog(): void {
  quickLog.workout = null;
}
