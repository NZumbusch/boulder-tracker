<script lang="ts">
  /**
   * What goes with your best sessions: patterns between how your sessions went
   * (each exercise against your own recent usual) and the recovery picture the
   * day before - sleep, HRV, resting heart rate, Body Battery, stress, steps,
   * load. A pattern in your own data, not a cause; it says how many sessions it
   * rests on and how sure it is. The maths: `lib/analytics/sessionPredictors.ts`.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { describeFinding, MIN_SESSIONS, predictBestSessions } from '../../lib/analytics/sessionPredictors';

  const report = $derived(predictBestSessions(trainingState.workouts, trainingState.dailyMetrics, trainingState.workoutsForLoad, trainingState.today));
  const shown = $derived(report.findings.slice(0, 4));
</script>

<div id="section-bestSessions" class="scroll-mt-4 card space-y-3">
  <div class="min-w-0">
    <h3 class="text-section uppercase text-content-muted">Best Sessions</h3>
    <p class="text-caption text-content-subtle mt-0.5">What the day before looked like when your sessions went better than your usual, across your whole history.</p>
  </div>

  {#if report.sessions < MIN_SESSIONS}
    <p class="text-label text-content-subtle">
      Needs about {MIN_SESSIONS} logged sessions with weights, holds or reps to compare ({report.sessions} so far), and sleep or HRV on those days.
    </p>
  {:else if shown.length === 0}
    <p class="text-label text-content-subtle">
      {report.checked
        ? `Nothing stands out across ${report.sessions} sessions: none of the ${report.checked} things checked goes clearly with how your sessions went.`
        : `${report.sessions} sessions, but too few days with sleep, HRV or similar data around them to compare.`}
    </p>
  {:else}
    <ul class="space-y-2">
      {#each shown as f (f.id)}
        <li class="text-label leading-relaxed">{describeFinding(f)}</li>
      {/each}
    </ul>
    <p class="text-caption text-content-subtle">A pattern in {report.sessions} of your sessions, not proof of cause. "Hint" means it could still be chance.</p>
  {/if}
</div>
