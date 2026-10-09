<script lang="ts">
  import { scopedUndo } from '../../lib/toast.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { motionMs } from '../../lib/motion';
  import { WEEK_DAYS } from '../../lib/constants';
  /**
   * The workout modal's edit mode - the viewer made editable in place rather
   * than a separate form: the title and note are fields, the schedule is a
   * row of chips that open a small picker, and each exercise card opens the
   * full ExerciseForm. Reordering is a mode (like the live session's), so the
   * cards stay clean and a scroll on mobile never turns into a drag.
   *
   * Edits a local copy; nothing is written until Save.
   */
  import type { Workout, ExerciseSlot, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { slotSummary } from '../../lib/session/slotDetails';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { untrack } from 'svelte';
  import ExerciseCard from './ExerciseCard.svelte';
  import GroupCard from './GroupCard.svelte';
  import GroupSettings from './GroupSettings.svelte';
  import {
    workoutItems, groupMinutes, groupSlots, ungroup, updateGroup, takeOutOfGroup, addToGroup,
    settleAfterMove, restComparison, normaliseGroups, memberRounds,
  } from '../../lib/exercise/groups';
  import { repsPerSet } from '../../lib/exercise/reps';
  import { circuitFromGroup, insertCircuit } from '../../lib/exercise/circuits';
  import { toast } from '../../lib/toast.svelte';
  import type { ExerciseGroup, Circuit } from '../../lib/types';
  import ExerciseForm from './ExerciseForm.svelte';
  import SessionAIModal from './SessionAIModal.svelte';
  import Icon from '@iconify/svelte';

  let {
    workout: initial,
    isNew,
    onSaved,
    onCancel,
  }: {
    workout: Workout;
    isNew: boolean;
    onSaved: (saved: Workout) => void;
    onCancel: () => void;
  } = $props();

  // A copy taken once on open - the modal re-keys the editor per workout.
  let workout = $state<Workout>(untrack(() => $state.snapshot(initial) as Workout));
  const original = untrack(() => JSON.stringify($state.snapshot(initial)));

  /** A completed session's cards edit what was done; a planned one's edit the plan. */
  const bucket = $derived<'prescribed' | 'logged'>(workout.status === 'completed' ? 'logged' : 'prescribed');

  let openChip = $state<'day' | 'time' | 'duration' | null>(null);
  let isReordering = $state(false);
  /** Picking exercises to make a circuit of. */
  let isGrouping = $state(false);
  let picked = $state<string[]>([]);
  /** The slot open in ExerciseForm, or 'new' while adding one. */
  let formSlot = $state<ExerciseSlot | 'new' | null>(null);
  /** The group a new exercise joins, when it was added from inside one. */
  let addingToGroup = $state<string | null>(null);
  /** The circuit picker ("Add circuit") is open. */
  let pickingCircuit = $state(false);
  /** The form open for a circuit's first exercise: saving it makes the circuit. */
  let startingCircuit = $state(false);
  /** A group being saved to the library that already came from a circuit: update it, or save a new one? */
  let savingGroup = $state<ExerciseGroup | null>(null);

  /** Saves a group to the circuit library - replacing `into`, or as a new circuit - and links the group to it. */
  async function saveGroupAsCircuit(group: ExerciseGroup, into?: Circuit) {
    const circuit = circuitFromGroup(workout, group.id, into ? { id: into.id, name: group.name, description: into.description } : { id: generateId(), name: group.name }, generateId);
    savingGroup = null;
    if (!circuit) return;
    await trainingState.saveCircuit(circuit);
    regroup(updateGroup(workout, { ...group, name: circuit.name, circuitId: circuit.id }));
    toast.show(into ? `${circuit.name} updated` : `${circuit.name} saved to your circuits`);
  }

  function onSaveCircuit(group: ExerciseGroup) {
    const linked = group.circuitId ? trainingState.circuits.find((c) => c.id === group.circuitId) : undefined;
    if (linked) savingGroup = group;
    else saveGroupAsCircuit(group);
  }

  function addCircuit(circuit: Circuit) {
    regroup(insertCircuit(workout, circuit, generateId));
    pickingCircuit = false;
  }

  const items = $derived(workoutItems(workout));
  const minutesByGroup = $derived(groupMinutes(workout, bucket === 'logged' ? 'actual' : 'estimate'));
  const nameOf = (slotId: string) => {
    const slot = workout.exercises.find((e) => e.id === slotId);
    return slot ? slotTypeName(slot, trainingState.exerciseTypes) : '';
  };
  /** The group the open form's slot is in, for the hint above the form. */
  const formGroup = $derived.by(() => {
    const id = formSlot === 'new' ? addingToGroup : formSlot?.groupId;
    return id ? workout.groups?.find((g) => g.id === id) : undefined;
  });

  function dropoutsFor(group: ExerciseGroup, members: { slot: ExerciseSlot }[]) {
    return members
      .map(({ slot }) => ({ slotId: slot.id, rounds: memberRounds(slot[bucket] ?? slot.prescribed ?? {}, group) }))
      .filter((d) => d.rounds < group.rounds);
  }

  function comparisonsFor(group: ExerciseGroup, members: { slot: ExerciseSlot }[]) {
    return restComparison(group, members.map(({ slot }) => ({ slot, values: slot[bucket] ?? slot.prescribed ?? {} })));
  }

  /** Applies a grouping change to the local copy. */
  function regroup(next: { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] }) {
    workout.exercises = next.exercises;
    workout.groups = next.groups;
  }

  function togglePick(id: string) {
    picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
  }

  /** Makes a circuit of the picked exercises: rounds from the most sets any of them has, else 3. */
  function makeGroup() {
    const chosen = workout.exercises.filter((e) => picked.includes(e.id));
    const sets = Math.max(0, ...chosen.map((e) => {
      const v = e[bucket] ?? e.prescribed;
      return v?.sets || (Array.isArray(v?.reps) ? repsPerSet(v).length : 0);
    }));
    regroup(groupSlots(workout, picked, { id: generateId(), rounds: sets || 3, transition: 15, roundRest: 60 }));
    picked = [];
    isGrouping = false;
  }
  let isImportingAI = $state(false);
  let isSaving = $state(false);

  const DAYS = WEEK_DAYS;

  /** Grows a textarea to fit its text, so long notes wrap and expand down instead of scrolling. */
  function autosize(node: HTMLTextAreaElement, _value?: string) {
    const fit = () => { node.style.height = 'auto'; node.style.height = node.scrollHeight + 'px'; };
    fit();
    return { update: fit };
  }

  function toggleChip(chip: 'day' | 'time' | 'duration') {
    openChip = openChip === chip ? null : chip;
  }

  function saveExercise(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues; planNote?: string }) {
    const fields: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; prescribed?: ExerciseValues; logged?: ExerciseValues } = { typeId: data.typeId, categoryId: data.categoryId, activeParameters: data.activeParameters, [bucket]: data.values };
    if (data.planNote !== undefined && formSlot && formSlot !== 'new' && formSlot.prescribed) fields.prescribed = { ...formSlot.prescribed, notes: data.planNote || undefined };
    if (formSlot === 'new') {
      const slot = { id: generateId(), ...fields };
      if (startingCircuit) regroup(groupSlots({ ...workout, exercises: [...workout.exercises, slot] }, [slot.id], { id: generateId(), rounds: 3, transition: 15, roundRest: 60 }));
      else if (addingToGroup) regroup(addToGroup(workout, addingToGroup, slot));
      else workout.exercises = [...workout.exercises, slot];
    } else if (formSlot) {
      const id = formSlot.id;
      workout.exercises = workout.exercises.map((e) => e.id === id ? { ...e, ...fields } : e);
    }
    formSlot = null;
    addingToGroup = null;
    startingCircuit = false;
  }

  const undoable = scopedUndo();
  function removeExercise(slot: ExerciseSlot) {
    const before = $state.snapshot({ exercises: workout.exercises, groups: workout.groups }) as { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] };
    regroup(normaliseGroups({ ...workout, exercises: workout.exercises.filter((e) => e.id !== slot.id) }));
    undoable(`${slotTypeName(slot, trainingState.exerciseTypes)} removed`, () => regroup(before));
  }

  function handleDnd(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    workout.exercises = e.detail.items;
  }

  /** On drop, an exercise landing inside a circuit joins it; a member dragged out leaves. */
  function handleDndFinalize(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    regroup(normaliseGroups({ ...workout, exercises: settleAfterMove(e.detail.items) }));
  }

  const groupName = (id: string | undefined) => (id ? workout.groups?.find((g) => g.id === id)?.name || 'Circuit' : undefined);

  // Nothing to reorder once there's one card or none - don't strand the toggle on.
  $effect(() => {
    if (workout.exercises.length < 2 && isReordering) isReordering = false;
    if (workout.exercises.length === 0 && isGrouping) isGrouping = false;
  });

  async function cancel() {
    if (JSON.stringify($state.snapshot(workout)) !== original) {
      const confirmed = await showConfirm('Discard Changes', 'Leave without saving? Your changes to this session will be lost.');
      if (!confirmed) return;
    }
    onCancel();
  }

  async function save() {
    isSaving = true;
    try {
      // A Plan B edit comes back as Plan B's own copy; null = refused (stay here).
      const saved = await trainingState.saveWorkout($state.snapshot(workout) as Workout);
      if (saved) onSaved(saved);
    } finally {
      isSaving = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => cancel());
</script>

<header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-start gap-3">
    <button onclick={cancel} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label={isNew ? 'Close' : 'Back to session'}>
      <Icon icon={isNew ? 'ic:baseline-close' : 'ic:baseline-arrow-back'} class="text-2xl" />
    </button>
    <div class="min-w-0 flex-1">
      <p class="text-caption uppercase text-primary">
        {isNew ? 'New session' : 'Editing'} &middot; {workout.status === 'completed' ? 'Completed' : 'Planned'}
      </p>
      <input
        bind:value={workout.notes}
        class="w-full bg-transparent text-title text-content outline-none border-b border-dashed border-border-strong focus:border-primary/60 pb-0.5 transition-colors"
        placeholder="Session name"
      />

      <!-- Schedule chips: read like the viewer's subtitle, tap one to set it. -->
      <div class="flex flex-wrap gap-1.5 mt-2.5">
        {#snippet chip(id: 'day' | 'time' | 'duration', icon: string, label: string, isSet: boolean)}
          <button
            onclick={() => toggleChip(id)}
            class="px-2.5 py-1 rounded-full text-caption font-bold border transition-colors flex items-center gap-1 {openChip === id
              ? 'bg-primary/15 border-primary/50 text-primary'
              : isSet
                ? 'bg-surface-elevated border-border-strong text-content'
                : 'bg-transparent border-dashed border-border-strong text-content-subtle'}"
            aria-expanded={openChip === id}
          >
            <Icon {icon} class="text-sm" /> {label}
          </button>
        {/snippet}
        {@render chip('day', 'ic:baseline-calendar-today', workout.dayOfWeek ? workout.dayOfWeek.slice(0, 3) : 'Day', !!workout.dayOfWeek)}
        {@render chip('time', 'ic:baseline-schedule', workout.startTime || 'Time', !!workout.startTime)}
        {@render chip('duration', 'ic:baseline-timer', workout.plannedDuration ? `${workout.plannedDuration} min` : 'Duration', !!workout.plannedDuration)}
      </div>

      {#if openChip === 'day'}
        <div class="flex flex-wrap gap-1.5 mt-2 animate-in fade-in duration-150">
          {#each DAYS as day}
            <button
              onclick={() => { workout.dayOfWeek = day; openChip = null; }}
              class="px-2.5 py-1.5 rounded-control text-label border transition-colors {workout.dayOfWeek === day ? 'bg-primary border-primary text-white' : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content'}"
            >{day.slice(0, 3)}</button>
          {/each}
          <button
            onclick={() => { workout.dayOfWeek = undefined; openChip = null; }}
            class="px-2.5 py-1.5 rounded-control text-label border transition-colors {!workout.dayOfWeek ? 'bg-surface-elevated-hover border-border-strong text-content' : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content'}"
          >None</button>
        </div>
      {:else if openChip === 'time'}
        <div class="flex items-center gap-2 mt-2 animate-in fade-in duration-150">
          <input
            type="time"
            bind:value={workout.startTime}
            class="flex-1 px-3 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/50"
          />
          <button onclick={() => { workout.startTime = undefined; openChip = null; }} class="px-3 py-2 text-label text-content-subtle hover:text-content">Clear</button>
        </div>
      {:else if openChip === 'duration'}
        <div class="flex items-center gap-2 mt-2 animate-in fade-in duration-150">
          <input
            type="number"
            min="1"
            step="5"
            inputmode="numeric"
            placeholder="Minutes"
            value={workout.plannedDuration ?? ''}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              workout.plannedDuration = e.currentTarget.value === '' || !Number.isFinite(n) || n <= 0 ? undefined : n;
            }}
            class="flex-1 px-3 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/50"
          />
          <span class="text-label text-content-subtle">min</span>
          <button onclick={() => { workout.plannedDuration = undefined; openChip = null; }} class="px-3 py-2 text-label text-content-subtle hover:text-content">Clear</button>
        </div>
      {/if}
    </div>
  </div>
</header>

<div class="flex-1 overflow-y-auto no-scrollbar">
  <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-2.5">
    <textarea
      bind:value={workout.description}
      use:autosize={workout.description}
      rows="2"
      placeholder="Session notes or goals..."
      class="block w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-none overflow-hidden placeholder:text-content-subtle"
    ></textarea>
    {#if workout.status === 'completed'}
      <textarea
        bind:value={workout.logNotes}
        use:autosize={workout.logNotes}
        rows="2"
        placeholder="How it went…"
        aria-label="How it went"
        class="block w-full p-3.5 bg-surface/40 border border-border rounded-card text-body text-content leading-relaxed outline-none focus:border-primary/40 transition-colors resize-none overflow-hidden placeholder:text-content-subtle"
      ></textarea>
    {/if}

    {#if isReordering}
      <section
        class="space-y-2.5 outline-none"
        use:dndzone={{ items: workout.exercises, dropTargetStyle: {}, delayTouchStart: true }}
        onconsider={handleDnd}
        onfinalize={handleDndFinalize}
      >
        {#each workout.exercises as slot (slot.id)}
          <div animate:flip={{ duration: motionMs(200) }} class="p-3 bg-surface/60 border border-border rounded-card flex items-center gap-2.5">
            <Icon icon="ic:baseline-drag-indicator" class="text-xl text-content-subtle shrink-0 cursor-grab active:cursor-grabbing" />
            <div class="min-w-0 flex-1">
              <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
              <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
            </div>
            {#if slot.groupId}
              <span class="shrink-0 max-w-[40%] truncate px-2 py-0.5 rounded-full bg-surface-elevated text-caption text-content-subtle flex items-center gap-1">
                <Icon icon="ic:baseline-repeat" class="text-sm shrink-0" /> {groupName(slot.groupId)}
              </span>
            {/if}
          </div>
        {/each}
      </section>
    {:else if isGrouping}
      <p class="px-1 text-caption text-content-subtle">Pick the exercises to do in rounds - a circuit, or a superset that fills one exercise's rest.</p>
      {#each workout.exercises as slot (slot.id)}
        {@const on = picked.includes(slot.id)}
        <button
          onclick={() => togglePick(slot.id)}
          class="w-full p-3 rounded-card border flex items-center gap-2.5 text-left transition-colors {on ? 'bg-primary/10 border-primary/50' : 'bg-surface/60 border-border hover:border-border-strong'}"
          aria-pressed={on}
        >
          <Icon icon={on ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-xl shrink-0 {on ? 'text-primary' : 'text-content-subtle'}" />
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
            <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
          </div>
          {#if slot.groupId}
            <span class="shrink-0 max-w-[40%] truncate text-caption text-content-subtle">{groupName(slot.groupId)}</span>
          {/if}
        </button>
      {/each}
    {:else}
      <!-- The wrapper keeps Svelte from reading `slot=` as a legacy slot name inside the snippet. -->
      {#snippet card(exercise: ExerciseSlot, index: number)}
        <div>
          <ExerciseCard slot={exercise} {index} inGroup={!!exercise.groupId} values={exercise[bucket]} showLog={bucket === 'logged'} onclick={() => formSlot = exercise}>
            {#snippet actions()}
              {#if exercise.groupId}
                <button
                  onclick={() => regroup(takeOutOfGroup(workout, exercise.id))}
                  class="shrink-0 p-2 text-content-subtle hover:text-content transition-colors"
                  aria-label="Take out of the circuit"
                  title="Take out of the circuit"
                >
                  <Icon icon="ic:baseline-logout" class="text-lg" />
                </button>
              {/if}
              <button
                onclick={() => removeExercise(exercise)}
                class="shrink-0 p-2 -mr-1 text-content-subtle hover:text-danger transition-colors"
                aria-label="Remove exercise"
              >
                <Icon icon="ic:baseline-close" class="text-lg" />
              </button>
            {/snippet}
          </ExerciseCard>
        </div>
      {/snippet}
      {#each items as item (item.kind === 'slot' ? item.slot.id : `group:${item.group.id}`)}
        {#if item.kind === 'slot'}
          {@render card(item.slot, item.index)}
        {:else}
          {@const group = item.group}
          <GroupCard {group}>
            {#snippet header()}
              <GroupSettings
                {group}
                minutes={minutesByGroup.get(group.id)}
                comparisons={comparisonsFor(group, item.members)}
                dropouts={dropoutsFor(group, item.members)}
                {nameOf}
                onchange={(g) => regroup(updateGroup(workout, g))}
                onUngroup={() => regroup(ungroup(workout, group.id))}
              >
                {#snippet actions()}
                  <button onclick={() => onSaveCircuit(group)} class="shrink-0 p-1 text-content-subtle hover:text-content transition-colors" aria-label="Save as circuit" title="Save as circuit">
                    <Icon icon="ic:baseline-bookmark-add" class="text-lg" />
                  </button>
                {/snippet}
              </GroupSettings>
            {/snippet}
            {#each item.members as m (m.slot.id)}
              {@render card(m.slot, m.index)}
            {/each}
            <button
              onclick={() => { addingToGroup = group.id; formSlot = 'new'; }}
              class="w-full py-2.5 border border-dashed border-border rounded-card text-caption font-bold text-content-subtle hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center gap-1"
            >
              <Icon icon="ic:baseline-plus" class="text-sm" /> Add to {group.name || 'circuit'}
            </button>
          </GroupCard>
        {/if}
      {/each}

      <div class="flex border-2 border-dashed border-border rounded-card overflow-hidden">
        <button onclick={() => formSlot = 'new'} class="flex-1 py-3.5 text-label font-bold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
          <Icon icon="ic:baseline-plus" class="text-base" /> Add exercise
        </button>
        <div class="w-px bg-border"></div>
        <button onclick={() => pickingCircuit = true} class="px-4 py-3.5 text-label font-bold text-content-subtle hover:text-content hover:bg-surface/40 transition-colors flex items-center gap-1.5" title="Add a circuit: new, or one you saved">
          <Icon icon="ic:baseline-repeat" class="text-base" /> Circuit
        </button>
        <div class="w-px bg-border"></div>
        <button onclick={() => isImportingAI = true} class="px-4 py-3.5 text-label font-bold text-content-subtle hover:text-content hover:bg-surface/40 transition-colors flex items-center gap-1.5" title="Build or log this session with an AI chat">
          <Icon icon="ic:baseline-auto-awesome" class="text-base" /> Ask AI
        </button>
      </div>
    {/if}
  </div>
</div>

<footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
    <button
      onclick={() => isReordering = !isReordering}
      disabled={workout.exercises.length < 2}
      class="px-3 py-2.5 rounded-control text-label font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {isReordering ? 'bg-primary/15 text-primary' : 'text-content-subtle hover:text-content'}"
    >
      <Icon icon={isReordering ? 'ic:baseline-check' : 'ic:baseline-swap-vert'} class="text-base" />
      {isReordering ? 'Done' : 'Reorder'}
    </button>
    {#if !isReordering}
      <button
        onclick={() => { isGrouping = !isGrouping; picked = []; }}
        disabled={workout.exercises.length === 0}
        class="px-3 py-2.5 rounded-control text-label font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {isGrouping ? 'bg-primary/15 text-primary' : 'text-content-subtle hover:text-content'}"
      >
        <Icon icon={isGrouping ? 'ic:baseline-close' : 'ic:baseline-repeat'} class="text-base" />
        {isGrouping ? 'Cancel' : 'Circuit'}
      </button>
    {/if}
    <div class="flex-1"></div>
    {#if isGrouping}
      <button
        onclick={makeGroup}
        disabled={picked.length === 0}
        class="px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
      >
        <Icon icon="ic:baseline-repeat" class="text-base" /> Make circuit{picked.length ? ` (${picked.length})` : ''}
      </button>
    {:else}
    <button
      onclick={save}
      disabled={isSaving}
      class="px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
    >
      <Icon icon="ic:baseline-check" class="text-base" /> Save
    </button>
    {/if}
  </div>
</footer>

{#if formSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button onclick={() => { formSlot = null; addingToGroup = null; startingCircuit = false; }} class="text-label text-content-subtle hover:text-content flex items-center gap-2 px-1">
        <Icon icon="ic:baseline-arrow-back" class="text-sm" />
        Back to session
      </button>
      {#if formGroup}
        <p class="px-1 text-caption text-content-subtle flex items-start gap-1.5">
          <Icon icon="ic:baseline-repeat" class="text-sm shrink-0 mt-0.5" />
          <span>Part of <b class="text-content-muted">{formGroup.name || 'a circuit'}</b>: set up one set of it (a time, or reps). Rounds and rests come from the circuit; sets only matter if it should drop out early.</span>
        </p>
      {/if}
      <ExerciseForm initialSlot={formSlot === 'new' ? null : formSlot} mode={bucket} inGroup={!!formGroup || startingCircuit} onSave={saveExercise} />
    </div>
  </div>
{/if}

{#if pickingCircuit}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[120] bg-black/40 flex items-end justify-center" onclick={() => pickingCircuit = false}>
    <div class="w-full max-w-lg max-h-[70vh] overflow-y-auto no-scrollbar bg-surface border-t border-border rounded-t-card p-4 pb-8 space-y-2" onclick={(e) => e.stopPropagation()}>
      <p class="text-section uppercase text-content-muted px-1">Add a circuit</p>
      <button onclick={() => { pickingCircuit = false; startingCircuit = true; formSlot = 'new'; }} class="w-full p-3 rounded-card border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-left">
        <p class="text-body font-bold text-primary flex items-center gap-1.5"><Icon icon="ic:baseline-plus" class="text-base" /> New circuit</p>
        <p class="text-caption text-content-subtle">Start with its first exercise; each one is a time or some reps, and the circuit repeats them in rounds.</p>
      </button>
      {#if workout.exercises.length > 1}
        <button onclick={() => { pickingCircuit = false; isGrouping = true; picked = []; }} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content">From exercises already here</p>
          <p class="text-caption text-content-subtle">Pick some of this session's exercises to do in rounds.</p>
        </button>
      {/if}
      {#if trainingState.circuits.length > 0}<p class="text-caption uppercase text-content-subtle px-1 pt-1">Your saved circuits</p>{/if}
      {#each trainingState.circuits as c (c.id)}
        <button onclick={() => addCircuit(c)} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content truncate">{c.name}</p>
          <p class="text-caption text-content-subtle truncate">{c.exercises.map((s) => slotTypeName(s, trainingState.exerciseTypes)).join(' · ')}</p>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if savingGroup}
  {@const group = savingGroup}
  {@const linked = trainingState.circuits.find((c) => c.id === group.circuitId)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[120] bg-black/40 flex items-end justify-center" onclick={() => savingGroup = null}>
    <div class="w-full max-w-lg bg-surface border-t border-border rounded-t-card p-4 pb-8 space-y-2" onclick={(e) => e.stopPropagation()}>
      <p class="text-section uppercase text-content-muted px-1">Save as circuit</p>
      <p class="text-caption text-content-subtle px-1">This came from <b class="text-content-muted">{linked?.name}</b>. Sessions that already have it keep their own copy either way.</p>
      <button onclick={() => saveGroupAsCircuit(group, linked)} class="w-full py-3 rounded-control bg-primary hover:bg-primary-hover text-white text-label font-bold">Update {linked?.name}</button>
      <button onclick={() => saveGroupAsCircuit(group)} class="w-full py-3 rounded-control bg-surface-elevated text-content text-label font-bold">Save as a new circuit</button>
    </div>
  </div>
{/if}

{#if isImportingAI}
  <SessionAIModal
    {workout}
    onImport={(slots, mode, circuits) => {
      let next: { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] } =
        mode === 'replace' ? { exercises: slots, groups: undefined } : { exercises: [...workout.exercises, ...slots], groups: workout.groups };
      for (const c of circuits) next = groupSlots(next, c.slotIds, c.group);
      regroup(next);
      isImportingAI = false;
    }}
    onClose={() => isImportingAI = false}
  />
{/if}
