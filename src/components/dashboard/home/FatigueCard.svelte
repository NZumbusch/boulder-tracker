<script lang="ts">
  /** Current fatigue per axis - bars by default, a radar chart as the Appearance alternative. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { RATING_AXES, FATIGUE_AXIS_COLORS } from '../../../lib/constants';
  import FatigueRadarChart from '../../common/FatigueRadarChart.svelte';
  import SectionHeader from './SectionHeader.svelte';

  let { data }: { data: HomeData } = $props();
  const fatigueDecay = $derived(data.fatigueDecay);
</script>

<div class="card space-y-3">
  <SectionHeader label="Fatigue" subtitle="Now, per area · recent sessions added up, fading as you rest" info="fatigue" />
  {#if trainingState.fatigueChartStyle === 'radar'}
    <FatigueRadarChart fingers={fatigueDecay.fingers} arms={fatigueDecay.arms} core={fatigueDecay.core} systemic={fatigueDecay.systemic} />
  {:else}
    <!-- One slim bar per area, in the area's own colour (the same as in
         Analytics), on a 0-10 track. -->
    {#each RATING_AXES as bar}
      {@const value = fatigueDecay[bar.key]}
      <div class="space-y-1">
        <div class="flex justify-between items-baseline text-caption">
          <span class="text-content-muted">{bar.label}</span>
          <span class="tabular-nums text-content font-semibold">{value !== undefined ? value.toFixed(1) : '—'}<span class="text-content-subtle font-normal">{' / 10'}</span></span>
        </div>
        <div class="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-[width] duration-500" style="width: {value !== undefined ? value * 10 : 0}%; background: {FATIGUE_AXIS_COLORS[bar.key]}"></div>
        </div>
      </div>
    {/each}
  {/if}
  {#if fatigueDecay.coverage.total > 0 && fatigueDecay.coverage.arms < fatigueDecay.coverage.total}
    <p class="text-caption text-content-subtle/70">Arms rated on {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
  {/if}
</div>
