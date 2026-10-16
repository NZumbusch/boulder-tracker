<script lang="ts">
  import { showUndo, scopedUndo } from '../../lib/toast.svelte';
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
  // normaliseGroups drops the groups when none has members, so a new circuit (no exercises yet) has none: fall back to the draft's own timing.
  const group = $derived(asWorkout.groups?.[0] ?? { id: 'circuit', name: draft.name, rounds: draft.rounds, transition: draft.transition, roundRest: draft.roundRest });
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

  const undoable = scopedUndo();
  function removeExercise(slot: ExerciseSlot) {
    const index = draft.exercises.findIndex((e) => e.id === slot.id);
    const removed = $state.snapshot(slot) as ExerciseSlot;
    draft.exercises = draft.exercises.filter((e) => e.id !== slot.id);
    undoable(`${slotTypeName(removed, trainingState.exerciseTypes)} removed`, () => {
      if (draft.exercises.some((e) => e.id === removed.id)) return;
      const next = [...draft.exercises];
      next.splice(Math.min(index, next.length), 0, removed);
      draft.exercises = next;
    }, async () => {
      // The editor has saved and closed: put it back into the stored circuit.
      const stored = trainingState.circuits.find((c) => c.id === draft.id);
      if (!stored) throw new Error('circuit is gone');
      if (stored.exercises.some((e) => e.id === removed.id)) return;
      const list = [...stored.exercises];
      list.splice(Math.min(index, list.length), 0, removed);
      await trainingState.saveCircuit({ ...$state.snapshot(stored), exercises: list } as Circuit);
    });
  }

  function move(index: number, by: -1 | 1) {
    const next = [...draft.exercises];
    const [slot] = next.splice(index, 1);
    next.splice(index + by, 0, slot);
    draft.exercises = next;
  }

  async function close() {
    if (JSON.stringify($state.snapshot(draft)) !== original) {
      if (!(await showConfirm('Discard changes?', 'Leave without saving? Your changes to this circuit will be lost.', { ok: 'Discard', cancel: 'Keep editing' }))) return;
    }
    onClose();
  }

  async function save() {
    draft.name = draft.name.trim() || 'Circuit';
    await trainingState.saveCircuit($state.snapshot(draft) as Circuit);
    undoable.commit();
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
      <button onclick={close} class="btn-icon -ml-2 shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-2xl" />
      </button>
      <div class="min-w-0 flex-1">
        <p class="text-caption uppercase text-primary">{isNew ? 'New circuit' : 'Circuit'}</p>
        <p class="text-caption text-content-subtle">Saved circuits are copied into a session when you add them.</p>
      </div>
      {#if !isNew}
        <button onclick={remove} class="btn-icon -mr-2 hover:text-danger" aria-label="Delete circuit">
          <Icon icon="ic:baseline-delete" class="text-xl" />
        </button>
      {/if}
    </div>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 py-4 pb-32 space-y-2.5">
      <section class="rounded-card bg-surface-elevated/50 p-2 space-y-2">
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
          class="field resize-none"
          aria-label="Description"
        ></textarea>
        {#each draft.exercises as slot, index (slot.id)}
          <div>
            <ExerciseCard slot={slot} {index} inGroup values={slot.prescribed} onclick={() => (formSlot = slot)}>
              {#snippet actions()}
                <button onclick={() => move(index, -1)} disabled={index === 0} class="btn-icon shrink-0 disabled:opacity-30" aria-label="Move up">
                  <Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" />
                </button>
                <button onclick={() => move(index, 1)} disabled={index === draft.exercises.length - 1} class="btn-icon shrink-0 disabled:opacity-30" aria-label="Move down">
                  <Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" />
                </button>
                <button onclick={() => removeExercise(slot)} class="btn-icon shrink-0 -mr-1 hover:text-danger" aria-label="Remove {slotTypeName(slot, trainingState.exerciseTypes)}">
                  <Icon icon="ic:baseline-close" class="text-xl" />
                </button>
              {/snippet}
            </ExerciseCard>
          </div>
        {/each}
        <button
          onclick={() => (formSlot = 'new')}
          class="w-full min-h-11 py-2.5 border border-dashed border-border-strong rounded-card text-label font-bold text-content-muted hover:text-primary transition-colors flex items-center justify-center gap-1"
        >
          <Icon icon="ic:baseline-plus" class="text-sm" /> Add exercise
        </button>
      </section>
    </div>
  </div>

  <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 py-3 flex items-center justify-end gap-3">
      {#if draft.exercises.length === 0}<p class="text-caption text-content-subtle" id="circuit-save-why">Add at least one exercise to save.</p>{/if}
      <button
        onclick={save}
        disabled={draft.exercises.length === 0}
        aria-describedby={draft.exercises.length === 0 ? 'circuit-save-why' : undefined}
        class="btn btn-primary px-6 gap-1.5"
      >
        <Icon icon="ic:baseline-check" class="text-base" /> Save
      </button>
    </div>
  </footer>
</div>

{#if formSlot}
  <div class="fixed inset-0 z-[120] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button onclick={() => (formSlot = null)} class="btn btn-ghost -ml-2 gap-2">
        <Icon icon="ic:baseline-arrow-back" class="text-base" /> Back to circuit
      </button>
      <ExerciseForm initialSlot={formSlot === 'new' ? null : formSlot} mode="prescribed" inGroup onSave={saveExercise} />
    </div>
  </div>
{/if}
