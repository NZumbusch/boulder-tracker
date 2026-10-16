<script lang="ts">
  import { edgeFade } from '../../lib/ui/edgeFade';
  /**
   * The "Adjust" controls of the test chart: what is plotted, which results
   * count (a filter per field), one line per value of a field, and every
   * result or the best/average per week, month or value. Edits the view it is
   * given; saving is the parent's. Values are typed and shown in the chosen
   * weight unit and kept as stored (kg).
   */
  import type { Benchmark, BenchmarkFieldFilter, BenchmarkView } from '../../lib/types';
  import type { WeightUnit } from '../../lib/units';
  import { formatFieldValue, fromShown, resultValues, toShown, unitLabel, type ResolvedField } from '../../lib/benchmarks/model';
  import { distinctValues, varyingFields } from '../../lib/benchmarks/views';
  import type { Metric } from '../../lib/benchmarks/series';

  let { view = $bindable(), fields, results, metrics, weight }: {
    view: BenchmarkView;
    fields: ResolvedField[];
    /** All of the test's results - the values to offer come from these. */
    results: Benchmark[];
    metrics: Metric[];
    weight: WeightUnit;
  } = $props();

  const MAX_VALUE_CHIPS = 8;
  const varying = $derived(varyingFields(results, fields));
  /** What is plotted up the chart is not something to filter by. */
  const filterable = $derived(varying.filter((f) => f.valueId !== (view.y ?? metrics[0]?.id)));
  const splittable = $derived(varying);
  const overDate = $derived(!view.x);

  function setFilter(id: string, filter: BenchmarkFieldFilter | undefined) {
    const filters = { ...(view.filters ?? {}) };
    if (filter) filters[id] = filter;
    else delete filters[id];
    view.filters = Object.keys(filters).length ? filters : undefined;
  }

  const sameEq = (f: BenchmarkFieldFilter | undefined, v: number | string) => f?.op === 'eq' && f.value === v;
  /** Whether a field has results with no value or 0 - so "none" can match something. */
  const hasNone = (f: ResolvedField) => f.kind === 'number' && results.some((b) => {
    const v = resultValues(b, fields)[f.valueId];
    return v === undefined || v === 0;
  });

  // The range inputs, in shown units, kept while typing.
  let rangeText = $state<Record<string, { min: string; max: string }>>({});
  const parse = (t: string | undefined): number | undefined => {
    const n = Number((t ?? '').trim().replace(',', '.'));
    return (t ?? '').trim() !== '' && Number.isFinite(n) ? n : undefined;
  };
  function openRange(f: ResolvedField) {
    const cur = view.filters?.[f.valueId];
    const min = cur?.op === 'range' ? cur.min : undefined;
    const max = cur?.op === 'range' ? cur.max : undefined;
    rangeText[f.valueId] = { min: min === undefined ? '' : String(toShown(f, min, weight)), max: max === undefined ? '' : String(toShown(f, max, weight)) };
    setFilter(f.valueId, { op: 'range', min, max });
  }
  function editRange(f: ResolvedField) {
    const t = rangeText[f.valueId] ?? { min: '', max: '' };
    const min = parse(t.min);
    const max = parse(t.max);
    setFilter(f.valueId, { op: 'range', ...(min !== undefined ? { min: fromShown(f, min, weight) } : {}), ...(max !== undefined ? { max: fromShown(f, max, weight) } : {}) });
  }

  const chip = (on: boolean) =>
    `shrink-0 px-2.5 py-1 rounded-control border text-caption transition-colors whitespace-nowrap ${on ? 'border-primary bg-primary/15 text-content' : 'border-border text-content-subtle hover:text-content'}`;
  const selectClass = 'min-w-0 bg-surface-elevated text-content rounded-control border border-border-strong text-caption px-2 py-1 outline-none';
  const inputClass = 'w-16 bg-surface-elevated text-content rounded-control border border-border-strong text-caption px-2 py-1 outline-none tabular-nums';
</script>

<div class="space-y-3 rounded-control border border-border p-3" data-no-swipe>
  <!-- What is plotted. -->
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption text-content-subtle">
    <label class="flex items-center gap-1.5">Show
      <select class={selectClass} value={view.y ?? metrics[0]?.id ?? ''} onchange={(e) => (view.y = e.currentTarget.value)} aria-label="What to chart">
        {#each metrics as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
      </select>
    </label>
    <label class="flex items-center gap-1.5">across
      <select class={selectClass} value={view.x ?? ''} onchange={(e) => { view.x = e.currentTarget.value || undefined; if (!view.x && view.agg === 'each') view.agg = undefined; if (view.x && (view.agg === 'week' || view.agg === 'month')) view.agg = undefined; }} aria-label="Across">
        <option value="">Date</option>
        {#each metrics.filter((m) => m.id !== (view.y ?? metrics[0]?.id)) as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
      </select>
    </label>
    {#if overDate && !view.splitBy && metrics.length > 1}
      <label class="flex items-center gap-1.5">and
        <select class={selectClass} value={view.y2 ?? ''} onchange={(e) => (view.y2 = e.currentTarget.value || undefined)} aria-label="Second line">
          <option value="">–</option>
          {#each metrics.filter((m) => m.id !== (view.y ?? metrics[0]?.id)) as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  <!-- Which results count: a filter per field that varies. -->
  {#if filterable.length > 0}
    <div class="space-y-2">
      <p class="text-label text-content-subtle">Only results with</p>
      {#each filterable as f (f.valueId)}
        {@const cur = view.filters?.[f.valueId]}
        {@const values = distinctValues(results, f, fields)}
        <div class="space-y-1">
          <p class="text-caption text-content-muted">{f.label}{unitLabel(f, weight) ? ` (${unitLabel(f, weight)})` : ''}</p>
          <div use:edgeFade class="edge-fade-x flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 items-center">
            <button onclick={() => setFilter(f.valueId, undefined)} aria-pressed={!cur} class={chip(!cur)}>Any</button>
            {#if hasNone(f)}<button onclick={() => setFilter(f.valueId, { op: 'none' })} aria-pressed={cur?.op === 'none'} class={chip(cur?.op === 'none')}>None</button>{/if}
            {#if values.length <= MAX_VALUE_CHIPS}
              {#each values.filter((v) => !(hasNone(f) && v === 0)) as v (v)}
                <button onclick={() => setFilter(f.valueId, { op: 'eq', value: v })} aria-pressed={sameEq(cur, v)} class={chip(sameEq(cur, v))}>{formatFieldValue(f, v, weight)}</button>
              {/each}
            {/if}
            {#if f.kind === 'number'}
              <button onclick={() => openRange(f)} aria-pressed={cur?.op === 'range'} class={chip(cur?.op === 'range')}>Range</button>
            {/if}
          </div>
          {#if cur?.op === 'range'}
            <div class="flex items-center gap-1.5 text-caption text-content-subtle">
              <input class={inputClass} inputmode="decimal" placeholder="from" aria-label="{f.label} from" bind:value={rangeText[f.valueId].min} oninput={() => editRange(f)} />
              <span>to</span>
              <input class={inputClass} inputmode="decimal" placeholder="to" aria-label="{f.label} to" bind:value={rangeText[f.valueId].max} oninput={() => editRange(f)} />
              <span>{unitLabel(f, weight)}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- One line per value, and how many points. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-content-subtle">
    {#if splittable.length > 0}
      <label class="flex items-center gap-1.5">One line per
        <select class={selectClass} value={view.splitBy ?? ''} onchange={(e) => { view.splitBy = e.currentTarget.value || undefined; if (view.splitBy) view.y2 = undefined; }} aria-label="One line per">
          <option value="">– (a single line)</option>
          {#each splittable as f (f.valueId)}<option value={f.valueId}>{f.label}</option>{/each}
        </select>
      </label>
    {/if}
    <label class="flex items-center gap-1.5">Points
      <select class={selectClass} value={view.agg ?? 'all'} onchange={(e) => (view.agg = e.currentTarget.value === 'all' ? undefined : (e.currentTarget.value as NonNullable<BenchmarkView['agg']>))} aria-label="Points">
        <option value="all">Every result</option>
        {#if overDate}
          <option value="week">One per week</option>
          <option value="month">One per month</option>
        {:else}
          <option value="each">One per {metrics.find((m) => m.id === view.x)?.label.toLowerCase() ?? 'value'}</option>
        {/if}
      </select>
    </label>
    {#if view.agg && view.agg !== 'all'}
      <div class="flex bg-surface-elevated/50 p-0.5 rounded-control">
        <button onclick={() => (view.stat = undefined)} class="px-2 py-0.5 text-caption rounded-control {view.stat !== 'average' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">Best</button>
        <button onclick={() => (view.stat = 'average')} class="px-2 py-0.5 text-caption rounded-control {view.stat === 'average' ? 'bg-surface text-content shadow-sm' : 'text-content-subtle'}">Average</button>
      </div>
    {/if}
  </div>
</div>
