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
  import { decrementWeekId, formatWeek } from '../../../lib/dateUtils';
  import InfoButton from '../../common/InfoButton.svelte';
  import { formatMinutes } from '../../../lib/session/formatSession';
  import { joinParts } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import { hasTargets, isFingerSession, weekProgress, weekProgressText } from '../../../lib/analytics/targets';
  import { fingerCategoryIds } from '../../../lib/analytics/proMetrics';
  import Icon from '@iconify/svelte';
  import { showAcwr } from '../../../lib/help/acwrSheet.svelte';
  import { acwrZone, ACWR_PILL } from '../../../lib/home/acwrZone';

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
  // The running week against the weekly targets, when there are any.
  const targets = $derived(trainingState.athleteProfile?.targets);
  const targetProgress = $derived.by(() => {
    if (!hasTargets(targets)) return undefined;
    const fingers = fingerCategoryIds(trainingState.analyticsCategories, trainingState.fingerCategoryIds);
    return weekProgress(targets, data.weekWorkouts.filter((w) => w.status === 'completed'), (w) => isFingerSession(w, trainingState.exerciseTypes, trainingState.analyticsCategories, fingers));
  });
  const mixTotal = $derived(recap.mix.reduce((sum, m) => sum + m.minutes, 0));
  const categoryColor = (name: string) => trainingState.analyticsCategories.find((c) => c.name === name)?.color ?? 'bg-content-subtle';
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
  // One classification for every screen (lib/home/acwrZone), from the athlete's own edges.
  const acwrInfo = $derived(acwr.sufficient ? acwrZone(acwr.ratio, trainingState.acwrZones) : undefined);
</script>

<div class="card space-y-3">
  <SectionHeader label="This Week" subtitle={formatWeek(currentWeekId)} info="load"
  note={trainingState.homeDetails['thisWeek.note'] ? { has: !!weekNote, open: () => noteOpen = true, what: 'week' } : undefined} />
  {#if trainingState.homeDetails['thisWeek.strip']}
    <div class="grid grid-cols-7 gap-1">
      {#each dayStrip as cell, i}
        {@const mark = DAY_MARK[cell.status]}
        <button
          onclick={() => peekDay = peekDay === i ? null : i}
          class="flex flex-col items-center gap-1 py-1 rounded-control {peekDay === i ? 'bg-surface-elevated/60' : ''}"
          aria-label="{cell.day}: {mark.label}{weekTripDays[i] && trainingState.homeDetails['thisWeek.tripDays'] ? `, trip: ${weekTripDays[i]!.name}` : ''}{cell.sessions.length ? `, ${cell.sessions.join(', ')}` : ''}"
        >
          <span class="text-caption {cell.isToday ? 'text-primary font-bold' : 'text-content-subtle'}">{WEEK_DAYS[i].slice(0, 2)}</span>
          <span class="w-7 h-7 rounded-full border flex items-center justify-center {mark.class} {cell.isToday ? 'ring-2 ring-primary/50' : ''}">
            {#if mark.icon}<Icon icon={mark.icon} class={cell.status === 'planned' ? 'text-xs' : 'text-sm'} />{/if}
          </span>
          {#if weekTripDays[i] && trainingState.homeDetails['thisWeek.tripDays']}
            <Icon icon="ic:baseline-terrain" class="text-sm text-primary -mt-0.5" aria-hidden="true" />
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
      <span class="text-caption text-content-subtle">load{recap.minutes > 0 ? ` · ${formatMinutes(recap.minutes)}` : ''}</span>
    </p>
    {#if acwrInfo && trainingState.homeDetails['thisWeek.acwr']}
      <button onclick={showAcwr} class="tap px-2 py-0.5 rounded-full text-caption tabular-nums shrink-0 inline-flex items-center gap-1 {ACWR_PILL[acwrInfo.status]}" aria-label="Load ratio {acwr.ratio!.toFixed(2)}, {acwrInfo.label}. What it is made of">Load ratio {acwr.ratio!.toFixed(2)} · {acwrInfo.label}<Icon icon="ic:baseline-chevron-right" class="text-xs -mr-0.5" /></button>
    {:else if trainingState.homeDetails['thisWeek.acwr'] && acwr.insufficientReason}
      <!-- Said, not just hidden: ACWR needs a real 4-week baseline. -->
      <button onclick={showAcwr} class="btn-quiet text-caption text-primary shrink-0 gap-0.5" aria-label="Why there is no load ratio yet">
        {acwr.insufficientReason === 'break' ? `Load ratio after a break · ${acwr.activeWeeks}/3 weeks` : 'Load ratio needs 4 weeks of history'}<Icon icon="ic:baseline-chevron-right" class="text-xs" />
      </button>
    {/if}
  </div>

  {#if targetProgress && weekProgressText(targetProgress)}
    <p class="text-caption tabular-nums flex items-center gap-1.5 {targetProgress.load?.state === 'above' ? 'text-status-caution' : 'text-content-subtle'}">
      <Icon icon={targetProgress.load?.state === 'above' ? 'ic:baseline-warning-amber' : 'ic:baseline-flag'} class="text-sm shrink-0" />
      <span>{targetProgress.load?.state === 'above' ? 'Over target · ' : ''}{weekProgressText(targetProgress)}</span>
    </p>
  {/if}

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
        <div class="h-1.5 bg-surface-elevated rounded-full overflow-hidden" role="img" aria-label="Plan progress: {Math.round(progress * 100)}% of the plan">
          <div class="h-full bg-success rounded-full transition-all duration-700" style="width: {Math.min(100, progress * 100)}%"></div>
        </div>
      {/if}
    </div>
  {:else if recap.done === 0}
    <p class="text-caption text-content-subtle italic">Nothing planned this week.</p>
  {/if}

  {#if trainingState.homeDetails['thisWeek.mix'] && mixTotal > 0}
    <div class="space-y-1.5">
      <p class="text-caption text-content-subtle flex items-center gap-1">Training mix <InfoButton term="mix" /></p>
      <div class="flex h-2.5 rounded-full overflow-hidden gap-[2px]" aria-hidden="true">
        {#each recap.mix as m}
          <div class={categoryColor(m.name)} style="width: {(m.minutes / mixTotal) * 100}%"></div>
        {/each}
      </div>
      <p class="text-caption text-content-subtle flex flex-wrap gap-x-3 gap-y-0.5">
        {#each recap.mix.slice(0, 3) as m}
          <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full {categoryColor(m.name)}" aria-hidden="true"></span>{m.name} {formatMinutes(m.minutes)}</span>
        {/each}
        {#if recap.mix.length > 3}<span>+{recap.mix.length - 3} more</span>{/if}
      </p>
    </div>
  {/if}
</div>

{#if noteOpen}
  <NoteSheet
    title="Week note"
    subtitle="This week · {formatWeek(currentWeekId)}"
    text={weekNote}
    placeholder="Circumstances, ideas, anything that explains this week…"
    onSave={(text) => trainingState.saveWeekNote(currentWeekId, text)}
    onClose={() => noteOpen = false}
  />
{/if}
