import { formatWeight, displayWeight } from '../units';
import { trainingState } from '../state.svelte';
import type { ExerciseSlot, ExerciseValues, ParameterBlock } from '../types';
import { slotValues } from '../exerciseSlot';
import { estimateSlotDuration } from '../planning/sessionDuration';
import { PARAMETER_LABELS } from '../constants';
import { restSeconds } from '../exercise/rest';

/** A one-line summary of what a slot asks for, for the collapsed rows. */
export function slotSummary(slot: ExerciseSlot): string {
  const v = slotValues(slot);
  const parts: string[] = [];
  if (v.sets) parts.push(`${v.sets}${v.reps ? `×${v.reps}` : ' sets'}`);
  else if (v.reps) parts.push(`${v.reps} reps`);
  if (v.weight) parts.push(formatWeight(v.weight, trainingState.units.weight));
  if (v.minGrade) parts.push(v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}–${v.maxGrade}` : v.minGrade);
  // A circuit member's own estimate counts its own set rests, which the
  // circuit replaces - its time only means something as part of the group.
  const mins = slot.groupId ? undefined : estimateSlotDuration(slot);
  if (mins) parts.push(`${mins}m`);
  return parts.join(' · ');
}

/**
 * Everything an exercise asks for, as label/value pairs - the prescription
 * by default, or whichever `values` bucket is passed (a completed session
 * shows what was logged). `inGroup` leaves out the rest between sets,
 * which a circuit decides for its members.
 */
export function detailPairs(
  slot: ExerciseSlot,
  values?: ExerciseValues,
  { inGroup = false }: { inGroup?: boolean } = {},
): { label: string; value: string }[] {
  const v = values ?? slot.prescribed ?? slotValues(slot);
  const params = slot.activeParameters
    ?? trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters
    ?? [];
  const pairs: { label: string; value: string }[] = [];
  const push = (param: ParameterBlock, value: unknown, suffix = '') => {
    if (!params.includes(param)) return;
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    pairs.push({
      label: PARAMETER_LABELS[param],
      value: `${Array.isArray(value) ? value.join(', ') : value}${suffix}`,
    });
  };
  push('duration', v.duration, ' min');
  push('sets', v.sets);
  push('reps', v.reps);
  push('weight', typeof v.weight === 'number' ? Math.round(displayWeight(v.weight, trainingState.units.weight) * 10) / 10 : v.weight, ` ${trainingState.units.weight}`);
  push('holdSize', v.holdSize, ' mm');
  push('holdType', v.holdType);
  push('timeOn', v.timeOn, ' s');
  // In a circuit/superset the group decides the rest between sets, so a
  // member's own set rest is left out rather than shown as if it applied.
  const setRestOnly = inGroup && restSeconds(v).betweenReps === 0;
  if (!setRestOnly) push('timeOff', v.timeOff, ' s');
  if (!inGroup) push('restTime', v.timeBetweenSets, ' s');
  push('cadence', v.cadence);
  push('distance', v.distance, ' km');
  push('boardType', v.boardType);
  push('boardAngle', v.boardAngle, '°');
  push('climbingStyle', v.climbingStyle);
  push('leadStyle', v.leadStyle);
  push('mobilityType', v.mobilityType);
  push('movesPerRoute', v.movesPerRoute);
  push('bodyweightPercent', v.bodyweightPercent, '%');
  push('maxWeightPercent', v.maxWeightPercent, '%');
  push('routeDifficulty', v.routeDifficulty);
  push('difficulty', v.difficulty);
  if (params.includes('grades') || params.includes('boulderingGrades') || params.includes('routeGrades')) {
    if (v.minGrade) {
      pairs.push({
        label: 'Grades',
        value: v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}–${v.maxGrade}` : v.minGrade,
      });
    }
  }
  return pairs;
}

/** What was done, in one short line - "3×5 · 12 kg", "20 mm · 7 s · +15%" - for the "Last time" hint. */
export function valuesLine(v: ExerciseValues): string {
  const parts: string[] = [];
  const reps = Array.isArray(v.reps) ? v.reps.join('/') : v.reps;
  if (v.sets) parts.push(`${v.sets}${reps ? `×${reps}` : ' sets'}`);
  else if (reps) parts.push(`${reps} reps`);
  if (v.weight) parts.push(formatWeight(v.weight, trainingState.units.weight));
  if (v.bodyweightPercent) parts.push(`${v.bodyweightPercent}% BW`);
  if (v.maxWeightPercent) parts.push(`${v.maxWeightPercent}% max`);
  if (v.holdSize) parts.push(`${v.holdSize} mm`);
  if (v.timeOn) parts.push(`${v.timeOn} s`);
  if (v.minGrade) parts.push(v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}–${v.maxGrade}` : v.minGrade);
  if (v.distance) parts.push(`${v.distance} km`);
  if (v.duration && parts.length === 0) parts.push(`${v.duration} min`);
  if (typeof v.difficulty === 'number') parts.push(`felt ${v.difficulty}/10`);
  return parts.join(' · ');
}
