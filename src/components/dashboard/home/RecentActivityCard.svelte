<script lang="ts">
  import { fabActions } from '../../../lib/navigation/fabActions.svelte';
  /** The latest completed sessions (and, optionally, outdoor sends). */
  import { trainingState } from '../../../lib/state.svelte';
  import { formatDay } from '../../../lib/dateUtils';
  import { sessionDuration } from '../../../lib/planning/sessionDuration';
  import { recentActivity as buildRecentActivity } from '../../../lib/activity/recentActivity';
  import { joinParts, G } from './format';
  import { RATING_AXES } from '../../../lib/constants';
  import SectionHeader from './SectionHeader.svelte';
  import ListRow from '../../common/ListRow.svelte';

  const recentActivity = $derived(
    buildRecentActivity(trainingState.completedWorkouts, trainingState.outdoorAscents, trainingState.tunable('home.recentActivityCount'), trainingState.homeDetails['recentActivity.ascents']),
  );
</script>

<div class="card space-y-1">
  <SectionHeader label="Recent Activity" />
  <div class="divide-y divide-border">
    {#each recentActivity as item}
      {#if item.kind === 'workout'}
        {@const workout = item.workout}
        {@const fatigue = RATING_AXES.filter((a) => workout[a.key] !== undefined).map((a) => `${a.label} ${workout[a.key]}`)}
        <ListRow
          title={workout.notes || 'Session'}
          meta={joinParts(
            workout.date ? formatDay(workout.date, { weekday: 'short' }) : undefined,
            trainingState.homeDetails['recentActivity.details'] && `${Math.round(sessionDuration(workout))} min`,
          )}
          detail={trainingState.homeDetails['recentActivity.fatigue'] && fatigue.length > 0 ? `Felt in: ${fatigue.join(' · ')} (of 10)` : undefined}
          value={trainingState.homeDetails['recentActivity.details'] ? Math.round(workout.loadFactor || 0) : undefined}
          valueHint={trainingState.homeDetails['recentActivity.details'] ? 'load' : undefined}
          onclick={() => trainingState.openInHistory(workout.id)}
        />
      {:else}
        {@const ascent = item.ascent}
        <ListRow
          title={ascent.name || 'Outdoor send'}
          meta={joinParts(formatDay(ascent.date, { weekday: 'short' }), ascent.style, ascent.crag)}
          onclick={() => trainingState.openSends()}
          value={G(ascent.grade)}
          valueHint="send"
        />
      {/if}
    {:else}
      <div class="flex items-center justify-between gap-3 py-2">
        <p class="text-caption text-content-subtle">No completed sessions yet.{#if fabActions.showing} Tap + to log one.{/if}</p>
        {#if !fabActions.showing}<button onclick={() => trainingState.navigate('add')} class="btn btn-secondary shrink-0">Log a session</button>{/if}
      </div>
    {/each}
  </div>
</div>
