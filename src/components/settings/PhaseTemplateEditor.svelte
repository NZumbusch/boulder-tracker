<script lang="ts">
  import { motionMs } from '../../lib/motion';
  import { WEEK_DAYS } from '../../lib/constants';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock, WorkoutTemplate } from '../../lib/types';
  import { normaliseGroups, settleAfterMove, groupSummary } from '../../lib/exercise/groups';
  import { insertCircuit } from '../../lib/exercise/circuits';
  import ExerciseForm from '../workout/ExerciseForm.svelte';
  import Icon from "@iconify/svelte";
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import { scopedUndo } from '../../lib/toast.svelte';
  import { flip } from 'svelte/animate';

  let {
    templates = $bindable(),
    phaseId,
  }: {
    templates: Record<string, WorkoutTemplate[]>;
    phaseId: string;
  } = $props();

  const days = WEEK_DAYS;

  let editingWorkoutIndex = $state<number | null>(null);
  let isAddingExercise = $state(false);
  let editingExerciseId = $state<string | null>(null);

  const phaseWorkouts = $derived(templates[phaseId] || []);

  function addWorkoutToPhase() {
    if (!templates[phaseId]) templates[phaseId] = [];
    const newWorkout: WorkoutTemplate = { id: generateId(), name: 'New session', exercises: [] };
    templates[phaseId] = [...templates[phaseId], newWorkout];
  }

  const undoable = scopedUndo();
  function removeWorkoutFromPhase(index: number) {
    const removed = $state.snapshot(templates[phaseId][index]) as WorkoutTemplate;
    templates[phaseId] = templates[phaseId].filter((_, i: number) => i !== index);
    undoable(`${removed.name || 'Session'} removed`, () => {
      if (templates[phaseId].some((w) => w.id === removed.id)) return;
      const list = [...templates[phaseId]];
      list.splice(Math.min(index, list.length), 0, removed);
      templates[phaseId] = list;
    });
  }

  function saveExerciseToTemplate(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    if (editingWorkoutIndex === null) return;
    const workout = templates[phaseId][editingWorkoutIndex];
    // Templates are pure plans - `logged` is always undefined for them.
    if (editingExerciseId) {
      const index = workout.exercises.findIndex((e) => e.id === editingExerciseId);
      if (index !== -1) {
        workout.exercises[index] = {
          ...workout.exercises[index],
          id: editingExerciseId,
          typeId: data.typeId,
          categoryId: data.categoryId,
          activeParameters: data.activeParameters,
          prescribed: data.values
        };
      }
    } else {
      const newExercise: ExerciseSlot = {
        id: generateId(),
        typeId: data.typeId,
        categoryId: data.categoryId,
        activeParameters: data.activeParameters,
        prescribed: data.values
      };
      workout.exercises = [...(workout.exercises || []), newExercise];
    }
    isAddingExercise = false;
    editingExerciseId = null;
  }

  function duplicateWorkoutInPhase(index: number) {
    const original = templates[phaseId][index];
    const duplicated: WorkoutTemplate = {
      ...$state.snapshot(original),
      id: generateId(),
      exercises: original.exercises?.map(e => ({ ...e, id: generateId() })) || []
    };
    templates[phaseId] = [...templates[phaseId], duplicated];
  }

  function duplicateExerciseInTemplate(workoutIndex: number, exercise: ExerciseSlot) {
    const workout = templates[phaseId][workoutIndex];
    // A copy lands at the end, outside any circuit.
    const { groupId: _groupId, ...rest } = $state.snapshot(exercise);
    const duplicated = { ...rest, id: generateId() };
    workout.exercises = [...(workout.exercises || []), duplicated];
  }

  function handleTemplateDndConsider(workoutIndex: number, e: CustomEvent<DndEvent<ExerciseSlot>>) {
    templates[phaseId][workoutIndex].exercises = e.detail.items;
  }

  function handleTemplateDndFinalize(workoutIndex: number, e: CustomEvent<DndEvent<ExerciseSlot>>) {
    // A row dropped inside a circuit joins it; a member dragged away leaves.
    setGrouped(workoutIndex, { ...templates[phaseId][workoutIndex], exercises: settleAfterMove(e.detail.items) });
  }

  /** Writes a template back with its grouping tidied (see lib/exercise/groups.ts). */
  function setGrouped(workoutIndex: number, next: WorkoutTemplate) {
    const tidy = normaliseGroups(next);
    const workout = templates[phaseId][workoutIndex];
    workout.exercises = tidy.exercises;
    workout.groups = tidy.groups;
  }

  function addCircuitToTemplate(workoutIndex: number, circuitId: string) {
    const circuit = trainingState.circuits.find((c) => c.id === circuitId);
    if (!circuit) return;
    setGrouped(workoutIndex, insertCircuit($state.snapshot(templates[phaseId][workoutIndex]) as WorkoutTemplate, $state.snapshot(circuit), generateId));
  }

  /** The group a row starts, for its circuit label - only on a group's first member. */
  function groupStartingAt(workout: WorkoutTemplate, index: number) {
    const slot = workout.exercises[index];
    if (!slot?.groupId || workout.exercises[index - 1]?.groupId === slot.groupId) return undefined;
    return workout.groups?.find((g) => g.id === slot.groupId);
  }

  function editExerciseInTemplate(workoutIndex: number, exercise: ExerciseSlot) {
    editingWorkoutIndex = workoutIndex;
    editingExerciseId = exercise.id;
    isAddingExercise = true;
  }

  function removeExerciseFromTemplate(workoutIndex: number, exerciseId: string) {
    const workout = templates[phaseId][workoutIndex];
    if (workout.exercises) {
      const before = { exercises: $state.snapshot(workout.exercises) as ExerciseSlot[], groups: $state.snapshot(workout.groups) };
      const name = slotTypeName(workout.exercises.find((e) => e.id === exerciseId)!, trainingState.exerciseTypes);
      const sessionId = workout.id;
      setGrouped(workoutIndex, { ...workout, exercises: workout.exercises.filter((e) => e.id !== exerciseId) });
      undoable(`${name} removed`, () => {
        const w = templates[phaseId]?.find((t) => t.id === sessionId);
        if (!w) return;
        w.exercises = before.exercises;
        w.groups = before.groups;
      });
    }
  }
</script>

<div class="space-y-3 pt-1">
  {#each phaseWorkouts as workout, wIndex (workout.id)}
    <div class="p-3 bg-surface-elevated/30 rounded-card space-y-4 relative">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0 flex-1">
          <input bind:value={workout.name} class="w-full bg-transparent text-body font-bold text-content border-b border-border focus:border-primary outline-none pb-1 truncate" placeholder="Session name" aria-label="Session name" />
          <textarea
            value={workout.description ?? ''}
            oninput={(e) => { const v = e.currentTarget.value; if (v.trim()) workout.description = v; else delete workout.description; }}
            rows="1"
            placeholder="Session note (optional) - intent, pacing, what to focus on"
            class="w-full mt-1 bg-transparent text-caption text-content-muted border-b border-border focus:border-primary outline-none resize-y"
            aria-label="Session note"
          ></textarea>
        </div>
        <div class="flex items-center flex-shrink-0">
          <button onclick={() => {
            if (wIndex > 0) {
              const temp = templates[phaseId][wIndex - 1];
              templates[phaseId][wIndex - 1] = workout;
              templates[phaseId][wIndex] = temp;
            }
          }} disabled={wIndex === 0} class="btn-icon disabled:opacity-30" aria-label="Move session up" title="Move up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
          <button onclick={() => {
            if (wIndex < phaseWorkouts.length - 1) {
              const temp = templates[phaseId][wIndex + 1];
              templates[phaseId][wIndex + 1] = workout;
              templates[phaseId][wIndex] = temp;
            }
          }} disabled={wIndex === phaseWorkouts.length - 1} class="btn-icon disabled:opacity-30" aria-label="Move session down" title="Move down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>

          <button onclick={() => duplicateWorkoutInPhase(wIndex)} class="btn-icon" aria-label="Duplicate session" title="Duplicate session"><Icon icon="ic:baseline-content-copy" class="text-lg" /></button>
          <button onclick={() => removeWorkoutFromPhase(wIndex)} class="btn-icon hover:text-danger" aria-label="Delete session" title="Delete session"><Icon icon="ic:baseline-delete" class="text-xl" /></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Day of the week">
        {#each days as day}
          <button
            onclick={() => workout.dayOfWeek = day}
            aria-pressed={workout.dayOfWeek === day}
            class="px-2.5 py-2 min-h-10 rounded-control text-label transition-all border
              {workout.dayOfWeek === day
                ? 'bg-primary border-primary text-white shadow-lg'
                : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
          >
            {day.slice(0, 3)}
          </button>
        {/each}
        <button
          onclick={() => workout.dayOfWeek = undefined}
          aria-pressed={!workout.dayOfWeek}
          class="px-2.5 py-2 min-h-10 rounded-control text-label transition-all border
            {!workout.dayOfWeek
              ? 'bg-surface-elevated-hover border-border-strong text-content shadow-lg'
              : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content-muted'}"
        >
          None
        </button>
      </div>
      <!-- Planned time of day + planned session length. Both optional and
           both carried onto every workout this template generates (see
           generateWorkoutsFromTemplate) - a template with neither is just an
           open-ended session, not a zero-length one. -->
      <div class="flex gap-2">
        <label class="flex-1 space-y-1">
          <span class="text-label text-content-subtle ml-1 block">Start time</span>
          <input
            type="time"
            value={workout.startTime ?? ''}
            onchange={(e) => workout.startTime = e.currentTarget.value || undefined}
            class="field"
          />
        </label>
        <label class="flex-1 space-y-1">
          <span class="text-label text-content-subtle ml-1 block">Planned minutes</span>
          <input
            type="number"
            min="1"
            step="5"
            placeholder="—"
            value={workout.plannedDuration ?? ''}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              workout.plannedDuration = e.currentTarget.value === '' || !Number.isFinite(n) || n <= 0 ? undefined : n;
            }}
            class="field"
          />
        </label>
      </div>
      <!-- Where: one of your places by name, or any text; carried onto every workout the template generates. -->
      <label class="space-y-1 block">
        <span class="text-label text-content-subtle ml-1 block">Where</span>
        <input
          type="text"
          maxlength="80"
          list="template-places"
          placeholder="—"
          value={workout.location ?? ''}
          onchange={(e) => workout.location = e.currentTarget.value.trim() || undefined}
          class="field"
        />
      </label>
      <div class="space-y-2">
        <section
          class="space-y-2 min-h-[40px] outline-none"
          use:dragHandleZone={{items: workout.exercises || [], dropTargetStyle: {}}}
          onconsider={(e) => handleTemplateDndConsider(wIndex, e)}
          onfinalize={(e) => handleTemplateDndFinalize(wIndex, e)}
        >
          {#each workout.exercises || [] as exercise, eIndex (exercise.id)}
            {@const startsGroup = groupStartingAt(workout, eIndex)}
            <div animate:flip={{ duration: motionMs(200) }} class="flex items-center justify-between p-2 bg-surface/50 rounded-control border transition-all hover:border-border-strong group/ex {exercise.groupId ? 'border-l-2 border-l-content-subtle/40 border-border ml-2' : 'border-border'}">
              <div class="flex items-center gap-2 min-w-0">
                <div use:dragHandle aria-label="Drag to reorder {slotTypeName(exercise, trainingState.exerciseTypes)}" class="grid place-items-center min-w-10 min-h-10 text-content-subtle cursor-grab active:cursor-grabbing touch-none">
                  <Icon icon="ic:baseline-drag-indicator" class="text-xl" />
                </div>
                <div class="min-w-0">
                  {#if startsGroup}
                    <p class="text-caption text-content-subtle truncate flex items-center gap-1"><Icon icon="ic:baseline-repeat" class="text-xs shrink-0" /> {startsGroup.name || 'Circuit'} · {groupSummary(startsGroup)}</p>
                  {/if}
                  <p class="text-label text-content-muted truncate">{slotTypeName(exercise, trainingState.exerciseTypes)}</p>
                </div>
              </div>
              <div class="flex items-center flex-shrink-0">
                <button onclick={() => duplicateExerciseInTemplate(wIndex, exercise)} class="btn-icon" aria-label="Duplicate {slotTypeName(exercise, trainingState.exerciseTypes)}" title="Duplicate"><Icon icon="ic:baseline-content-copy" class="text-lg" /></button>
                <button onclick={() => editExerciseInTemplate(wIndex, exercise)} class="btn-icon" aria-label="Edit {slotTypeName(exercise, trainingState.exerciseTypes)}" title="Edit"><Icon icon="ic:baseline-edit" class="text-lg" /></button>
                <button onclick={() => removeExerciseFromTemplate(wIndex, exercise.id)} class="btn-icon hover:text-danger" aria-label="Remove {slotTypeName(exercise, trainingState.exerciseTypes)}" title="Remove"><Icon icon="ic:baseline-close" class="text-xl" /></button>
              </div>
            </div>
          {/each}
        </section>
        {#if editingWorkoutIndex === wIndex && isAddingExercise}
          <div class="mt-4 p-4 bg-surface-elevated/50 rounded-card animate-in zoom-in-95">
            <ExerciseForm
              initialSlot={editingExerciseId ? workout.exercises?.find((e) => e.id === editingExerciseId) : null}
              mode="prescribed"
              inGroup={!!(editingExerciseId && workout.exercises?.find((e) => e.id === editingExerciseId)?.groupId)}
              onSave={saveExerciseToTemplate}
            />
            <button onclick={() => { isAddingExercise = false; editingWorkoutIndex = null; editingExerciseId = null; }} class="btn btn-ghost w-full mt-3">Cancel</button>
          </div>
        {:else}
          <div class="flex gap-2">
            <button onclick={() => { editingWorkoutIndex = wIndex; isAddingExercise = true; editingExerciseId = null; }} class="flex-1 min-h-11 py-2.5 border border-dashed border-border-strong rounded-control text-label text-content-muted hover:text-content transition-all">Add exercise</button>
            {#if trainingState.circuits.length > 0}
              <select
                aria-label="Add a saved circuit"
                value=""
                onchange={(e) => { addCircuitToTemplate(wIndex, e.currentTarget.value); e.currentTarget.value = ''; }}
                class="px-2.5 min-h-11 bg-transparent border border-dashed border-border-strong rounded-control text-label text-content-muted outline-none cursor-pointer"
              >
                <option value="" disabled>Add circuit</option>
                {#each trainingState.circuits as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
              </select>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="p-4 bg-surface-elevated/20 rounded-control border border-dashed border-border text-center"><p class="text-caption text-content-subtle italic">No sessions yet</p></div>
  {/each}
  <button onclick={addWorkoutToPhase} class="w-full min-h-11 py-2.5 border border-dashed border-border-strong rounded-card flex items-center justify-center gap-2 text-content-muted hover:text-content transition-all"><Icon icon="ic:baseline-plus" class="text-sm" /><span class="text-label">Add session</span></button>
</div>

<datalist id="template-places">
  {#each trainingState.places as place (place.name)}<option value={place.name}></option>{/each}
</datalist>
