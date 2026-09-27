<script lang="ts">
  /**
   * This week: the day strip, the week's load (rated, like everywhere else),
   * how much of the plan is done, ACWR, the training mix, and the week note.
   * Last week's look back is Week Recap.
   */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { weekDayStrip, type DayStatus } from '../../../lib/planning/weekStatus';
  import { WEEK_DAYS } from '../../../lib/constants';
  import NoteSheet from '../../common/NoteSheet.svelte';
  import { buildWeekRecap, planProgress } from '../../../lib/planning/weekRecap';
  import { decrementWeekId } from '../../../lib/dateUtils';
  import { formatMinutes } from '../../../lib/session/formatSession';
  import { joinParts } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const currentWeekId = $derived(data.currentWeekId);
  const acwr = $derived(data.acwr);
  const recap = $derived(buildWeekRecap({
    weekId: currentWeekId,
    workouts: data.weekWorkouts,
    prevWorkouts: trainingState.getWorkoutsForWeek(decrementWeekId(currentWeekId)),
    ascents: trainingState.outdoorAscents,
    painLogs: trainingState.painLogs,
    exerciseTypes: trainingState.exerciseTypes,
    analyticsCategories: trainingState.analyticsCategories,
    asOf: data.asOf,
  }));
  const progress = $derived(planProgress(data.weekWorkouts));
  const mixTotal = $derived(recap.mix.reduce((sum, m) => sum + m.minutes, 0));
  const categoryColor = (name: string) => trainingState.analyticsCategories.find((c) => c.name === name)?.color ?? 'bg-primary';
  const weekTripDays = $derived(data.weekTripDays);
  const weekNote = $derived(trainingState.getWeekNote(currentWeekId));
  let noteOpen = $state(false);
  const dayStrip = $derived(weekDayStrip(data.weekWorkouts, data.todayName));
  let peekDay = $state<number | null>(null);
  const DAY_MARK: Record<DayStatus, { icon: string; class: string; label: string }> = {
    done: { icon: 'ic:baseline-check', class: 'bg-success/15 text-success border-success/30', label: 'done' },
    missed: { icon: 'ic:baseline-close', class: 'bg-danger/10 text-danger border-danger/30', label: 'missed' },
    skipped: { icon: 'ic:baseline-remove', class: 'bg-surface-elevated text-content-subtle border-border-strong/50', label: 'skipped' },
    planned: { icon: 'ic:baseline-circle', class: 'bg-primary/10 text-primary border-primary/30', label: 'planned' },
    rest: { icon: '', class: 'bg-transparent text-content-subtle border-border/60', label: 'rest' },
  };
  // ACWR zones, from loadAnalytics' own thresholds.
  const acwrZone = $derived.by((): { label: string; class: string } | undefined => {
    if (!acwr.sufficient || acwr.ratio === undefined) return undefined;
    const r = acwr.ratio;
    const zones = trainingState.acwrZones;
    if (r > zones.highRisk) return { label: 'high risk', class: 'bg-status-risk/15 text-status-risk border-status-risk/30' };
    if (r > zones.caution) return { label: 'caution', class: 'bg-status-caution/15 text-status-caution border-status-caution/30' };
    if (r >= zones.sweetMin) return { label: 'sweet spot', class: 'bg-status-good/15 text-status-good border-status-good/30' };
    return { label: 'low', class: 'bg-surface-elevated text-content-muted border-border-strong/50' };
  });
</script>

<div class="card space-y-3">
  <SectionHeader label="This Week" subtitle="W{currentWeekId.split('-W')[1]}" info="load"
  note={trainingState.homeDetails['thisWeek.note'] ? { has: !!weekNote, open: () => noteOpen = true, what: 'week' } : undefined} />
  {#if trainingState.homeDetails['thisWeek.strip']}
    <div class="grid grid-cols-7 gap-1">
      {#each dayStrip as cell, i}
        {@const mark = DAY_MARK[cell.status]}
        <button
          onclick={() => peekDay = peekDay === i ? null : i}
          class="flex flex-col items-center gap-1 py-1 rounded-control {peekDay === i ? 'bg-surface-elevated/60' : ''}"
          aria-label="{cell.day}: {mark.label}{cell.sessions.length ? `, ${cell.sessions.join(', ')}` : ''}"
        >
          <span class="text-caption {cell.isToday ? 'text-primary font-bold' : 'text-content-subtle'}">{WEEK_DAYS[i].slice(0, 1)}</span>
          <span class="w-6 h-6 rounded-full border flex items-center justify-center {mark.class} {cell.isToday ? 'ring-2 ring-primary/50' : ''}">
            {#if mark.icon}<Icon icon={mark.icon} class={cell.status === 'planned' ? 'text-[8px]' : 'text-xs'} />{/if}
          </span>
          {#if weekTripDays[i] && trainingState.homeDetails['thisWeek.tripDays']}
            <Icon icon="ic:baseline-terrain" class="text-[10px] text-primary -mt-0.5" aria-label="Trip: {weekTripDays[i]!.name}" />
          {/if}
        </button>
      {/each}
    </div>
    {#if peekDay !== null}
      {@const cell = dayStrip[peekDay]}
      <p class="text-caption text-content-subtle">
        <span class="text-content-muted">{cell.day}:</span> {weekTripDays[peekDay] ? `${weekTripDays[peekDay]!.name} · ` : ''}{cell.sessions.length ? cell.sessions.join(' · ') : weekTripDays[peekDay] ? 'trip day' : 'rest day'}{cell.status === 'missed' ? ' (missed)' : cell.status === 'skipped' ? ' (skipped)' : ''}
      </p>
    {/if}
  {/if}
  <!-- The week's load is the rated session load, the same number History,
       Analytics and ACWR use. How much of the plan is done is a separate
       percentage, on the plan's own (exercise-based) scale. -->
  <div class="flex items-center justify-between gap-2 flex-wrap">
    <p class="text-body text-content tabular-nums">
      <span class="text-metric">{Math.round(recap.load)}</span>
      <span class="text-caption text-content-subtle">load pts{recap.minutes > 0 ? ` · ${formatMinutes(recap.minutes)}` : ''}</span>
    </p>
    {#if acwrZone && trainingState.homeDetails['thisWeek.acwr']}
      <span class="px-2 py-0.5 rounded-full border text-caption tabular-nums shrink-0 {acwrZone.class}" title="Acute:chronic workload ratio - last 7 days vs the 28-day average">ACWR {acwr.ratio!.toFixed(2)} · {acwrZone.label}</span>
    {:else if trainingState.homeDetails['thisWeek.acwr'] && acwr.insufficientReason}
      <!-- Said, not just hidden: ACWR needs a real 4-week baseline. -->
      <span class="text-caption text-content-subtle shrink-0" title="ACWR compares this week with the last four - it needs training logged in at least 3 of them">
        {acwr.insufficientReason === 'break' ? `ACWR after a break · ${acwr.activeWeeks}/3 weeks` : 'ACWR from 4 weeks in'}
      </span>
    {/if}
  </div>

  {#if recap.planned > 0}
    <div class="space-y-1.5">
      <p class="text-caption text-content-subtle tabular-nums">
        {joinParts(
          `${recap.done} of ${recap.planned} session${recap.planned === 1 ? '' : 's'} done`,
          progress !== undefined && `${Math.round(progress * 100)}% of the plan`,
          recap.missed > 0 && `${recap.missed} missed`,
        )}
      </p>
      {#if progress !== undefined}
        <div class="h-1.5 bg-surface-elevated rounded-full overflow-hidden" aria-hidden="true">
          <div class="h-full bg-success rounded-full transition-all duration-700" style="width: {Math.min(100, progress * 100)}%"></div>
        </div>
      {/if}
    </div>
  {:else if recap.done === 0}
    <p class="text-caption text-content-subtle italic">Nothing planned this week.</p>
  {/if}

  {#if trainingState.homeDetails['thisWeek.mix'] && mixTotal > 0}
    <div class="space-y-1.5">
      <div class="flex h-2.5 rounded-full overflow-hidden gap-[2px]" aria-hidden="true">
        {#each recap.mix as m}
          <div class={categoryColor(m.name)} style="width: {(m.minutes / mixTotal) * 100}%"></div>
        {/each}
      </div>
      <p class="text-caption text-content-subtle">
        {recap.mix.slice(0, 3).map((m) => `${m.name} ${formatMinutes(m.minutes)}`).join(' · ')}{recap.mix.length > 3 ? ` · +${recap.mix.length - 3} more` : ''}
      </p>
    </div>
  {/if}
</div>

{#if noteOpen}
  <NoteSheet
    title="Week note"
    subtitle="This week · {currentWeekId}"
    text={weekNote}
    placeholder="Circumstances, ideas, anything that explains this week…"
    onSave={(text) => trainingState.saveWeekNote(currentWeekId, text)}
    onClose={() => noteOpen = false}
  />
{/if}
