<script lang="ts">
  /**
   * BenchmarkForm - log (or edit) one benchmark result.
   *
   * Asks for what the chosen test records (`BenchmarkTypeDef.fields`): its
   * result and the conditions it was done under, each in its own unit
   * (weights in the chosen weight unit, stored in kg). A new result starts
   * from the conditions of the last one of the same test - the same edge as
   * last time is one tap fewer.
   */
  import { untrack } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId, showAlert } from '../../lib/utils';
  import type { Benchmark, BenchmarkTypeDef } from '../../lib/types';
  import { askedFields, conditionFields, formatFieldValue, fromShown, groupTypes, primaryField, resolveFields, resultValues, toShown, unitLabel, type ResolvedField } from '../../lib/benchmarks/model';
  import Icon from "@iconify/svelte";

  // --- Props ---
  let {
    initialData = null,
    weekId = '',
    onSave = () => {},
    onCancel = () => {}
  } = $props<{
    /** Pre-existing benchmark data if editing an existing entry */
    initialData?: Benchmark | null,
    /** The macrocycle week this benchmark belongs to */
    weekId?: string,
    /** Callback fired after a successful save */
    onSave?: () => void,
    /** Callback fired when the user cancels the form */
    onCancel?: () => void
  }>();

  // --- Local State ---
  let id = $state(generateId());
  let typeId = $state('');
  let date = $state(new Date().toISOString());
  let notes = $state('');
  /** What was typed, by value-type id (numbers as text, so a half-typed "4." survives). */
  let inputs = $state<Record<string, string>>({});
  let showProtocol = $state(false);

  const weightUnit = $derived(trainingState.units.weight);
  const defs = $derived(trainingState.valueDefs);
  const types = $derived(trainingState.benchmarkTypes);
  /** Offered for new results: not archived (the one being edited stays, whatever it is). */
  const offered = $derived(types.filter((t) => !t.archived || t.id === typeId));
  const groups = $derived(groupTypes(offered));
  const type = $derived<BenchmarkTypeDef | undefined>(types.find((t) => t.id === typeId));
  const fields = $derived<ResolvedField[]>(type ? resolveFields(type, defs) : []);
  const asked = $derived(askedFields(fields));
  const primary = $derived(primaryField(fields));

  const textOf = (field: ResolvedField, value: number | string | undefined): string =>
    value === undefined ? '' : typeof value === 'string' ? value : String(toShown(field, value, weightUnit));

  /** The inputs for `fields`: from a stored result, else the last result of this test's conditions, else empty. */
  function fill(source: Benchmark | undefined, onlyConditions: boolean) {
    const next: Record<string, string> = {};
    if (source) {
      const values = resultValues(source, fields);
      for (const f of asked) {
        if (onlyConditions && f.role !== 'condition') continue;
        next[f.valueId] = textOf(f, values[f.valueId]);
      }
    }
    inputs = next;
  }
  const lastOf = (tid: string) =>
    trainingState.benchmarks.filter((b) => b.typeId === tid).sort((a, b) => b.date.localeCompare(a.date))[0];

  // --- Lifecycle & Sync ---
  $effect(() => {
    const editing = initialData;
    const week = weekId;
    const available = types.length;
    untrack(() => {
      if (editing) {
        // Hydrate form for editing
        id = editing.id;
        typeId = editing.typeId;
        date = editing.date;
        notes = editing.notes ?? '';
        fill(editing, false);
      } else if (week && !typeId && available > 0) {
        // Initialize new form on the first test on offer
        const first = types.find((t) => !t.archived) ?? types[0];
        typeId = first.id;
        fill(lastOf(first.id), true);
      }
    });
  });

  // --- Handlers ---

  /** Another test: its conditions start from the last time it was done. */
  function handleTypeChange(e: Event) {
    typeId = (e.target as HTMLSelectElement).value;
    fill(lastOf(typeId), true);
    showProtocol = false;
  }

  function parse(text: string | undefined): number | undefined {
    const t = (text ?? '').trim().replace(',', '.');
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Validates and commits the benchmark to the global state.
   */
  async function handleSubmit() {
    if (!type || !primary) {
      await showAlert('Validation Error', 'Please select a benchmark type.');
      return;
    }
    const values: Record<string, number | string> = {};
    for (const f of fields) {
      if (f.fixed !== undefined) {
        values[f.valueId] = f.fixed;
        continue;
      }
      const raw = inputs[f.valueId];
      if (f.kind === 'choice') {
        if (raw) values[f.valueId] = raw;
        continue;
      }
      const n = parse(raw);
      if (n === undefined) continue;
      values[f.valueId] = fromShown(f, n, weightUnit);
    }
    const value = values[primary.valueId];
    if (typeof value !== 'number') {
      await showAlert('Validation Error', `Enter the ${primary.label.toLowerCase()}.`);
      return;
    }
    const result: Benchmark = {
      id,
      typeId: type.id,
      type: type.name,
      value,
      unit: type.unit,
      date,
      weekId: initialData?.weekId ?? weekId,
      notes: notes.trim() || undefined,
      values,
    };
    await trainingState.saveBenchmark(result);
    onSave();
  }

  const inputClass = 'w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm';
  const fixedConditions = $derived(conditionFields(fields).filter((f) => f.fixed !== undefined));
</script>

<!-- UI Structure -->
<div class="space-y-4 p-5 bg-surface/80 rounded-card border border-border animate-in zoom-in-95 shadow-2xl">
  <div class="flex items-center justify-between px-1">
    <h3 class="text-title text-content">Benchmark Test</h3>
    <button onclick={onCancel} class="text-content-subtle hover:text-content transition-colors" aria-label="Close">
      <Icon icon="ic:baseline-close" />
    </button>
  </div>

  <div class="space-y-3">
    <div class="space-y-1">
      <label for="benchmark-type" class="text-label text-content-subtle ml-1">Test</label>
      <select
        id="benchmark-type"
        value={typeId}
        onchange={handleTypeChange}
        class="{inputClass} appearance-none"
      >
        <option value="" disabled>Select a test</option>
        {#each groups as g (g.group)}
          {#if g.group && groups.length > 1}
            <optgroup label={g.group}>
              {#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
            </optgroup>
          {:else}
            {#each g.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          {/if}
        {/each}
      </select>
    </div>

    {#if type?.protocol}
      <button onclick={() => (showProtocol = !showProtocol)} class="w-full text-left px-1 text-caption text-content-subtle hover:text-content transition-colors">
        <span class="flex items-center gap-1 font-bold"><Icon icon={showProtocol ? 'ic:baseline-expand-more' : 'ic:baseline-chevron-right'} class="text-sm" /> How to do it</span>
        {#if showProtocol}<span class="block mt-1 whitespace-pre-wrap break-words text-content-muted">{type.protocol}</span>{/if}
      </button>
    {/if}

    {#if type}
      <div class="grid grid-cols-2 gap-3">
        {#each asked as f (f.valueId)}
          {@const isPrimary = primary?.valueId === f.valueId}
          <div class="space-y-1 {isPrimary || asked.length === 1 ? 'col-span-2' : ''}">
            <label for="benchmark-{f.valueId}" class="text-label text-content-subtle ml-1">
              {f.label}{#if f.role === 'condition'}<span class="text-content-subtle/70"> · condition</span>{/if}{#if unitLabel(f, weightUnit)}<span class="text-content-subtle/70"> ({unitLabel(f, weightUnit)})</span>{/if}
            </label>
            {#if f.kind === 'choice'}
              <select id="benchmark-{f.valueId}" bind:value={inputs[f.valueId]} class="{inputClass} appearance-none">
                <option value="">–</option>
                {#each f.options as o}<option value={o}>{o}</option>{/each}
              </select>
            {:else}
              <input id="benchmark-{f.valueId}" type="text" inputmode="decimal" bind:value={inputs[f.valueId]} class={inputClass} />
            {/if}
          </div>
        {/each}
      </div>
      {#if fixedConditions.length}
        <p class="text-caption text-content-subtle px-1">{fixedConditions.map((f) => `${f.label} ${formatFieldValue(f, f.fixed, weightUnit)}`).join(' · ')}</p>
      {/if}
    {/if}

    <div class="space-y-1">
      <label for="benchmark-notes" class="text-label text-content-subtle ml-1">Notes</label>
      <textarea
        id="benchmark-notes"
        bind:value={notes}
        class="w-full bg-surface-elevated text-content p-3 rounded-control border border-border-strong outline-none text-sm h-20"
      ></textarea>
    </div>
  </div>

  <button
    onclick={handleSubmit}
    class="w-full py-3.5 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-control transition-all shadow-lg active:scale-95"
  >
    Save Benchmark
  </button>
</div>
