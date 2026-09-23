<script lang="ts">
  /**
   * The workout modal's edit mode - the viewer made editable in place rather
   * than a separate form: the title and note are fields, the schedule is a
   * row of chips that open a small picker, and each exercise card opens the
   * full ExerciseForm. Reordering is a mode (like the live session's), so the
   * cards stay clean and a scroll on mobile never turns into a drag.
   *
   * Edits a local copy; nothing is written until Save.
   */
  import type { Workout, ExerciseSlot, ExerciseValues, ParameterBlock, DayOfWeek } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { slotSummary } from '../../lib/session/slotDetails';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { flip } from 'svelte/animate';
  import { untrack } from 'svelte';
  import ExerciseCard from './ExerciseCard.svelte';
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
  /** The slot open in ExerciseForm, or 'new' while adding one. */
  let formSlot = $state<ExerciseSlot | 'new' | null>(null);
  let isImportingAI = $state(false);
  let isSaving = $state(false);

  const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /** Grows a textarea to fit its text, so long notes wrap and expand down instead of scrolling. */
  function autosize(node: HTMLTextAreaElement, _value?: string) {
    const fit = () => { node.style.height = 'auto'; node.style.height = node.scrollHeight + 'px'; };
    fit();
    return { update: fit };
  }

  function toggleChip(chip: 'day' | 'time' | 'duration') {
    openChip = openChip === chip ? null : chip;
  }

  function saveExercise(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    const fields = { typeId: data.typeId, categoryId: data.categoryId, activeParameters: data.activeParameters, [bucket]: data.values };
    if (formSlot === 'new') {
      workout.exercises = [...workout.exercises, { id: generateId(), ...fields }];
    } else if (formSlot) {
      const id = formSlot.id;
      workout.exercises = workout.exercises.map((e) => e.id === id ? { ...e, ...fields } : e);
    }
    formSlot = null;
  }

  async function removeExercise(slot: ExerciseSlot) {
    const confirmed = await showConfirm('Remove Exercise', `Remove ${slotTypeName(slot, trainingState.exerciseTypes)} from this session?`);
    if (confirmed) workout.exercises = workout.exercises.filter((e) => e.id !== slot.id);
  }

  function handleDnd(e: CustomEvent<DndEvent<ExerciseSlot>>) {
    workout.exercises = e.detail.items;
  }

  // Nothing to reorder once there's one card or none - don't strand the toggle on.
  $effect(() => {
    if (workout.exercises.length < 2 && isReordering) isReordering = false;
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
      const saved = $state.snapshot(workout) as Workout;
      await trainingState.saveWorkout(saved);
      onSaved(saved);
    } finally {
      isSaving = false;
    }
  }
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

    {#if isReordering}
      <section
        class="space-y-2.5 outline-none"
        use:dndzone={{ items: workout.exercises, dropTargetStyle: {}, delayTouchStart: true }}
        onconsider={handleDnd}
        onfinalize={handleDnd}
      >
        {#each workout.exercises as slot (slot.id)}
          <div animate:flip={{ duration: 200 }} class="p-3 bg-surface/60 border border-border rounded-card flex items-center gap-2.5">
            <Icon icon="ic:baseline-drag-indicator" class="text-xl text-content-subtle shrink-0 cursor-grab active:cursor-grabbing" />
            <div class="min-w-0 flex-1">
              <p class="text-body font-bold text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</p>
              <p class="text-caption text-content-subtle truncate">{slotSummary(slot) || '—'}</p>
            </div>
          </div>
        {/each}
      </section>
    {:else}
      {#each workout.exercises as slot, index (slot.id)}
        <ExerciseCard {slot} {index} values={slot[bucket]} onclick={() => formSlot = slot}>
          {#snippet actions()}
            <button
              onclick={() => removeExercise(slot)}
              class="shrink-0 p-2 -mr-1 text-content-subtle hover:text-danger transition-colors"
              aria-label="Remove exercise"
            >
              <Icon icon="ic:baseline-close" class="text-lg" />
            </button>
          {/snippet}
        </ExerciseCard>
      {/each}

      <div class="flex border-2 border-dashed border-border rounded-card overflow-hidden">
        <button onclick={() => formSlot = 'new'} class="flex-1 py-3.5 text-label font-bold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5">
          <Icon icon="ic:baseline-plus" class="text-base" /> Add exercise
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
    <div class="flex-1"></div>
    <button
      onclick={save}
      disabled={isSaving}
      class="px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
    >
      <Icon icon="ic:baseline-check" class="text-base" /> Save
    </button>
  </div>
</footer>

{#if formSlot}
  <div class="fixed inset-0 z-[120] bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button onclick={() => formSlot = null} class="text-label text-content-subtle hover:text-content flex items-center gap-2 px-1">
        <Icon icon="ic:baseline-arrow-back" class="text-sm" />
        Back to session
      </button>
      <ExerciseForm initialSlot={formSlot === 'new' ? null : formSlot} mode={bucket} onSave={saveExercise} />
    </div>
  </div>
{/if}

{#if isImportingAI}
  <SessionAIModal
    {workout}
    onImport={(slots, mode) => {
      workout.exercises = mode === 'replace' ? slots : [...workout.exercises, ...slots];
      isImportingAI = false;
    }}
    onClose={() => isImportingAI = false}
  />
{/if}
