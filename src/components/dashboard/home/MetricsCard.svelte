<script lang="ts">
  /** Daily metrics quick-entry (well-known ids only): today's value, a 7-day sparkline, HRV vs baseline and the bodyweight trend. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import type { DailyMetricEntry } from '../../../lib/types';
  import { DEFAULT_METRIC_DEFS, BODYWEIGHT_METRIC_ID } from '../../../lib/constants';
  import { generateId } from '../../../lib/utils';
  import { isLoggedMetricValue, loggedMetrics, averageReading } from '../../../lib/analytics/metricValues';
  import { displayWeight, toKg } from '../../../lib/units';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const hrvBaseline = $derived(data.hrvBaseline);
  const todaysMetric = (metricId: string) => data.todaysMetric(metricId);
  const QUICK_METRICS = $derived(
    DEFAULT_METRIC_DEFS.filter((d) =>
      ['sleep-score', 'hrv', 'rhr'].includes(d.id) || (d.id === BODYWEIGHT_METRIC_ID && trainingState.homeDetails['metrics.bodyweight']),
    ),
  );
  /** Today's HRV against its 14-day baseline, as a signed fraction (−0.1 = 10% below). */
  const hrvDelta = $derived.by(() => {
    const today = todaysMetric('hrv')?.value;
    if (today === undefined || hrvBaseline === undefined || hrvBaseline <= 0) return undefined;
    return (today - hrvBaseline) / hrvBaseline;
  });
  const bodyweightAvg = $derived(averageReading(trainingState.dailyMetrics, BODYWEIGHT_METRIC_ID, data.asOf));
  const bodyweightPrevAvg = $derived(averageReading(trainingState.dailyMetrics, BODYWEIGHT_METRIC_ID, data.asOf, 7, 7));
  let editingMetricId = $state<string | null>(null);
  let draftValue = $state('');

  function entriesFor(metricId: string): DailyMetricEntry[] {
    return loggedMetrics(trainingState.dailyMetrics).filter((m) => m.metricId === metricId).slice().sort((a, b) => a.date.localeCompare(b.date));
  }
  function sparkHeightPercent(value: number, values: number[]): number {
    if (values.length === 0) return 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 50;
    return 10 + ((value - min) / (max - min)) * 80;
  }
  // Bodyweight is stored in kg and shown/typed in the chosen weight unit.
  const isWeight = (metricId: string) => metricId === BODYWEIGHT_METRIC_ID;
  const W = (kg: number) => Math.round(displayWeight(kg, trainingState.units.weight) * 10) / 10;
  function metricText(metricId: string, value: number, unit: string): string {
    return isWeight(metricId) ? `${W(value)} ${trainingState.units.weight}` : `${value} ${unit}`;
  }
  function startEdit(metricId: string) {
    editingMetricId = metricId;
    const current = todaysMetric(metricId)?.value;
    draftValue = current === undefined ? '' : String(isWeight(metricId) ? W(current) : current);
  }
  async function saveMetric(metricId: string) {
    const typed = parseFloat(draftValue);
    if (Number.isNaN(typed)) return;
    const value = isWeight(metricId) && typed > 0 ? Math.round(toKg(typed, trainingState.units.weight) * 100) / 100 : typed;
    const existing = data.todaysEntry(metricId);
    // 0 (or less) means "I have no reading today" - it clears the day rather
    // than storing a value every baseline and chart would have to skip.
    if (!isLoggedMetricValue(value)) {
      if (existing) await trainingState.deleteDailyMetric(existing.id);
      editingMetricId = null;
      return;
    }
    const def = DEFAULT_METRIC_DEFS.find((d) => d.id === metricId)!;
    await trainingState.saveDailyMetric({ id: existing?.id ?? generateId(), metricId, date: data.todayIso, value }, def);
    editingMetricId = null;
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
  <SectionHeader icon="ic:baseline-favorite" label="Metrics" subtitle={`Sleep, HRV, resting heart rate${trainingState.homeDetails['metrics.bodyweight'] ? ', bodyweight' : ''}`} />
  {#each QUICK_METRICS as def}
    {@const entry = todaysMetric(def.id)}
    {@const spark = entriesFor(def.id).slice(-7)}
    <div class="flex items-center justify-between gap-3 p-2.5 bg-surface-elevated/40 rounded-control border border-border-strong/30">
      <div class="min-w-0">
        <p class="text-label text-content-subtle">{def.name}</p>
        {#if editingMetricId === def.id}
          <form onsubmit={(e) => { e.preventDefault(); saveMetric(def.id); }} class="flex items-center gap-2 mt-1">
            <input type="number" step="0.1" bind:value={draftValue} class="w-20 bg-surface-elevated text-content p-1.5 rounded-control border border-border-strong outline-none text-sm" />
            <button type="submit" class="p-1.5 bg-primary hover:bg-primary-hover text-white rounded-control"><Icon icon="ic:baseline-check" class="text-sm" /></button>
            <button type="button" onclick={() => editingMetricId = null} class="p-1.5 text-content-subtle hover:text-content"><Icon icon="ic:baseline-close" class="text-sm" /></button>
          </form>
        {:else}
          <button onclick={() => startEdit(def.id)} class="text-body text-content tabular-nums hover:text-primary transition-colors">
            {entry ? metricText(def.id, entry.value, def.unit) : 'Log'}
          </button>
        {/if}
        {#if def.id === 'hrv' && hrvDelta !== undefined && hrvBaseline !== undefined && trainingState.homeDetails['metrics.hrvBaseline']}
          <p class="text-caption tabular-nums {hrvDelta < -trainingState.readinessConfig.hrvDip ? 'text-status-caution' : 'text-content-subtle'}">
            {hrvDelta >= 0 ? '+' : '−'}{Math.abs(Math.round(hrvDelta * 100))}% vs 14-day baseline ({Math.round(hrvBaseline)})
          </p>
        {:else if def.id === BODYWEIGHT_METRIC_ID && bodyweightAvg !== undefined}
          {@const diff = bodyweightPrevAvg !== undefined ? bodyweightAvg - bodyweightPrevAvg : undefined}
          <p class="text-caption text-content-subtle tabular-nums flex items-center gap-1">
            7-day avg {W(bodyweightAvg).toFixed(1)}
            {#if diff !== undefined && Math.abs(diff) >= 0.1}
              <Icon icon={diff > 0 ? 'ic:baseline-arrow-upward' : 'ic:baseline-arrow-downward'} class="text-xs" />
              <span>{Math.abs(W(Math.abs(diff))).toFixed(1)}</span>
            {/if}
          </p>
        {/if}
      </div>
      {#if spark.length > 1 && trainingState.homeDetails['metrics.sparklines']}
        <div class="h-8 flex items-end gap-0.5 shrink-0">
          {#each spark as s}
            <div class="w-1.5 rounded-t-control bg-primary/50" style="height: {sparkHeightPercent(s.value, spark.map((v) => v.value))}%"></div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
