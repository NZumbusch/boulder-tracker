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
  import { onMount, tick } from 'svelte';
  import Sheet from '../ui/Sheet.svelte';
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

  // Closing with something typed asks first.
  const signature = () => JSON.stringify([typeId, inputs, notes]);
  let baseline = $state<string | null>(null);
  onMount(() => { void tick().then(() => (baseline = signature())); });
  const dirty = $derived(baseline !== null && signature() !== baseline);

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

  const inputClass = 'field';
</script>

<Sheet title={props.mode === 'plan' ? (existing ? 'Edit the test' : 'Plan a test') : 'Record the result'} subtitle={props.mode === 'result' && type ? type.name : undefined} level="top" {dirty} discardMessage="What you entered will be lost." onClose={close}>
    {#if props.mode === 'plan'}
      <div class="space-y-1">
        <label for="test-pick" class="text-label text-content-subtle ml-1">Test</label>
        <select id="test-pick" bind:value={typeId} class={inputClass}>
          <option value="" disabled>Choose a test</option>
          {#each groups as g (g.group)}
            {#if g.group && groups.length > 1}
              <optgroup label={g.group}>{#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</optgroup>
            {:else}
              {#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            {/if}
          {/each}
        </select>
        {#if types.length === 0}<p class="text-label text-content-subtle px-1">There are no tests yet. Add one under Settings, Training setup, Tests.</p>{/if}
      </div>
    {/if}

    {#if type}
      <p class="text-caption text-content-subtle px-1">
        {#if last}Last done {weeksAgo === 0 ? 'this week' : `${weeksAgo} week${weeksAgo === 1 ? '' : 's'} ago`}: {resultText(last, type, defs, weight)}{:else}Never done yet.{/if}
      </p>
      {#if type.protocol}
        <button onclick={() => (showProtocol = !showProtocol)} class="w-full text-left px-1 min-h-11 text-label text-content-subtle hover:text-content transition-colors" aria-expanded={showProtocol}>
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
                {f.label}{#if props.mode === 'result' && props.slot.test?.conditions?.[f.valueId] !== undefined}<span class="text-content-faint">&nbsp;· planned</span>{/if}{#if unitLabel(f, weight)}<span class="text-content-faint">&nbsp;({unitLabel(f, weight)})</span>{/if}
              </label>
              {#if f.kind === 'choice'}
                <select id="test-{f.valueId}" bind:value={inputs[f.valueId]} class={inputClass}>
                  <option value="">–</option>
                  {#each f.options as o}<option value={o}>{o}</option>{/each}
                </select>
              {:else}
                <input id="test-{f.valueId}" type="text" inputmode="decimal" enterkeyhint="next" aria-invalid={isPrimary && error !== ''} bind:value={inputs[f.valueId]} class="{inputClass} {isPrimary ? '' : 'max-w-[12rem]'}" />
              {/if}
            </div>
          {/each}
        </div>
        {#if props.mode === 'plan'}<p class="text-caption text-content-subtle px-1">Fill in what is set beforehand (a weight to test at, the reps, the edge) and leave empty what the test is to find; the result is entered during the session.</p>{/if}
      {/if}

      <div class="space-y-1">
        <label for="test-notes" class="text-label text-content-subtle ml-1">{props.mode === 'plan' ? 'Note for the session (optional)' : 'Notes'}</label>
        <textarea id="test-notes" bind:value={notes} class="{inputClass} h-20 resize-y"></textarea>
      </div>
    {/if}

    {#snippet footer()}
      <div class="flex-1 min-w-0 space-y-2">
        {#if error}<p class="text-label text-danger" role="alert">{error}</p>{:else if !type}<p class="text-caption text-content-subtle" role="status">Choose a test to continue.</p>{/if}
        <button
          onclick={props.mode === 'plan' ? savePlan : saveResult}
          disabled={!type}
          class="btn btn-primary w-full"
        >
          {props.mode === 'plan' ? (existing ? 'Save' : 'Add to session') : recorded ? 'Update the result' : 'Save the result'}
        </button>
      </div>
    {/snippet}
</Sheet>
