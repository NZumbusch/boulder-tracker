<script lang="ts">
  /**
   * Log a session you already did: pick the day and (optionally) the time, then the usual session editor opens on a
   * done session for that day, where the exercises and sets are added like any other. Reached from History and the
   * Plan. The building of the session is `lib/session/pastSession.ts`.
   */
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { pastSessionSheet, closePastSessionSheet } from '../../lib/session/pastSessionUi.svelte';
  import { buildPastSession, pastSessionProblem, defaultPastDay } from '../../lib/session/pastSession';
  import { getDominantBlockForWeek } from '../../lib/planning/trainingBlocks';
  import { weekIdOfIso, localIsoDate } from '../../lib/dateUtils';
  import { openWorkout } from '../../lib/workoutModal.svelte';
  import { generateId } from '../../lib/utils';

  let day = $state(defaultPastDay());
  let time = $state('');

  const today = $derived(localIsoDate());
  const problem = $derived(pastSessionProblem(day, time || undefined));

  // A fresh form each time the sheet opens: yesterday, no time.
  $effect(() => {
    if (pastSessionSheet.open) {
      day = defaultPastDay();
      time = '';
    }
  });

  function carryOn() {
    if (problem) return;
    const blockId = getDominantBlockForWeek(trainingState.trainingBlocks, weekIdOfIso(day))?.id;
    const workout = buildPastSession({ id: generateId(), day, time: time || undefined, blockId });
    if (!workout) return;
    closePastSessionSheet();
    openWorkout(workout, 'edit', true);
  }
</script>

{#if pastSessionSheet.open}
  <Sheet title="Log a past session" subtitle="Add the exercises and sets next" icon="ic:baseline-edit-calendar" onClose={closePastSessionSheet}>
    <div class="space-y-4">
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Day</span>
        <input type="date" bind:value={day} max={today} class="field w-full" />
      </label>
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Start time (optional)</span>
        <input type="time" bind:value={time} class="field w-full" />
      </label>
      {#if problem}<p class="text-caption text-warning" role="alert">{problem}</p>{/if}
    </div>
    {#snippet footer()}
      <button onclick={closePastSessionSheet} class="btn btn-ghost px-4">Cancel</button>
      <button onclick={carryOn} disabled={!!problem} class="btn btn-primary flex-1">Continue</button>
    {/snippet}
  </Sheet>
{/if}
