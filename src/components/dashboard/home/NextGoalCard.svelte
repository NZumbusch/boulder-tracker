<script lang="ts">
  /** The next competition or outdoor trip: countdown, trip forecast and projects, taper hint, and its note. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import type { GoalEvent, TripProject } from '../../../lib/types';
  import { goalLength, formatGoalDates, coversDate } from '../../../lib/goals/goals';
  import { tripSummary, resolveCandidate } from '../../../lib/goals/projects';
  import { taperHint } from '../../../lib/planning/blockOutlook';
  import { describeWeatherCode } from '../../../lib/weather/codes';
  import { T, G, FRICTION_STYLE, dayFriction } from './format';
  import NoteSheet from '../../common/NoteSheet.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const todayIso = $derived(data.todayIso);
  const nextGoal = $derived(data.nextGoal);
  const nextGoalOngoing = $derived(data.nextGoalOngoing);
  const daysUntilCompetition = $derived(data.daysUntilNextGoal);
  const nextTripSummary = $derived(nextGoal?.kind === 'trip' ? tripSummary(nextGoal, trainingState.outdoorAscents) : undefined);
  /** The trip's forecast days - only when the fetched snapshot is for this trip's place. */
  const tripForecastDays = $derived.by(() => {
    const snap = trainingState.goalWeather.snapshot;
    if (!nextGoal || nextGoal.kind !== 'trip' || !snap || trainingState.goalWeather.locationName !== nextGoal.location?.name) return [];
    return snap.daily.filter((d) => coversDate(nextGoal, d.date));
  });
  let goalNoteOpen = $state(false);
  const competitionTaperHint = $derived(taperHint(daysUntilCompetition, data.currentPhaseName));

  async function answerCandidate(goal: GoalEvent, project: TripProject, sendId: string, counts: boolean) {
    const updated = resolveCandidate(project, sendId, counts);
    await trainingState.saveGoal({
      ...$state.snapshot(goal) as GoalEvent,
      projects: (goal.projects ?? []).map((p) => (p.id === project.id ? updated : $state.snapshot(p) as TripProject)),
    });
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-2">
  <SectionHeader icon={nextGoal?.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-flag'} label="Next Goal"
  note={nextGoal && trainingState.homeDetails['competition.note'] ? { has: !!nextGoal.notes, open: () => goalNoteOpen = true, what: nextGoal.kind === 'trip' ? 'trip' : 'competition' } : undefined} />
  {#if nextGoal && daysUntilCompetition !== undefined}
    {@const length = goalLength(nextGoal)}
    <div class="flex items-center gap-4">
      <div class="text-center shrink-0 px-2">
        {#if nextGoalOngoing && length > 1}
          <p class="text-display text-primary tabular-nums leading-none">{-daysUntilCompetition + 1}<span class="text-title text-content-subtle">/{length}</span></p>
          <p class="text-caption text-content-subtle uppercase mt-1">day</p>
        {:else}
          <p class="text-display text-primary tabular-nums leading-none">{Math.max(0, daysUntilCompetition)}</p>
          <p class="text-caption text-content-subtle uppercase mt-1">{daysUntilCompetition === 1 ? 'day' : 'days'}</p>
        {/if}
      </div>
      <div class="min-w-0 border-l border-border-strong/50 pl-4">
        <p class="text-body font-bold text-content truncate">{nextGoal.name}</p>
        <p class="text-caption text-content-subtle truncate">
          {nextGoalOngoing && length === 1 ? 'Today' : formatGoalDates(nextGoal)}{nextGoal.location ? ` · ${nextGoal.location.name}` : ''}
        </p>
      </div>
    </div>
    {#if nextGoal.kind === 'trip' && nextTripSummary}
      {#if nextGoalOngoing && nextTripSummary.sends.length > 0}
        <p class="text-caption text-content-muted flex items-center gap-1.5">
          <Icon icon="ic:baseline-check-circle" class="text-sm text-status-good shrink-0" />
          {nextTripSummary.sends.length} send{nextTripSummary.sends.length === 1 ? '' : 's'} so far{nextTripSummary.hardest ? ` · hardest ${G(nextTripSummary.hardest.grade)}` : ''}
        </p>
      {/if}
      {#if trainingState.homeDetails['competition.conditions'] && tripForecastDays.length > 0}
        {@const rain = trainingState.goalWeather.snapshot?.recentRain}
        <div class="flex gap-3 overflow-x-auto no-scrollbar pt-1 border-t border-border/60">
          {#each tripForecastDays as day}
            {@const df = dayFriction(day)}
            {@const code = describeWeatherCode(day.weatherCode)}
            <div class="flex flex-col items-center gap-1 shrink-0 w-11 pt-2">
              <span class="text-caption text-content-subtle">{day.date === todayIso ? 'Today' : new Date(`${day.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span title={code.label} class="flex"><Icon icon={code.icon} class="text-lg text-primary" aria-label={code.label} /></span>
              <span class="text-caption text-content tabular-nums">{T(day.tempMaxC)}</span>
              {#if trainingState.homeDetails['weather.frictionNumber']}
                <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
              {:else}
                <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
              {/if}
            </div>
          {/each}
        </div>
        {#if rain && rain.last72hMm > 0 && daysUntilCompetition <= 3}
          <p class="text-caption text-content-subtle tabular-nums flex items-center gap-1.5">
            <Icon icon="ic:baseline-water-drop" class="text-sm text-primary shrink-0" />
            Rock drying: {rain.last72hMm} mm there in the last 3 days{rain.hoursSinceRain !== undefined ? `, last ${rain.hoursSinceRain} h ago` : ''}
          </p>
        {/if}
      {/if}
      {#if trainingState.homeDetails['competition.projects'] && nextTripSummary.projects.length > 0}
        <div class="pt-1 space-y-1">
          <p class="text-label text-content-muted">Projects {nextTripSummary.projectsDone}/{nextTripSummary.projects.length}</p>
          {#each nextTripSummary.projects as status (status.project.id)}
            {@const p = status.project}
            <div class="flex items-center gap-2 text-caption">
              <Icon
                icon={status.state === 'done' ? 'ic:baseline-check-circle' : status.state === 'maybe' ? 'ic:baseline-help-outline' : 'ic:baseline-radio-button-unchecked'}
                class="text-sm shrink-0 {status.state === 'done' ? 'text-status-good' : status.state === 'maybe' ? 'text-status-caution' : 'text-content-subtle'}"
              />
              <span class="truncate {status.state === 'done' ? 'text-content' : 'text-content-muted'}">
                {p.name ?? `Any ${G(p.grade)}`}{p.name && p.grade ? ` ${G(p.grade)}` : ''}{p.flash ? ' · flash' : ''}{status.send && status.send.name && status.send.name !== p.name ? ` (${status.send.name} ${G(status.send.grade)})` : ''}
              </span>
            </div>
            {#each status.candidates as candidate (candidate.id)}
              <div class="flex items-center gap-2 pl-5 text-caption text-content-subtle">
                <span class="flex-1 truncate">"{candidate.name} {G(candidate.grade)}" - counts for {p.name}?</span>
                <button onclick={() => answerCandidate(nextGoal, p, candidate.id, true)} class="px-2 py-0.5 rounded-control bg-primary/10 text-primary">Yes</button>
                <button onclick={() => answerCandidate(nextGoal, p, candidate.id, false)} class="px-2 py-0.5 rounded-control bg-surface-elevated text-content-muted">No</button>
              </div>
            {/each}
          {/each}
        </div>
      {/if}
    {/if}
    {#if competitionTaperHint && trainingState.homeDetails['competition.taper'] && !nextGoalOngoing}
      <p class="text-caption text-status-caution flex items-start gap-1">
        <Icon icon="ic:baseline-info" class="text-sm mt-px shrink-0" />
        <span>{competitionTaperHint}</span>
      </p>
    {/if}
  {:else}
    <p class="text-caption text-content-subtle italic">No competition or trip coming up. Add one under Plan → Goals.</p>
  {/if}
</div>

{#if goalNoteOpen && nextGoal}
  {@const goal = nextGoal}
  <NoteSheet
    title="{goal.name} note"
    subtitle={formatGoalDates(goal)}
    text={goal.notes ?? ''}
    placeholder={goal.kind === 'trip' ? 'Logistics, beta, who\'s coming…' : 'Format, rounds, what to prepare…'}
    onSave={(text) => trainingState.saveGoal({ ...$state.snapshot(goal) as GoalEvent, notes: text.trim() || undefined })}
    onClose={() => goalNoteOpen = false}
  />
{/if}
