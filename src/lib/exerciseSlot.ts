import type { ExerciseSlot, ExerciseTypeDef, ExerciseValues } from './types';

/**
 * The effective values to read for a slot: what happened if it was logged,
 * otherwise the plan. Used by every read-only display (history, analytics,
 * CSV/PDF export, share cards) - none of them need to distinguish plan vs
 * actual themselves, they just want "the best information available."
 */
export function slotValues(slot: ExerciseSlot): ExerciseValues {
  return slot.logged ?? slot.prescribed ?? {};
}

/** The plan's note for an exercise (`prescribed.notes`) - written before the session. */
export function planNote(slot: ExerciseSlot): string {
  return (slot.prescribed?.notes ?? '').trim();
}

/**
 * The "how it went" note for an exercise (`logged.notes`). Logs made before
 * the two were told apart had the plan note copied in as the log note, so a
 * log note identical to the plan note counts as none.
 */
export function logNote(slot: ExerciseSlot): string {
  const note = (slot.logged?.notes ?? '').trim();
  return note && note !== planNote(slot) ? note : '';
}

/**
 * Resolves a slot's exercise type display name via `typeId`, including
 * types that have since been archived (they stay in the list, never
 * hard-deleted once referenced).
 */
export function slotTypeName(slot: ExerciseSlot, exerciseTypes: ExerciseTypeDef[]): string {
  return exerciseTypes.find(t => t.id === slot.typeId)?.name ?? 'Unknown';
}
