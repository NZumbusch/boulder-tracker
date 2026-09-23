<script lang="ts">
  /**
   * A look back at a week: sessions done against the plan, load against the
   * week before, time trained, the training mix, sends and pain. At the
   * weekend it's this week so far; on weekdays, last week (`recapWeekId`).
   */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { decrementWeekId } from '../../../lib/dateUtils';
  import { recapWeekId, buildWeekRecap } from '../../../lib/planning/weekRecap';
  import { formatMinutes } from '../../../lib/session/formatSession';
  import { joinParts, G } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const weekId = $derived(recapWeekId(data.asOf));
  const recap = $derived(buildWeekRecap({
    weekId,
    workouts: trainingState.getWorkoutsForWeek(weekId),
    prevWorkouts: trainingState.getWorkoutsForWeek(decrementWeekId(weekId)),
    ascents: trainingState.outdoorAscents,
    painLogs: trainingState.painLogs,
    exerciseTypes: trainingState.exerciseTypes,
    analyticsCategories: trainingState.analyticsCategories,
    asOf: data.asOf,
  }));
  const loadChange = $derived(recap.prevLoad > 0 ? (recap.load - recap.prevLoad) / recap.prevLoad : undefined);
  const mixTotal = $derived(recap.mix.reduce((sum, m) => sum + m.minutes, 0));
  const categoryColor = (name: string) => trainingState.analyticsCategories.find((c) => c.name === name)?.color ?? 'bg-primary';
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
  <SectionHeader icon="ic:baseline-event-note" label="Week Recap"
    subtitle={recap.isCurrentWeek ? `This week so far · W${weekId.split('-W')[1]}` : `Last week · W${weekId.split('-W')[1]}`} />

  {#if recap.planned === 0 && recap.sends.length === 0}
    <p class="text-caption text-content-subtle italic">Nothing planned or logged that week.</p>
  {:else}
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-body text-content">
        <span class="text-metric tabular-nums">{recap.done}</span>
        <span class="text-content-subtle">of {recap.planned} session{recap.planned === 1 ? '' : 's'} done</span>
      </p>
      {#if recap.missed || recap.skipped}
        <span class="text-caption text-content-subtle shrink-0">{joinParts(recap.missed > 0 && `${recap.missed} missed`, recap.skipped > 0 && `${recap.skipped} skipped`)}</span>
      {/if}
    </div>

    {#if recap.done > 0}
      <p class="text-caption text-content-subtle tabular-nums flex items-center gap-1.5">
        <span>{joinParts(`load ${Math.round(recap.load)}`, recap.minutes > 0 && formatMinutes(recap.minutes))}</span>
        {#if trainingState.homeDetails['weekRecap.compare'] && loadChange !== undefined && Math.abs(loadChange) >= 0.05}
          <span class="flex items-center text-content-muted">
            <Icon icon={loadChange > 0 ? 'ic:baseline-arrow-upward' : 'ic:baseline-arrow-downward'} class="text-xs" />
            {Math.abs(Math.round(loadChange * 100))}% vs the week before
          </span>
        {/if}
      </p>
    {/if}

    {#if trainingState.homeDetails['weekRecap.mix'] && mixTotal > 0}
      <div class="space-y-1.5">
        <div class="flex h-2 rounded-control overflow-hidden gap-px" aria-hidden="true">
          {#each recap.mix as m}
            <div class={categoryColor(m.name)} style="width: {(m.minutes / mixTotal) * 100}%"></div>
          {/each}
        </div>
        <p class="text-caption text-content-subtle">
          {recap.mix.slice(0, 3).map((m) => `${m.name} ${formatMinutes(m.minutes)}`).join(' · ')}{recap.mix.length > 3 ? ` · +${recap.mix.length - 3} more` : ''}
        </p>
      </div>
    {/if}

    {#if trainingState.homeDetails['weekRecap.sends'] && (recap.sends.length > 0 || recap.painEntries > 0)}
      <div class="pt-2 border-t border-border/60 space-y-1">
        {#if recap.sends.length > 0}
          <p class="text-caption text-content-muted flex items-center gap-1.5">
            <Icon icon="ic:baseline-terrain" class="text-sm text-primary shrink-0" />
            {recap.sends.length} send{recap.sends.length === 1 ? '' : 's'}{recap.hardest ? ` · hardest ${G(recap.hardest.grade)}${recap.hardest.name ? ` (${recap.hardest.name})` : ''}` : ''}
          </p>
        {/if}
        {#if recap.painEntries > 0}
          <p class="text-caption text-content-muted flex items-center gap-1.5">
            <Icon icon="ic:baseline-healing" class="text-sm text-status-caution shrink-0" />
            {recap.painEntries} pain entr{recap.painEntries === 1 ? 'y' : 'ies'}
          </p>
        {/if}
      </div>
    {/if}
  {/if}
</div>
