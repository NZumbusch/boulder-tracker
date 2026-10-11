<script lang="ts">
  /** The latest completed sessions (and, optionally, outdoor sends). */
  import { trainingState } from '../../../lib/state.svelte';
  import { formatDate } from '../../../lib/dateUtils';
  import { sessionDuration } from '../../../lib/planning/sessionDuration';
  import { recentActivity as buildRecentActivity } from '../../../lib/activity/recentActivity';
  import { joinParts, G } from './format';
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
        {@const fatigue = [['F', workout.fingers], ['A', workout.arms], ['C', workout.core], ['S', workout.systemic]].filter(([, v]) => v !== undefined)}
        <ListRow
          title={workout.notes || 'Session'}
          meta={joinParts(
            formatDate(workout.date),
            trainingState.homeDetails['recentActivity.details'] && `${Math.round(sessionDuration(workout))} min`,
            trainingState.homeDetails['recentActivity.fatigue'] && fatigue.length > 0 && fatigue.map(([k, v]) => `${k}${v}`).join(' '),
          )}
          value={trainingState.homeDetails['recentActivity.details'] ? Math.round(workout.loadFactor || 0) : undefined}
          valueHint={trainingState.homeDetails['recentActivity.details'] ? 'load' : undefined}
          onclick={() => trainingState.openInHistory(workout.id)}
        />
      {:else}
        {@const ascent = item.ascent}
        <ListRow
          title={ascent.name || 'Outdoor send'}
          meta={joinParts(formatDate(ascent.date), ascent.style, ascent.crag)}
          value={G(ascent.grade)}
          valueHint="send"
        />
      {/if}
    {:else}
      <p class="text-caption text-content-subtle italic py-2">No completed sessions yet.</p>
    {/each}
  </div>
</div>
