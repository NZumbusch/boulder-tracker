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
  import { tick } from 'svelte';
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
  /** Each metric in its Analytics Recovery-chart colour, so HRV is blue everywhere. */
  const METRIC_COLOR: Record<string, string> = {
    hrv: 'var(--color-primary)',
    'sleep-score': 'var(--color-tertiary)',
    rhr: 'var(--color-warning)',
  };
  /** A line-and-dots sparkline in a 0-100 box, min/max scaled. */
  function sparkPath(values: number[]): { line: string; dots: string } {
    const min = Math.min(...values);
    const range = Math.max(Math.max(...values) - min, 0.0001);
    const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * 100},${90 - ((v - min) / range) * 80}`);
    return { line: `M ${pts.join(' L ')}`, dots: pts.map((p) => `M ${p} h 0`).join(' ') };
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
  // The "Morning metrics" shortcut: straight into today's first missing reading, keyboard up.
  let cardEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (trainingState.uiStore.homeRequest !== 'metrics') return;
    trainingState.uiStore.homeRequest = null;
    const target = QUICK_METRICS.find((d) => !todaysMetric(d.id)) ?? QUICK_METRICS[0];
    if (!target) return;
    startEdit(target.id);
    void tick().then(() => {
      cardEl?.scrollIntoView({ block: 'center' });
      cardEl?.querySelector('input')?.focus();
    });
  });

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

<div class="card space-y-1" bind:this={cardEl}>
  <SectionHeader label="Metrics" subtitle={`Sleep, HRV, resting heart rate${trainingState.homeDetails['metrics.bodyweight'] ? ', bodyweight' : ''}`} />
  <div class="divide-y divide-border">
  {#each QUICK_METRICS as def}
    {@const entry = todaysMetric(def.id)}
    {@const own = entriesFor(def.id).slice(-7)}
    <!-- The Sleep row falls back to hours asleep (Health Connect) for its sparkline when no scores are logged. -->
    {@const spark = def.id === 'sleep-score' && own.length < 2 ? entriesFor('sleep-duration').slice(-7) : own}
    <div class="flex items-center justify-between gap-3 py-2.5">
      <div class="min-w-0">
        <p class="text-caption text-content-muted">{def.name}</p>
        {#if editingMetricId === def.id}
          <form onsubmit={(e) => { e.preventDefault(); saveMetric(def.id); }} class="flex items-center gap-2 mt-1">
            <input type="number" step="0.1" bind:value={draftValue} class="w-20 bg-surface-elevated text-content p-1.5 rounded-control border border-border-strong outline-none text-sm" />
            <button type="submit" class="p-1.5 bg-primary hover:bg-primary-hover text-white rounded-control"><Icon icon="ic:baseline-check" class="text-sm" /></button>
            <button type="button" onclick={() => editingMetricId = null} class="p-1.5 text-content-subtle hover:text-content"><Icon icon="ic:baseline-close" class="text-sm" /></button>
          </form>
        {:else}
          <button onclick={() => startEdit(def.id)} class="tabular-nums transition-colors {entry ? 'text-body font-semibold text-content hover:text-primary' : 'text-label text-primary hover:text-primary-hover'}">
            {entry ? metricText(def.id, entry.value, def.unit) : '+ Log today'}
          </button>
        {/if}
        {#if def.id === 'hrv' && hrvDelta !== undefined && hrvBaseline !== undefined && trainingState.homeDetails['metrics.hrvBaseline']}
          <p class="text-caption tabular-nums {hrvDelta < -trainingState.readinessConfig.hrvDip ? 'text-status-caution' : 'text-content-subtle'}">
            {hrvDelta >= 0 ? '+' : '−'}{Math.abs(Math.round(hrvDelta * 100))}% vs 14-day baseline ({Math.round(hrvBaseline)})
          </p>
        {:else if def.id === 'sleep-score' && todaysMetric('sleep-duration')}
          {@const naps = todaysMetric('nap-duration')?.value}
          <p class="text-caption text-content-subtle tabular-nums">
            {todaysMetric('sleep-duration')!.value.toFixed(1)} h asleep{naps ? ` · +${naps.toFixed(1)} h nap` : ''}
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
        {@const path = sparkPath(spark.map((v) => v.value))}
        {@const color = METRIC_COLOR[def.id] ?? 'var(--color-content-muted)'}
        <svg class="w-20 h-8 shrink-0 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={path.line} fill="none" stroke={color} stroke-opacity="0.6" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          <path d={path.dots} fill="none" stroke={color} stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        </svg>
      {/if}
    </div>
  {/each}
  </div>
</div>
