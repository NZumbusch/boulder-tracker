<script lang="ts">
  /**
   * A benchmark test inside a session, in two parts.
   *
   * - Plan: choose the test and the conditions it is to be done under; it
   *   becomes a slot in the session, scheduled like an exercise. Shows when
   *   the test was last done, so the choice is an informed one.
   * - Result: in a live session (or when editing a finished one), enter what
   *   was measured. It is saved as a benchmark result linked to the slot, with
   *   a stable id, so entering it again edits the same result.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import type { Benchmark, ExerciseSlot } from '../../lib/types';
  import { askedFields, groupTypes, primaryField, resolveFields, unitLabel, resultValues, type ResolvedField } from '../../lib/benchmarks/model';
  import { inputsFromValues, lastConditions, makeTestSlot, resultForSlot, resultText, resultsOf, testResultId, valuesFromInputs } from '../../lib/benchmarks/testSlot';

  type Props =
    | { mode: 'plan'; slot?: ExerciseSlot; onSave: (slot: ExerciseSlot) => void; onClose: () => void }
    | { mode: 'result'; slot: ExerciseSlot; workout: { id?: string; weekId: string; date?: string }; onSaved: (result: Benchmark) => void; onClose: () => void };
  let props: Props = $props();

  const weight = $derived(trainingState.units.weight);
  const defs = $derived(trainingState.valueDefs);
  const types = $derived(trainingState.benchmarkTypes);
  const existing = $derived(props.slot);
  const groups = $derived(groupTypes(types.filter((t) => !t.archived || t.id === existing?.test?.typeId)));

  // svelte-ignore state_referenced_locally
  let typeId = $state(props.slot?.test?.typeId ?? '');
  const type = $derived(types.find((t) => t.id === typeId));
  const fields = $derived<ResolvedField[]>(type ? resolveFields(type, defs) : []);
  const primary = $derived(primaryField(fields));
  // The result first, then how it was done.
  const askedAll = $derived([...askedFields(fields)].sort((a, b) => Number(b.role === 'result') - Number(a.role === 'result')));
  const last = $derived(type ? resultsOf(trainingState.benchmarks, type.id)[0] : undefined);
  const weeksAgo = $derived(last ? Math.max(0, Math.floor((Date.now() - new Date(last.date).getTime()) / (7 * 86_400_000))) : undefined);

  /** What the inputs hold, by value-type id. */
  let inputs = $state<Record<string, string>>({});
  // svelte-ignore state_referenced_locally
  let notes = $state(props.slot?.prescribed?.notes ?? '');
  let showProtocol = $state(false);
  let error = $state('');

  const recorded = $derived(props.mode === 'result' ? resultForSlot(trainingState.benchmarks, props.slot.id) : undefined);

  /** (Re)fills the inputs when the test changes: from the slot or the recorded result, else from the last time. */
  let filledFor = '';
  $effect(() => {
    const t = type;
    if (!t || filledFor === t.id) return;
    filledFor = t.id;
    const f = resolveFields(t, defs);
    if (props.mode === 'result') {
      const own = resultForSlot(trainingState.benchmarks, props.slot.id);
      if (own) { inputs = inputsFromValues(f, resultValues(own, f), weight); notes = own.notes ?? ''; return; }
      inputs = inputsFromValues(f, { ...lastConditions(t, defs, trainingState.benchmarks), ...(props.slot.test?.conditions ?? {}) }, weight);
      return;
    }
    const planned = props.slot?.test?.typeId === t.id ? props.slot.test?.conditions : undefined;
    inputs = inputsFromValues(f, planned ?? lastConditions(t, defs, trainingState.benchmarks), weight);
  });

  function close() { props.onClose(); }
  backWhile(() => true, close);

  function savePlan() {
    if (props.mode !== 'plan') return;
    if (!type) { error = 'Choose a test.'; return; }
    const conditions = valuesFromInputs(fields, inputs, weight);
    // Fixed conditions are the test's own; only what the athlete chose is planned.
    for (const f of fields) if (f.fixed !== undefined) delete conditions[f.valueId];
    const base = props.slot ?? makeTestSlot({ id: generateId(), type });
    const slot: ExerciseSlot = {
      ...base,
      test: { typeId: type.id, name: type.name, ...(Object.keys(conditions).length ? { conditions } : {}) },
      prescribed: { ...(base.prescribed ?? {}), notes: notes.trim() || undefined },
    };
    props.onSave(slot);
  }

  async function saveResult() {
    if (props.mode !== 'result') return;
    if (!type || !primary) { error = 'This test is gone - pick another in Settings.'; return; }
    const values = valuesFromInputs(fields, inputs, weight);
    const value = values[primary.valueId];
    if (typeof value !== 'number') { error = `Enter the ${primary.label.toLowerCase()}.`; return; }
    const w = props.workout;
    const own = resultForSlot(trainingState.benchmarks, props.slot.id);
    const result: Benchmark = {
      id: own?.id ?? testResultId(props.slot.id),
      typeId: type.id,
      type: type.name,
      value,
      unit: type.unit,
      date: own?.date ?? w.date ?? new Date().toISOString(),
      weekId: own?.weekId ?? w.weekId,
      notes: notes.trim() || undefined,
      values,
      slotId: props.slot.id,
      ...(w.id ? { workoutId: w.id } : {}),
    };
    await trainingState.saveBenchmark(result);
    props.onSaved(result);
  }

  const inputClass = 'w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm';
</script>

<div class="fixed inset-0 z-[160] pb-safe bg-app-bg/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-150">
  <div class="absolute inset-0" role="presentation" onclick={close}></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={close} role="dialog" aria-modal="true" aria-label={props.mode === 'plan' ? 'Plan a test' : 'Record the result'}>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-title text-content">{props.mode === 'plan' ? (existing ? 'Edit the test' : 'Plan a test') : 'Record the result'}</h3>
        {#if props.mode === 'result' && type}<p class="text-caption text-content-subtle">{type.name}</p>{/if}
      </div>
      <button onclick={close} class="text-content-subtle hover:text-content shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
    </div>

    {#if props.mode === 'plan'}
      <div class="space-y-1">
        <label for="test-pick" class="text-label text-content-subtle ml-1">Test</label>
        <select id="test-pick" bind:value={typeId} class="{inputClass} appearance-none">
          <option value="" disabled>Choose a test</option>
          {#each groups as g (g.group)}
            {#if g.group && groups.length > 1}
              <optgroup label={g.group}>{#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</optgroup>
            {:else}
              {#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            {/if}
          {/each}
        </select>
        {#if types.length === 0}<p class="text-caption text-content-subtle px-1">There are no tests yet. Add one under Settings → Training setup → Tests.</p>{/if}
      </div>
    {/if}

    {#if type}
      <p class="text-caption text-content-subtle px-1">
        {#if last}Last done {weeksAgo === 0 ? 'this week' : `${weeksAgo} week${weeksAgo === 1 ? '' : 's'} ago`}: {resultText(last, type, defs, weight)}{:else}Never done yet.{/if}
      </p>
      {#if type.protocol}
        <button onclick={() => (showProtocol = !showProtocol)} class="w-full text-left px-1 text-caption text-content-subtle hover:text-content transition-colors">
          <span class="flex items-center gap-1 font-bold"><Icon icon={showProtocol ? 'ic:baseline-expand-more' : 'ic:baseline-chevron-right'} class="text-sm" /> How to do it</span>
          {#if showProtocol}<span class="block mt-1 whitespace-pre-wrap break-words text-content-muted">{type.protocol}</span>{/if}
        </button>
      {/if}

      {#if props.mode === 'result' || askedAll.length > 0}
        <div class="grid grid-cols-2 gap-3">
          {#each askedAll as f (f.valueId)}
            {@const isPrimary = primary?.valueId === f.valueId}
            <div class="space-y-1 {isPrimary || askedAll.length <= 2 ? 'col-span-2' : ''}">
              <label for="test-{f.valueId}" class="block text-label text-content-subtle ml-1">
                {f.label}{#if props.mode === 'result' && props.slot.test?.conditions?.[f.valueId] !== undefined}<span class="text-content-subtle/70">&nbsp;· planned</span>{/if}{#if unitLabel(f, weight)}<span class="text-content-subtle/70">&nbsp;({unitLabel(f, weight)})</span>{/if}
              </label>
              {#if f.kind === 'choice'}
                <select id="test-{f.valueId}" bind:value={inputs[f.valueId]} class="{inputClass} appearance-none">
                  <option value="">–</option>
                  {#each f.options as o}<option value={o}>{o}</option>{/each}
                </select>
              {:else}
                <input id="test-{f.valueId}" type="text" inputmode="decimal" bind:value={inputs[f.valueId]} class="{inputClass} {isPrimary ? '' : 'max-w-[12rem]'}" />
              {/if}
            </div>
          {/each}
        </div>
        {#if props.mode === 'plan'}<p class="text-caption text-content-subtle px-1">Fill in what is set beforehand (a weight to test at, the reps, the edge) and leave empty what the test is to find; the result is entered during the session.</p>{/if}
      {/if}

      <div class="space-y-1">
        <label for="test-notes" class="text-label text-content-subtle ml-1">{props.mode === 'plan' ? 'Note for the session (optional)' : 'Notes'}</label>
        <textarea id="test-notes" bind:value={notes} class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm h-20"></textarea>
      </div>
    {/if}

    {#if error}<p class="text-caption text-danger">{error}</p>{/if}

    <button
      onclick={props.mode === 'plan' ? savePlan : saveResult}
      disabled={!type}
      class="w-full py-3.5 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.99] disabled:opacity-40"
    >
      {props.mode === 'plan' ? (existing ? 'Save' : 'Add to session') : recorded ? 'Update the result' : 'Save the result'}
    </button>
  </div>
</div>
