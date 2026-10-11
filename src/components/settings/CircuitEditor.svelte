<script lang="ts">
  import { showUndo } from '../../lib/toast.svelte';
  /**
   * Edits one saved circuit: its name, a note, the group's timing and its
   * exercises. Full screen, like the workout editor, and built from the same
   * pieces (the group header, exercise cards, the exercise form). Nothing is
   * written until Save.
   */
  import { untrack } from 'svelte';
  import type { Circuit, ExerciseSlot, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { circuitAsWorkout } from '../../lib/exercise/circuits';
  import { groupMinutes, restComparison, memberRounds } from '../../lib/exercise/groups';
  import GroupSettings from '../workout/GroupSettings.svelte';
  import ExerciseCard from '../workout/ExerciseCard.svelte';
  import ExerciseForm from '../workout/ExerciseForm.svelte';
  import Icon from '@iconify/svelte';

  let { circuit: initial, onClose }: { circuit: Circuit | null; onClose: () => void } = $props();

  const isNew = untrack(() => initial === null);
  let draft = $state<Circuit>(
    untrack(() => initial ? structuredClone($state.snapshot(initial)) as Circuit : { id: generateId(), name: '', rounds: 3, transition: 15, roundRest: 60, exercises: [] }),
  );
  const original = JSON.stringify($state.snapshot(draft));

  let formSlot = $state<ExerciseSlot | 'new' | null>(null);

  const asWorkout = $derived(circuitAsWorkout(draft));
  const group = $derived(asWorkout.groups[0]);
  const minutes = $derived(groupMinutes(asWorkout, 'planned').get('circuit'));
  const members = $derived(asWorkout.exercises.map((slot) => ({ slot, values: slot.prescribed ?? {} })));
  const nameOf = (slotId: string) => {
    const slot = draft.exercises.find((e) => e.id === slotId);
    return slot ? slotTypeName(slot, trainingState.exerciseTypes) : '';
  };

  function saveExercise(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    const fields = { typeId: data.typeId, categoryId: data.categoryId, activeParameters: data.activeParameters, prescribed: data.values };
    if (formSlot === 'new') draft.exercises = [...draft.exercises, { id: generateId(), ...fields }];
    else if (formSlot) {
      const id = formSlot.id;
      draft.exercises = draft.exercises.map((e) => (e.id === id ? { ...e, ...fields } : e));
    }
    formSlot = null;
  }

  function move(index: number, by: -1 | 1) {
    const next = [...draft.exercises];
    const [slot] = next.splice(index, 1);
    next.splice(index + by, 0, slot);
    draft.exercises = next;
  }

  async function close() {
    if (JSON.stringify($state.snapshot(draft)) !== original) {
      if (!(await showConfirm('Discard Changes', 'Leave without saving? Your changes to this circuit will be lost.'))) return;
    }
    onClose();
  }

  async function save() {
    draft.name = draft.name.trim() || 'Circuit';
    await trainingState.saveCircuit($state.snapshot(draft) as Circuit);
    onClose();
  }

  /** Sessions that already have it keep their copy; Undo saves it back. */
  async function remove() {
    const saved = trainingState.circuits.find((c) => c.id === draft.id);
    await trainingState.deleteCircuit(draft.id);
    onClose();
    if (saved) showUndo(`${saved.name} deleted`, () => trainingState.saveCircuit(saved));
  }

  backWhile(() => formSlot === null, () => close());
  backWhile(() => formSlot !== null, () => (formSlot = null));
</script>

<div class="fixed inset-0 z-[110] safe-y bg-app-bg flex flex-col">
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-center gap-3">
      <button onclick={close} class="p-2 -ml-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-2xl" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="text-caption uppercase text-primary">{isNew ? 'New circuit' : 'Circuit'}</p>
        <p class="text-caption text-content-subtle">Saved circuits are copied into a session when you add them.</p>
      </div>
      {#if !isNew}
        <button onclick={remove} class="p-2 -mr-2 text-content-subtle hover:text-danger transition-colors" aria-label="Delete circuit">
          <Icon icon="ic:baseline-delete" class="text-xl" />
        </button>
      {/if}
    </div>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-2.5">
      <section class="rounded-card border border-border bg-surface/25 p-2 space-y-2">
        <GroupSettings
          {group}
          {minutes}
          comparisons={restComparison(group, members)}
          dropouts={members.map(({ slot, values }) => ({ slotId: slot.id, rounds: memberRounds(values, group) })).filter((d) => d.rounds < group.rounds)}
          {nameOf}
          namePlaceholder="Name, e.g. Core A"
          onchange={(g) => {
            draft.name = g.name ?? '';
            draft.rounds = g.rounds;
            draft.transition = g.transition;
            draft.roundRest = g.roundRest;
          }}
        />
        <textarea
          bind:value={draft.description}
          rows="2"
          placeholder="What it's for, how to do it (optional)"
          class="block w-full p-2.5 bg-surface-elevated/40 border border-border rounded-control text-label text-content outline-none focus:border-primary/40 resize-none placeholder:text-content-subtle"
        ></textarea>
        {#each draft.exercises as slot, index (slot.id)}
          <div>
            <ExerciseCard slot={slot} {index} inGroup values={slot.prescribed} onclick={() => (formSlot = slot)}>
              {#snippet actions()}
                <button onclick={() => move(index, -1)} disabled={index === 0} class="shrink-0 p-1.5 text-content-subtle hover:text-content disabled:opacity-30" aria-label="Move up">
                  <Icon icon="ic:baseline-keyboard-arrow-up" class="text-lg" />
                </button>
                <button onclick={() => move(index, 1)} disabled={index === draft.exercises.length - 1} class="shrink-0 p-1.5 text-content-subtle hover:text-content disabled:opacity-30" aria-label="Move down">
                  <Icon icon="ic:baseline-keyboard-arrow-down" class="text-lg" />
                </button>
                <button onclick={() => (draft.exercises = draft.exercises.filter((e) => e.id !== slot.id))} class="shrink-0 p-1.5 -mr-1 text-content-subtle hover:text-danger" aria-label="Remove exercise">
                  <Icon icon="ic:baseline-close" class="text-lg" />
                </button>
              {/snippet}
            </ExerciseCard>
          </div>
        {/each}
        <button
          onclick={() => (formSlot = 'new')}
          class="w-full py-2.5 border border-dashed border-border rounded-card text-caption font-bold text-content-subtle hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center gap-1"
        >
          <Icon icon="ic:baseline-plus" class="text-sm" /> Add exercise
        </button>
      </section>
    </div>
  </div>

  <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center justify-end">
      <button
        onclick={save}
        disabled={draft.exercises.length === 0}
        class="px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-label font-bold rounded-control transition-all active:scale-[0.98] flex items-center gap-1.5"
      >
        <Icon icon="ic:baseline-check" class="text-base" /> Save
      </button>
    </div>
  </footer>
</div>

{#if formSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button onclick={() => (formSlot = null)} class="text-label text-content-subtle hover:text-content flex items-center gap-2 px-1">
        <Icon icon="ic:baseline-arrow-back" class="text-sm" /> Back to circuit
      </button>
      <ExerciseForm initialSlot={formSlot === 'new' ? null : formSlot} mode="prescribed" inGroup onSave={saveExercise} />
    </div>
  </div>
{/if}
