<script lang="ts">
  /**
   * Bodyweight tracking. Uses the existing
   * MetricDef/DailyMetricEntry system - no new entity. One entry per date (upsert on save, keyed by date).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import { generateId } from '../../lib/utils';
  import { formatDate } from '../../lib/dateUtils';
  import { loggedMetrics } from '../../lib/analytics/metricValues';
  import { toKg, displayWeight, formatWeight } from '../../lib/units';
  import type { DailyMetricEntry } from '../../lib/types';
  import Icon from '@iconify/svelte';
  import { toast } from '../../lib/toast.svelte';

  function todayIso(): string {
    return trainingState.todayIso;
  }

  let date = $state(todayIso());
  let weight = $state<number | undefined>(undefined);
  /** The chart bar last tapped: its date and weight are read out below the chart. */
  let picked = $state<number | null>(null);

  const entries = $derived(
    trainingState.dailyMetrics
      .filter((m) => m.metricId === BODYWEIGHT_METRIC_ID)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  // The list below keeps every stored entry, zeros included, so one can be
  // found and deleted; "latest" and the chart only use real readings.
  const readings = $derived(loggedMetrics(entries));
  const latest = $derived(readings[0]);

  const chartEntries = $derived(readings.slice(0, 12).slice().reverse());
  const chartRange = $derived.by(() => {
    if (chartEntries.length === 0) return { min: 0, max: 0 };
    const values = chartEntries.map((e) => e.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  function barHeightPercent(value: number): number {
    const { min, max } = chartRange;
    if (max === min) return 50;
    return 10 + ((value - min) / (max - min)) * 80;
  }

  /** What the field can hold, in kg - anything else is a typo, and says so. */
  const MIN_KG = 20;
  const MAX_KG = 400;
  let weightError = $state('');

  async function handleSave() {
    if (!weight || weight <= 0) return;
    const kg = toKg(weight, trainingState.units.weight);
    if (kg < MIN_KG || kg > MAX_KG) {
      const unit = trainingState.units.weight;
      const range = `${Math.round(displayWeight(MIN_KG, unit))}-${Math.round(displayWeight(MAX_KG, unit))} ${unit}`;
      weightError = `That doesn't look like a bodyweight - it should be ${range}.`;
      return;
    }
    weightError = '';

    // Upsert by date - re-logging the same day updates it rather than
    // creating a second entry for that date.
    const existing = trainingState.dailyMetrics.find(
      (m) => m.metricId === BODYWEIGHT_METRIC_ID && m.date === date,
    );

    const entry: DailyMetricEntry = {
      id: existing?.id ?? generateId(),
      metricId: BODYWEIGHT_METRIC_ID,
      date,
      // Typed in the chosen unit, stored in kg.
      value: Math.round(toKg(weight, trainingState.units.weight) * 100) / 100,
    };

    await trainingState.saveDailyMetric(entry, { id: BODYWEIGHT_METRIC_ID, name: 'Bodyweight', unit: 'kg' });
    weight = undefined;
    picked = null;
    toast.show(`Bodyweight saved for ${formatDate(date)}`);
  }

  async function handleDelete(id: string) {
    picked = null;
    await trainingState.deleteDailyMetric(id);
  }
</script>

<div class="card space-y-4">
  <div class="px-1">
    <h3 class="text-section uppercase text-content-muted">Bodyweight</h3>
    <p class="text-caption text-content-subtle mt-0.5">
      {#if latest}Latest: {formatWeight(latest.value, trainingState.units.weight)} ({formatDate(latest.date)}){:else}No entries yet. Log your first weight below.{/if}
    </p>
  </div>

  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-3">
    <div class="grid grid-cols-2 gap-2">
      <label class="block space-y-1 min-w-0">
        <span class="text-label text-content-subtle ml-1">Date</span>
        <input id="bw-date" type="date" bind:value={date} max={todayIso()} class="field" />
      </label>
      <label class="block space-y-1 min-w-0">
        <span class="text-label text-content-subtle ml-1">Weight ({trainingState.units.weight})</span>
        <input id="bw-weight" type="number" inputmode="decimal" enterkeyhint="done" step="0.1" min="0" bind:value={weight} oninput={() => (weightError = '')} aria-invalid={weightError !== ''} aria-describedby={weightError ? 'bw-error' : undefined} placeholder={trainingState.units.weight === 'lb' ? '155' : '70.5'} class="field {weightError ? '!border-danger' : ''}" />
      </label>
    </div>
    {#if weightError}<p id="bw-error" class="text-caption text-danger px-1" role="alert">{weightError}</p>{/if}
    <div class="flex items-center gap-3">
      <button type="submit" disabled={!weight} class="btn btn-primary">
        <Icon icon="ic:baseline-add" class="text-lg" /> Log weight
      </button>
      {#if !weight}<span class="text-caption text-content-subtle" role="status">Enter a weight to log it.</span>{/if}
    </div>
  </form>

  {#if chartEntries.length > 1}
    <div class="space-y-1.5">
      <div class="flex gap-2">
        <div class="flex flex-col justify-between text-caption text-content-subtle tabular-nums py-1 shrink-0" aria-hidden="true">
          <span>{formatWeight(chartRange.max, trainingState.units.weight)}</span>
          <span>{formatWeight(chartRange.min, trainingState.units.weight)}</span>
        </div>
        <div class="h-28 flex-1 flex items-end justify-between" role="group" aria-label="Last {chartEntries.length} weigh-ins - tap a bar to read it">
          {#each chartEntries as e, i (e.id)}
            <button
              type="button"
              onclick={() => (picked = picked === i ? null : i)}
              aria-pressed={picked === i}
              aria-label="{formatDate(e.date)}: {formatWeight(e.value, trainingState.units.weight)}"
              class="flex-1 h-full flex flex-col items-center justify-end px-[3px]"
            >
              <span
                class="w-full rounded-t-lg transition-colors {picked === null || picked === i ? 'bg-primary' : 'bg-primary/35'}"
                style="height: {barHeightPercent(e.value)}%"
              ></span>
            </button>
          {/each}
        </div>
      </div>
      <p class="text-caption tabular-nums min-h-4 {picked !== null ? 'text-content' : 'text-content-subtle'}" aria-live="polite">
        {#if picked !== null && chartEntries[picked]}
          {formatDate(chartEntries[picked].date)} · {formatWeight(chartEntries[picked].value, trainingState.units.weight)}
        {:else}
          Tap a bar to read it.
        {/if}
      </p>
    </div>
  {/if}

  {#if entries.length > 0}
    <ul class="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-border">
      {#each entries as e (e.id)}
        <li class="flex items-center justify-between gap-2 pl-1">
          <span class="text-label text-content">{formatDate(e.date)}</span>
          <div class="flex items-center gap-1">
            <span class="text-label text-content-muted tabular-nums">{formatWeight(e.value, trainingState.units.weight)}</span>
            <button onclick={() => handleDelete(e.id)} class="btn-icon hover:text-danger" aria-label="Delete the entry for {formatDate(e.date)}">
              <Icon icon="ic:baseline-close" class="text-lg" />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
