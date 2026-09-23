<script lang="ts">
  /** The current training block: name and phase, week position, load trend, what's next, and the block note. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { getWeekIdRange } from '../../../lib/dateUtils';
  import { nextBlock, daysUntilWeek, blockLoadTrend } from '../../../lib/planning/blockOutlook';
  import NoteSheet from '../../common/NoteSheet.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const currentWeekId = $derived(data.currentWeekId);
  const dominantBlock = $derived(data.dominantBlock);
  const currentPhaseName = $derived(data.currentPhaseName);
  const blockWeekPosition = $derived(data.blockWeekPosition);
  let noteOpen = $state(false);
  const upcomingBlock = $derived(nextBlock(trainingState.trainingBlocks, currentWeekId));
  const daysToNextBlock = $derived(upcomingBlock ? daysUntilWeek(upcomingBlock.startWeekId, data.todayIso) : undefined);
  const blockTrend = $derived(
    dominantBlock
      ? blockLoadTrend(getWeekIdRange(dominantBlock.startWeekId, dominantBlock.endWeekId), (id) => trainingState.getWorkoutsForWeek(id))
      : [],
  );
  const blockTrendMax = $derived(Math.max(1, ...blockTrend.map((b) => Math.max(b.planned, b.actual))));
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
  <SectionHeader icon="ic:baseline-view-week" label="Training Block"
  note={dominantBlock && trainingState.homeDetails['trainingBlock.note'] ? { has: !!dominantBlock.notes, open: () => noteOpen = true, what: 'block' } : undefined} />
  {#if dominantBlock}
    <p class="text-body text-content font-bold">{dominantBlock.name}{currentPhaseName ? ` · ${currentPhaseName}` : ''}</p>
    {#if blockWeekPosition}
      <div class="flex items-center gap-3">
        <span class="text-caption text-content-subtle shrink-0">Week {blockWeekPosition.week} of {blockWeekPosition.of}</span>
        <div class="flex gap-1 flex-1">
          {#each Array(blockWeekPosition.of) as _, i}
            <div class="flex-1 h-1.5 rounded-control {i < blockWeekPosition.week ? 'bg-primary' : 'bg-surface-elevated border border-border-strong/50'}"></div>
          {/each}
        </div>
      </div>
    {/if}
    {#if trainingState.homeDetails['trainingBlock.loadTrend'] && blockTrend.some((b) => b.planned > 0 || b.actual > 0)}
      <div class="flex items-end gap-1 h-10 pt-1" aria-label="Planned vs logged load per week of this block">
        {#each blockTrend as bar}
          {@const isCurrent = bar.weekId === currentWeekId}
          <div class="flex-1 h-full flex items-end relative" title="{bar.weekId}: {bar.actual} of {bar.planned}">
            <div class="absolute inset-x-0 bottom-0 rounded-t-control border border-dashed {isCurrent ? 'border-primary/60' : 'border-border-strong/60'}" style="height: {(bar.planned / blockTrendMax) * 100}%"></div>
            <div class="relative w-full rounded-t-control {isCurrent ? 'bg-primary' : 'bg-primary/50'}" style="height: {(bar.actual / blockTrendMax) * 100}%"></div>
          </div>
        {/each}
      </div>
      <p class="text-caption text-content-subtle">Weekly load: logged (filled) vs planned (outline)</p>
    {/if}
  {:else}
    <p class="text-caption text-content-subtle italic">No training block covers this week.</p>
  {/if}
  {#if upcomingBlock && daysToNextBlock !== undefined && trainingState.homeDetails['trainingBlock.next']}
    {@const nextPhase = trainingState.phaseDefs.find((p) => p.id === upcomingBlock.phaseId)?.name}
    <p class="text-caption text-content-subtle flex items-center gap-1 pt-1">
      <Icon icon="ic:baseline-arrow-forward" class="text-xs shrink-0" />
      <span class="truncate">Next: <span class="text-content-muted">{upcomingBlock.name}{nextPhase && nextPhase !== upcomingBlock.name ? ` · ${nextPhase}` : ''}</span> · {daysToNextBlock === 0 ? 'this week' : `in ${daysToNextBlock} day${daysToNextBlock === 1 ? '' : 's'}`} ({upcomingBlock.startWeekId})</span>
    </p>
  {/if}
</div>

{#if noteOpen && dominantBlock}
  {@const block = dominantBlock}
  <NoteSheet
    title="{block.name} note"
    subtitle="{currentPhaseName ?? 'Training block'} · {block.startWeekId} – {block.endWeekId}"
    text={block.notes ?? ''}
    placeholder="What this block is for, how to progress it…"
    onSave={(text) => trainingState.saveBlockNotes(block.id, text)}
    onClose={() => noteOpen = false}
  />
{/if}
