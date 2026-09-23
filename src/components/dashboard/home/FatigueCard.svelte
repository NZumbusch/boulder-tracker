<script lang="ts">
  /** Current fatigue per axis - bars by default, a radar chart as the Appearance alternative. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { RATING_AXES } from '../../../lib/constants';
  import FatigueRadarChart from '../../common/FatigueRadarChart.svelte';
  import SectionHeader from './SectionHeader.svelte';

  let { data }: { data: HomeData } = $props();
  const fatigueDecay = $derived(data.fatigueDecay);
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-4">
  <SectionHeader icon="ic:baseline-bolt" label="Fatigue" subtitle="Exponentially-decayed load, per axis" />
  {#if trainingState.fatigueChartStyle === 'radar'}
    <FatigueRadarChart fingers={fatigueDecay.fingers} arms={fatigueDecay.arms} core={fatigueDecay.core} systemic={fatigueDecay.systemic} />
  {:else}
    {#each RATING_AXES as bar}
      {@const value = fatigueDecay[bar.key]}
      <div class="space-y-1.5">
        <div class="flex justify-between text-label text-content-subtle">
          <span>{bar.label}</span>
          <span class="tabular-nums text-content">{value !== undefined ? value.toFixed(1) : '—'} <span class="text-content-subtle">/ 10</span></span>
        </div>
        <div class="flex gap-1 h-2.5">
          {#each Array(10) as _, i}
            <div class="flex-1 rounded-[2px] transition-colors duration-500 {value !== undefined && i < Math.round(value) ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
  {#if fatigueDecay.coverage.total > 0}
    <p class="text-caption text-content-subtle">Arms: {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
  {/if}
</div>
