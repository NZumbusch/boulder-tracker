<script lang="ts">
  /**
   * Progress tab: the exercises you have logged enough to show a trend for,
   * each with a small line, its latest number and how it has moved against
   * eight weeks earlier. Tap one for its full page. See
   * `lib/analytics/exerciseProgress.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { summariseExercises, type ExerciseSummary } from '../../lib/analytics/exerciseProgress';
  import { openExerciseProgress } from '../../lib/analytics/exerciseProgress.svelte';
  import { displayWeight } from '../../lib/units';

  const LIMIT = 6;
  const summaries = $derived(summariseExercises(trainingState.workouts, trainingState.exerciseTypes, trainingState.today));
  let showAll = $state(false);
  const shown = $derived(showAll ? summaries : summaries.slice(0, LIMIT));

  function valueText(s: ExerciseSummary): string {
    if (s.metric === 'weight') return `${Math.round(displayWeight(s.latest, trainingState.units.weight) * 10) / 10} ${trainingState.units.weight}`;
    if (s.metric === 'timeOn') return `${s.latest} s`;
    return `${s.latest} reps`;
  }
  /** A tiny polyline of the series, scaled to its own range. */
  function line(s: ExerciseSummary): string {
    const vals = s.series.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const days = s.series.map((p) => p.day);
    const d0 = days[0];
    const dSpan = days[days.length - 1] - d0 || 1;
    return s.series.map((p) => `${(((p.day - d0) / dSpan) * 76 + 2).toFixed(1)},${(22 - ((p.value - lo) / span) * 18).toFixed(1)}`).join(' ');
  }
</script>

{#if summaries.length > 0}
  <div id="section-exercises" class="scroll-mt-4 card space-y-1">
    <div class="px-1 pb-1">
      <h3 class="text-section uppercase text-content-muted">Exercises</h3>
      <p class="text-caption text-content-subtle">Heaviest set, longest hold or most reps each session. Tap one for its records.</p>
    </div>
    <div class="divide-y divide-border">
      {#each shown as s (s.typeId)}
        <button onclick={() => openExerciseProgress(s.typeId)} class="w-full flex items-center gap-3 py-2.5 text-left">
          <span class="min-w-0 flex-1">
            <span class="block text-body text-content truncate">{s.name}</span>
            <span class="block text-caption text-content-subtle tabular-nums">{valueText(s)} · {s.sessions} sessions</span>
          </span>
          <svg viewBox="0 0 80 24" class="w-20 h-6 shrink-0 text-primary" aria-hidden="true"><polyline points={line(s)} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" /></svg>
          <span class="w-12 text-right text-caption tabular-nums shrink-0 {s.change === undefined ? 'text-content-subtle' : s.change > 0.5 ? 'text-status-good' : s.change < -0.5 ? 'text-status-caution' : 'text-content-subtle'}">{s.change === undefined ? '' : `${s.change >= 0 ? '+' : '−'}${Math.abs(Math.round(s.change))}%`}</span>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0" />
        </button>
      {/each}
    </div>
    {#if summaries.length > LIMIT}
      <button onclick={() => (showAll = !showAll)} class="text-caption text-primary px-1 pt-1">{showAll ? 'Show fewer' : `Show all ${summaries.length}`}</button>
    {/if}
  </div>
{/if}
