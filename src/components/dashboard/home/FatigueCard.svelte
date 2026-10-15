<script lang="ts">
  /** Current fatigue per axis - bars by default, a radar chart as the Appearance alternative. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { RATING_AXES, FATIGUE_AXIS_COLORS } from '../../../lib/constants';
  import FatigueRadarChart from '../../common/FatigueRadarChart.svelte';
  import SectionHeader from './SectionHeader.svelte';

  let { data }: { data: HomeData } = $props();
  const fatigueDecay = $derived(data.fatigueDecay);
  /** From here an area still needs rest - the same line the Analytics fatigue chart shades (FatiguePanel). */
  const HIGH = 7;
  const radarLabel = $derived(
    `Fatigue now, 0 to 10: ${RATING_AXES.map((a) => `${a.label} ${fatigueDecay[a.key] !== undefined ? fatigueDecay[a.key]!.toFixed(1) : 'no data'}`).join(', ')}`,
  );
</script>

<div class="card space-y-3">
  <SectionHeader label="Fatigue" subtitle="How much each area still carries from recent sessions, out of 10" info="fatigue" />
  {#if trainingState.fatigueChartStyle === 'radar'}
    <div role="img" aria-label={radarLabel}>
      <FatigueRadarChart fingers={fatigueDecay.fingers} arms={fatigueDecay.arms} core={fatigueDecay.core} systemic={fatigueDecay.systemic} />
    </div>
  {:else}
    <!-- One slim bar per area, in the area's own colour (the same as in
         Analytics), on a 0-10 track. -->
    {#each RATING_AXES as bar}
      {@const value = fatigueDecay[bar.key]}
      <div class="space-y-1">
        <div class="flex justify-between items-baseline text-caption">
          <span class="text-content-muted">{bar.label}</span>
          <span class="tabular-nums font-semibold {value !== undefined && value >= HIGH ? 'text-status-caution' : 'text-content'}">{value !== undefined ? value.toFixed(1) : '—'}<span class="text-content-subtle font-normal">{' / 10'}</span>{#if value !== undefined && value >= HIGH}<span class="font-semibold"> · high</span>{/if}</span>
        </div>
        <div class="relative h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-[width] duration-500" style="width: {value !== undefined ? value * 10 : 0}%; background: {FATIGUE_AXIS_COLORS[bar.key]}"></div>
          <div class="absolute inset-y-0 w-px bg-content-subtle" style="left: {HIGH * 10}%" aria-hidden="true"></div>
        </div>
      </div>
    {/each}
  {/if}
  {#if trainingState.fatigueChartStyle !== 'radar'}
    <p class="text-caption text-content-subtle flex items-center gap-1.5"><span class="w-px h-3 bg-content-subtle inline-block" aria-hidden="true"></span>{HIGH} and above: that area still needs rest</p>
  {/if}
  {#if fatigueDecay.coverage.total > 0 && fatigueDecay.coverage.arms < fatigueDecay.coverage.total}
    <p class="text-caption text-content-subtle">Arms rated on {fatigueDecay.coverage.arms} of {fatigueDecay.coverage.total} sessions</p>
  {/if}
</div>
