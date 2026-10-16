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
  import { formatClockText } from '../../lib/timeFormat';
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
  import { reinsertSlot } from '../../lib/exercise/reinsert';
  import { circuitFromGroup, insertCircuit } from '../../lib/exercise/circuits';
  import CircuitPickerSheet from './CircuitPickerSheet.svelte';
  import CircuitBuilder from './CircuitBuilder.svelte';
  import { toast } from '../../lib/toast.svelte';
  import { emptySessionWarning } from '../../lib/session/emptySession';
  import { buildPastSession, pastSessionProblem } from '../../lib/session/pastSession';
  import { formatDay, localIsoDate } from '../../lib/dateUtils';
  import type { ExerciseGroup, Circuit } from '../../lib/types';
  import ExerciseForm from './ExerciseForm.svelte';
  import TestSheet from './TestSheet.svelte';
  import { TEST_SLOT_MINUTES } from '../../lib/benchmarks/testSlot';
  import SessionAIModal from './SessionAIModal.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { reportError } from '../../lib/errorReporting';
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

  let openChip = $state<'day' | 'time' | 'duration' | 'place' | null>(null);

  /** A session being logged after the fact: its day is a date (and moves its week), not just a weekday. */
  const pastLog = $derived(isNew && workout.status === 'completed' && !!workout.date);
  const pastDay = $derived(workout.date ? localIsoDate(new Date(workout.date)) : '');
  let dateProblem = $state<string | null>(null);
  function setPastDay(day: string) {
    dateProblem = pastSessionProblem(day, workout.startTime);
    if (dateProblem) return;
    const moved = buildPastSession({ id: workout.id, day, time: workout.startTime });
    if (!moved) return;
    workout.date = moved.date;
    workout.weekId = moved.weekId;
    workout.dayOfWeek = moved.dayOfWeek;
  }
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
  /** The test sheet: planning one (a new slot, or an existing one's conditions) or recording a result. */
  let testSheet = $state<{ mode: 'plan' | 'result'; slot?: ExerciseSlot } | null>(null);
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

  /** The circuit builder: a saved circuit to adjust, or a new one (null), with what was typed as its name. */
  let building = $state<{ from: Circuit | null; name: string } | null>(null);

  /** The builder's Add: saved first when asked, then in at the end of the session. */
  async function addBuilt(circuit: Circuit, save: 'none' | 'new' | 'update') {
    if (save !== 'none') await trainingState.saveCircuit(circuit);
    regroup(insertCircuit(workout, circuit, generateId));
    building = null;
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

  function toggleChip(chip: 'day' | 'time' | 'duration' | 'place') {
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

  /** Tapping a card: a test opens its own sheet (its result once the session is logged), everything else the exercise form. */
  function openSlot(exercise: ExerciseSlot) {
    if (exercise.test) testSheet = { mode: bucket === 'logged' ? 'result' : 'plan', slot: exercise };
    else formSlot = exercise;
  }

  function saveTestPlan(slot: ExerciseSlot) {
    const exists = workout.exercises.some((e) => e.id === slot.id);
    workout.exercises = exists ? workout.exercises.map((e) => (e.id === slot.id ? slot : e)) : [...workout.exercises, slot];
    testSheet = null;
  }

  /** The result is saved as a benchmark; the slot counts as done. */
  function testRecorded(slotId: string) {
    workout.exercises = workout.exercises.map((e) => (e.id === slotId ? { ...e, logged: { ...(e.logged ?? {}), duration: e.logged?.duration ?? e.prescribed?.duration ?? TEST_SLOT_MINUTES } } : e));
    testSheet = null;
  }

  const undoable = scopedUndo();
  /** Set when Save went through: the stored session an Undo may still have to put an exercise back into. */
  let saved: Workout | null = null;
  async function putBackInSaved(slot: ExerciseSlot, index: number, groups?: ExerciseGroup[]) {
    const stored = saved && trainingState.getWorkoutsForWeek(saved.weekId).find((w) => w.id === saved!.id);
    if (!stored) throw new Error('session is gone');
    await trainingState.saveWorkout(reinsertSlot($state.snapshot(stored) as Workout, slot, index, groups));
  }
  function removeExercise(slot: ExerciseSlot) {
    const before = $state.snapshot({ exercises: workout.exercises, groups: workout.groups }) as { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] };
    const index = before.exercises.findIndex((e) => e.id === slot.id);
    const removed = $state.snapshot(slot) as ExerciseSlot;
    regroup(normaliseGroups({ ...workout, exercises: workout.exercises.filter((e) => e.id !== slot.id) }));
    undoable(`${slotTypeName(slot, trainingState.exerciseTypes)} removed`, () => regroup(before), () => putBackInSaved(removed, index, before.groups));
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
      const confirmed = await showConfirm('Discard changes', 'Leave without saving? Your changes to this session will be lost.', { ok: 'Discard', cancel: 'Keep editing' });
      if (!confirmed) return;
    }
    onCancel();
  }

  /** A session that was already empty when opened is not asked about again. */
  const wasEmpty = untrack(() => !isNew && emptySessionWarning(initial) !== null);

  async function save() {
    const warning = emptySessionWarning($state.snapshot(workout) as Workout, wasEmpty);
    if (warning && !(await showConfirm(warning.title, warning.text, { ok: warning.ok, cancel: 'Keep editing' }))) return;
    isSaving = true;
    try {
      // A Plan B edit comes back as Plan B's own copy; null = refused (stay here).
      const result = await trainingState.saveWorkout($state.snapshot(workout) as Workout);
      if (result) {
        saved = result;
        undoable.commit();
        onSaved(result);
      }
    } catch (err) {
      // A failed save keeps the editor open with everything still in it.
      reportError(err, 'Save session');
      toast.show('Could not save the session. Your changes are still here; try again.');
    } finally {
      isSaving = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => cancel());
</script>

<header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-start gap-3">
    <button onclick={cancel} class="btn-icon -ml-2 shrink-0" aria-label={isNew ? 'Close' : 'Back to session'}>
      <Icon icon={isNew ? 'ic:baseline-close' : 'ic:baseline-arrow-back'} class="text-2xl" />
    </button>
    <div class="min-w-0 flex-1">
      <p class="text-caption uppercase text-primary">
        {isNew ? 'New session' : 'Editing'} &middot; {workout.status === 'completed' ? 'Completed' : 'Planned'}
      </p>
      <input
        bind:value={workout.notes}
        class="min-h-10 w-full bg-transparent text-title text-content outline-none border-b border-dashed border-border-strong focus:border-primary/60 pb-0.5 transition-colors"
        placeholder="Session name"
        aria-label="Session name"
      />

      <!-- Schedule chips: read like the viewer's subtitle, tap one to set it. -->
      <div class="flex flex-wrap gap-1.5 mt-2.5">
        {#snippet chip(id: 'day' | 'time' | 'duration' | 'place', icon: string, label: string, isSet: boolean)}
          <button
            onclick={() => toggleChip(id)}
            class="px-3 min-h-10 rounded-full text-caption font-bold border transition-colors flex items-center gap-1 {openChip === id
              ? 'bg-primary/15 border-primary/50 text-primary'
              : isSet
                ? 'bg-surface-elevated border-border-strong text-content'
                : 'bg-transparent border-dashed border-border-strong text-content-subtle'}"
            aria-expanded={openChip === id}
          >
            <Icon {icon} class="text-sm" /> {label}
          </button>
        {/snippet}
        {#if pastLog}
          {@render chip('day', 'ic:baseline-calendar-today', formatDay(workout.date!, { weekday: 'short' }), true)}
        {:else}
          {@render chip('day', 'ic:baseline-calendar-today', workout.dayOfWeek ? workout.dayOfWeek.slice(0, 3) : 'Day', !!workout.dayOfWeek)}
        {/if}
        {@render chip('time', 'ic:baseline-schedule', workout.startTime ? formatClockText(workout.startTime, trainingState.clock12) : 'Time', !!workout.startTime)}
        {@render chip('duration', 'ic:baseline-timer', workout.plannedDuration ? `${workout.plannedDuration} min` : 'Duration', !!workout.plannedDuration)}
        {@render chip('place', 'ic:baseline-place', workout.location || 'Where', !!workout.location)}
      </div>

      {#if openChip === 'day' && pastLog}
        <div class="mt-2 space-y-1 animate-in fade-in duration-150">
          <input type="date" value={pastDay} max={localIsoDate()} aria-label="Day it happened" onchange={(e) => setPastDay(e.currentTarget.value)} class="field w-full" />
          {#if dateProblem}<p class="text-caption text-warning" role="alert">{dateProblem}</p>{/if}
        </div>
      {:else if openChip === 'day'}
        <div class="flex flex-wrap gap-1.5 mt-2 animate-in fade-in duration-150">
          {#each DAYS as day}
            <button
              onclick={() => { workout.dayOfWeek = day; openChip = null; }}
              class="px-3 min-h-11 rounded-control text-label border transition-colors {workout.dayOfWeek === day ? 'bg-primary border-primary text-on-primary' : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content'}"
            >{day.slice(0, 3)}</button>
          {/each}
          <button
            onclick={() => { workout.dayOfWeek = undefined; openChip = null; }}
            class="px-3 min-h-11 rounded-control text-label border transition-colors {!workout.dayOfWeek ? 'bg-surface-elevated-hover border-border-strong text-content' : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content'}"
          >None</button>
        </div>
      {:else if openChip === 'time'}
        <div class="flex items-center gap-2 mt-2 animate-in fade-in duration-150">
          <input
            type="time"
            bind:value={workout.startTime}
            onchange={() => { if (pastLog) setPastDay(pastDay); }}
            aria-label="Start time"
            class="field flex-1"
          />
          <button onclick={() => { workout.startTime = undefined; if (pastLog) setPastDay(pastDay); openChip = null; }} class="btn btn-ghost px-3">Clear</button>
        </div>
      {:else if openChip === 'duration'}
        <div class="flex items-center gap-2 mt-2 animate-in fade-in duration-150">
          <input
            type="number"
            min="1"
            step="5"
            inputmode="numeric"
            placeholder="Minutes"
            aria-label="Planned duration in minutes"
            enterkeyhint="done"
            value={workout.plannedDuration ?? ''}
            onchange={(e) => {
              const n = Number(e.currentTarget.value);
              workout.plannedDuration = e.currentTarget.value === '' || !Number.isFinite(n) || n <= 0 ? undefined : n;
            }}
            class="field flex-1"
          />
          <span class="text-label text-content-subtle">min</span>
          <button onclick={() => { workout.plannedDuration = undefined; openChip = null; }} class="btn btn-ghost px-3">Clear</button>
        </div>
      {:else if openChip === 'place'}
        <!-- Your saved places to pick from, or any text (an outside venue). By name: see Workout.location. -->
        <div class="mt-2 space-y-2 animate-in fade-in duration-150">
          {#if trainingState.places.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each trainingState.places as place (place.name)}
                <button
                  onclick={() => { workout.location = place.name; openChip = null; }}
                  class="px-3 min-h-11 rounded-control text-label border transition-colors {workout.location === place.name ? 'bg-primary border-primary text-on-primary' : 'bg-surface-elevated/50 border-border-strong text-content-subtle hover:text-content'}"
                >{place.name}</button>
              {/each}
            </div>
          {/if}
          <div class="flex items-center gap-2">
            <input
              type="text"
              maxlength="80"
              placeholder="Or type a place"
              aria-label="Where the session is"
              value={workout.location ?? ''}
              oninput={(e) => { workout.location = e.currentTarget.value.trim() ? e.currentTarget.value : undefined; }}
              class="field flex-1"
            />
            <button onclick={() => { workout.location = undefined; openChip = null; }} class="btn btn-ghost px-3">Clear</button>
          </div>
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
      placeholder="Session notes or goals…"
      aria-label="Session notes or goals"
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
          <div animate:flip={{ duration: motionMs(200) }} class="p-3 bg-surface/60 rounded-card flex items-center gap-2.5">
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
          <ExerciseCard slot={exercise} {index} inGroup={!!exercise.groupId} values={exercise[bucket]} showLog={bucket === 'logged'} onclick={() => openSlot(exercise)}>
            {#snippet actions()}
              {#if exercise.groupId}
                <button
                  onclick={() => regroup(takeOutOfGroup(workout, exercise.id))}
                  class="btn-icon shrink-0"
                  aria-label="Take out of the circuit"
                  title="Take out of the circuit"
                >
                  <Icon icon="ic:baseline-logout" class="text-lg" />
                </button>
              {/if}
              <button
                onclick={() => removeExercise(exercise)}
                class="btn-icon shrink-0 -mr-1 hover:text-danger"
                aria-label="Remove exercise"
              >
                <Icon icon="ic:baseline-delete" class="text-lg" />
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
                  <button onclick={() => onSaveCircuit(group)} class="btn-icon shrink-0" aria-label="Save as circuit" title="Save as circuit">
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
              class="w-full min-h-11 py-2.5 border border-dashed border-border rounded-card text-label font-bold text-content-subtle hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center gap-1"
            >
              <Icon icon="ic:baseline-plus" class="text-sm" /> Add to {group.name || 'circuit'}
            </button>
          </GroupCard>
        {/if}
      {/each}

      <div class="border-2 border-dashed border-border rounded-card overflow-hidden">
        <!-- An exercise or a circuit: the two ways to add something, side by side. -->
        <div class="grid grid-cols-2 divide-x divide-border">
          <button onclick={() => formSlot = 'new'} class="py-3.5 text-label whitespace-nowrap font-bold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
            <Icon icon="ic:baseline-plus" class="text-base" /> Add exercise
          </button>
          <button onclick={() => pickingCircuit = true} class="py-3.5 text-label whitespace-nowrap font-bold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5" title="Add a circuit: one you saved, or a new one">
            <Icon icon="ic:baseline-repeat" class="text-base" /> Add circuit
          </button>
        </div>
        <div class="grid grid-cols-2 border-t border-border divide-x divide-border">
          <button onclick={() => testSheet = { mode: 'plan' }} class="py-3 text-label font-bold text-content-subtle hover:text-content hover:bg-surface/40 transition-colors flex items-center justify-center gap-1.5" title="Plan a test in this session">
            <Icon icon="ic:baseline-flag" class="text-base" /> Test
          </button>
          <button onclick={() => isImportingAI = true} class="py-3 text-label font-bold text-content-subtle hover:text-content hover:bg-surface/40 transition-colors flex items-center justify-center gap-1.5" title="Build or log this session with an AI chat">
            <Icon icon="ic:baseline-auto-awesome" class="text-base" /> Ask AI
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
  <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center gap-2">
    {#if isGrouping && picked.length === 0}<span class="sr-only" role="status">Pick at least one exercise to make a circuit.</span>{/if}
    <button
      onclick={() => isReordering = !isReordering}
      disabled={workout.exercises.length < 2}
      class="btn px-3 disabled:opacity-40 {isReordering ? 'bg-primary/15 text-primary' : 'text-content-subtle hover:text-content'}"
    >
      <Icon icon={isReordering ? 'ic:baseline-check' : 'ic:baseline-swap-vert'} class="text-base" />
      {isReordering ? 'Done' : 'Reorder'}
    </button>
    {#if !isReordering}
      <button
        onclick={() => { isGrouping = !isGrouping; picked = []; }}
        disabled={workout.exercises.length === 0}
        class="btn px-3 disabled:opacity-40 {isGrouping ? 'bg-primary/15 text-primary' : 'text-content-subtle hover:text-content'}"
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
        class="btn btn-primary px-5"
      >
        <Icon icon="ic:baseline-repeat" class="text-base" /> Make circuit{picked.length ? ` (${picked.length})` : ''}
      </button>
    {:else}
    <button
      onclick={save}
      disabled={isSaving}
      class="btn btn-primary px-6"
    >
      <Icon icon="ic:baseline-check" class="text-base" /> {isSaving ? 'Saving…' : 'Save'}
    </button>
    {/if}
  </div>
</footer>

{#if formSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <div class="sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-3 pb-1 bg-app-bg">
        <button onclick={() => { formSlot = null; addingToGroup = null; startingCircuit = false; }} class="btn btn-ghost -ml-2 px-3 gap-2">
          <Icon icon="ic:baseline-arrow-back" class="text-base" />
          Back to session
        </button>
      </div>
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

{#if testSheet}
  {#if testSheet.mode === 'plan'}
    <TestSheet mode="plan" slot={testSheet.slot} onSave={saveTestPlan} onClose={() => (testSheet = null)} />
  {:else if testSheet.slot}
    {@const tslot = testSheet.slot}
    <TestSheet mode="result" slot={tslot} workout={{ id: workout.id, weekId: workout.weekId, date: workout.date ?? undefined }} onSaved={() => testRecorded(tslot.id)} onClose={() => (testSheet = null)} />
  {/if}
{/if}

{#if pickingCircuit}
  <CircuitPickerSheet
    onClose={() => pickingCircuit = false}
    onNew={(name) => { pickingCircuit = false; building = { from: null, name }; }}
    onPick={(c) => { pickingCircuit = false; building = { from: c, name: '' }; }}
  >
    {#snippet extra()}
      {#if workout.exercises.length > 1}
        <button onclick={() => { pickingCircuit = false; isGrouping = true; picked = []; }} class="w-full p-3 rounded-card border border-border bg-surface/60 hover:border-border-strong text-left">
          <p class="text-body font-bold text-content">From exercises already here</p>
          <p class="text-caption text-content-subtle">Pick some of this session's exercises to do in rounds.</p>
        </button>
      {/if}
    {/snippet}
  </CircuitPickerSheet>
{/if}

{#if building}
  <CircuitBuilder initial={building.from} startName={building.name} confirmLabel="Add to this session" onAdd={addBuilt} onClose={() => (building = null)} />
{/if}

{#if savingGroup}
  {@const group = savingGroup}
  {@const linked = trainingState.circuits.find((c) => c.id === group.circuitId)}
  <Sheet title="Save as circuit" level="nested" onClose={() => savingGroup = null}>
    <div class="space-y-2">
      <p class="text-label text-content-subtle">This came from <b class="text-content-muted">{linked?.name ?? 'a saved circuit'}</b>. Sessions that already have it keep their own copy either way.</p>
      {#if linked}<button onclick={() => saveGroupAsCircuit(group, linked)} class="btn btn-primary w-full">Update {linked.name}</button>{/if}
      <button onclick={() => saveGroupAsCircuit(group)} class="btn btn-secondary w-full">Save as a new circuit</button>
    </div>
  </Sheet>
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
