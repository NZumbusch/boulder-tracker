<script lang="ts">
  /** The latest completed sessions (and, optionally, outdoor sends). */
  import { trainingState } from '../../../lib/state.svelte';
  import { formatDate } from '../../../lib/dateUtils';
  import { sessionDuration } from '../../../lib/planning/sessionDuration';
  import { recentActivity as buildRecentActivity } from '../../../lib/activity/recentActivity';
  import { joinParts, G } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  const recentActivity = $derived(
    buildRecentActivity(trainingState.completedWorkouts, trainingState.outdoorAscents, trainingState.tunable('home.recentActivityCount'), trainingState.homeDetails['recentActivity.ascents']),
  );
</script>

<div class="bg-surface/50 border border-border rounded-card p-5 shadow-card space-y-3">
  <SectionHeader icon="ic:baseline-history" label="Recent Activity" />
  {#each recentActivity as item}
    {#if item.kind === 'workout'}
      {@const workout = item.workout}
      {@const fatigue = [['F', workout.fingers], ['A', workout.arms], ['C', workout.core], ['S', workout.systemic]].filter(([, v]) => v !== undefined)}
      <button onclick={() => trainingState.openInHistory(workout.id)} class="w-full flex items-center gap-3 p-2.5 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-left hover:border-border-strong transition-colors">
        <div class="w-8 h-8 rounded-control bg-success/10 text-success flex items-center justify-center shrink-0">
          <Icon icon="ic:baseline-check" class="text-base" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-label text-content truncate">{workout.notes || 'Session'}</p>
          <p class="text-caption text-content-subtle truncate tabular-nums">
            {joinParts(
              formatDate(workout.date),
              trainingState.homeDetails['recentActivity.details'] && `${Math.round(sessionDuration(workout))} min`,
              trainingState.homeDetails['recentActivity.details'] && `load ${Math.round(workout.loadFactor || 0)}`,
              trainingState.homeDetails['recentActivity.fatigue'] && fatigue.length > 0 && fatigue.map(([k, v]) => `${k}${v}`).join(' '),
            )}
          </p>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
      </button>
    {:else}
      {@const ascent = item.ascent}
      <div class="w-full flex items-center gap-3 p-2.5 bg-surface-elevated/30 rounded-control border border-border-strong/40">
        <div class="w-8 h-8 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon icon="ic:baseline-terrain" class="text-base" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-label text-content truncate">{ascent.name || 'Outdoor send'} <span class="text-primary tabular-nums">{G(ascent.grade)}</span></p>
          <p class="text-caption text-content-subtle truncate">{formatDate(ascent.date)}{ascent.style ? ` · ${ascent.style}` : ''}{ascent.crag ? ` · ${ascent.crag}` : ''}</p>
        </div>
      </div>
    {/if}
  {:else}
    <p class="text-caption text-content-subtle italic">No completed sessions yet.</p>
  {/each}
</div>
