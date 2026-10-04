<script lang="ts">
  /** Progress: consistency, latest benchmarks and retests, sends, and the last trip. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { formatDate } from '../../../lib/dateUtils';
  import { latestBenchmarks, retestDue, sendsSummary, consistency } from '../../../lib/analytics/progress';
  import { pastGoals, daysUntilGoal } from '../../../lib/goals/goals';
  import { tripSummary } from '../../../lib/goals/projects';
  import { G } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const benchmarkProgress = $derived(latestBenchmarks(trainingState.benchmarks, trainingState.benchmarkTypes, trainingState.valueDefs, trainingState.units.weight));
  const retests = $derived(retestDue(benchmarkProgress, data.asOf, trainingState.tunable('progress.retestWeeks')));
  const sends = $derived(sendsSummary(trainingState.outdoorAscents, data.asOf));
  const consistencyStats = $derived(consistency(trainingState.workouts, data.asOf));
  const lastTrip = $derived.by(() => {
    const trip = pastGoals(trainingState.goals, data.todayIso).find((g) => g.kind === 'trip');
    if (!trip || -daysUntilGoal({ ...trip, date: trip.endDate ?? trip.date }, data.todayIso) > trainingState.tunable('trips.lastTripDays')) return undefined;
    return { trip, summary: tripSummary(trip, trainingState.outdoorAscents) };
  });
  const showBench = $derived(trainingState.homeDetails['progress.benchmarks'] && benchmarkProgress.length > 0);
  const showRetest = $derived(trainingState.homeDetails['progress.retest'] && retests.length > 0);
  const showSends = $derived(trainingState.homeDetails['progress.sends'] && sends.last);
  const showConsistency = $derived(trainingState.homeDetails['progress.consistency'] && consistencyStats.due > 0);
</script>

<div class="card space-y-3">
  <SectionHeader label="Progress" />
  {#if showConsistency}
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-body text-content"><span class="text-metric tabular-nums">{consistencyStats.done}</span>{' '}<span class="text-content-subtle">of the last {consistencyStats.due} sessions done</span></p>
      {#if consistencyStats.weekStreak > 1}
        <span class="text-label text-primary shrink-0">{consistencyStats.weekStreak}-week streak</span>
      {/if}
    </div>
  {/if}
  {#if showBench}
    <div class="space-y-1.5">
      {#each benchmarkProgress.slice(0, trainingState.tunable('home.progressBenchmarks')) as b (b.typeKey)}
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-label text-content-muted truncate">{b.name}</span>
          <!-- Parts laid out with a flex gap, not markup spaces - spaces at
               an {#if} edge are dropped (see joinParts). -->
          <span class="text-label text-content tabular-nums shrink-0 flex items-baseline gap-1.5">
            <span>{b.latestText}</span>
            {#if b.changeText && b.change !== 0}
              <span class={b.improved ? 'text-status-good' : 'text-status-caution'}>{b.changeText}</span>
            {/if}
            <span class="text-content-subtle">· {formatDate(b.latestDate)}</span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
  {#if showRetest}
    <p class="text-caption text-content-subtle flex items-center gap-1">
      <Icon icon="ic:baseline-update" class="text-sm shrink-0" />
      <span>Retest {retests.slice(0, 2).map((r) => `${r.name} (${r.weeks} wk)`).join(', ')}</span>
    </p>
  {/if}
  {#if showSends && sends.last}
    <div class="pt-2 border-t border-border/60 space-y-1">
      <p class="text-label text-content-muted flex items-center gap-1.5">
        <Icon icon="ic:baseline-terrain" class="text-sm text-primary shrink-0" />
        <span class="truncate">Last send: <span class="text-content">{sends.last.name || 'Outdoor send'} {G(sends.last.grade)}</span> · {formatDate(sends.last.date)}</span>
      </p>
      {#if sends.hardest}
        <p class="text-caption text-content-subtle">Hardest this season: <span class="text-content">{G(sends.hardest.grade)}</span>{sends.hardest.name ? ` (${sends.hardest.name})` : ''} · {sends.countThisSeason} send{sends.countThisSeason === 1 ? '' : 's'}</p>
      {/if}
    </div>
  {/if}
  {#if lastTrip && trainingState.homeDetails['progress.lastTrip']}
    {@const s = lastTrip.summary}
    <button onclick={() => trainingState.openSends()} class="w-full pt-2 border-t border-border/60 flex items-center gap-1.5 text-left">
      <Icon icon="ic:baseline-terrain" class="text-sm text-primary shrink-0" />
      <span class="text-caption text-content-subtle truncate flex-1">
        Last trip: <span class="text-content">{lastTrip.trip.name}</span> · {s.sends.length} send{s.sends.length === 1 ? '' : 's'}{s.hardest ? ` · hardest ${G(s.hardest.grade)}` : ''}{s.projects.length ? ` · projects ${s.projectsDone}/${s.projects.length}` : ''}
      </span>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
    </button>
  {/if}
  {#if !showBench && !showRetest && !showSends && !showConsistency && !(lastTrip && trainingState.homeDetails['progress.lastTrip'])}
    <p class="text-caption text-content-subtle italic">Log sessions, benchmarks or sends to see progress here.</p>
  {/if}
</div>
