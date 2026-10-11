<script lang="ts">
  /**
   * A finished session against its plan: how much of the planned work was
   * done, which exercises differed and how, where the load came from, and
   * how it compares with the last sessions of the same name. See
   * `lib/analytics/sessionReview.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { Workout } from '../../lib/types';
  import { buildSessionReview, type ExerciseOutcome } from '../../lib/analytics/sessionReview';

  let { workout }: { workout: Workout } = $props();

  const review = $derived(buildSessionReview({ workout, workouts: trainingState.workouts, exerciseTypes: trainingState.exerciseTypes, analyticsCategories: trainingState.analyticsCategories }));
  let open = $state(false);
  const differing = $derived(review.exercises.filter((e) => e.outcome !== 'asPlanned' && e.outcome !== 'unmeasured'));
  const n0 = (v: number) => Math.round(v).toLocaleString();
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}%`;
  const LABEL: Record<ExerciseOutcome, string> = { asPlanned: 'as planned', less: 'less than planned', more: 'more than planned', skipped: 'not done', extra: 'extra', unmeasured: '' };
  const TONE: Record<ExerciseOutcome, string> = { asPlanned: '', less: 'text-status-caution', more: 'text-status-good', skipped: 'text-content-subtle', extra: 'text-primary', unmeasured: '' };
  const summary = $derived(
    [
      review.planProgress !== undefined ? `${Math.round(review.planProgress * 100)}% of the planned work` : undefined,
      review.similar ? `load ${signed(review.similar.loadChange)} on your last ${review.similar.count} “${review.similar.name}”` : undefined,
    ].filter(Boolean).join(' · '),
  );
</script>

{#if summary || differing.length || review.categories.length}
  <div class="bg-surface/40 border border-border rounded-card">
    <button onclick={() => (open = !open)} class="w-full p-3.5 flex items-center gap-3 text-left" aria-expanded={open}>
      <Icon icon="ic:baseline-fact-check" class="text-xl text-content-subtle shrink-0" />
      <span class="min-w-0 flex-1">
        <span class="text-label text-content block">Against the plan</span>
        <span class="text-caption text-content-subtle block">{summary || 'Where it differed and where the load came from'}</span>
      </span>
      <Icon icon="ic:baseline-expand-more" class="text-lg text-content-subtle shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
    </button>
    {#if open}
      <div class="px-3.5 pb-3.5 space-y-3.5 animate-in fade-in duration-150">
        {#if differing.length}
          <div class="space-y-1">
            <p class="text-caption uppercase text-content-subtle">Where it differed</p>
            <div class="divide-y divide-border">
              {#each differing as e (e.slotId)}
                <div class="flex items-baseline justify-between gap-3 py-1.5 text-body">
                  <span class="text-content truncate">{e.name}</span>
                  <span class="shrink-0 text-caption tabular-nums {TONE[e.outcome]}">{LABEL[e.outcome]}{e.ratio !== undefined ? ` · ${Math.round(e.ratio * 100)}%` : ''}</span>
                </div>
              {/each}
            </div>
          </div>
        {:else if review.exercises.length}
          <p class="text-caption text-content-subtle">Every exercise was done about as planned.</p>
        {/if}

        {#if review.categories.length}
          <div class="space-y-1.5">
            <p class="text-caption uppercase text-content-subtle">Where the load came from</p>
            {#each review.categories as c (c.name)}
              <div class="flex items-center gap-2 text-caption">
                <span class="w-28 shrink-0 truncate text-content-muted">{c.name}</span>
                <span class="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden"><span class="block h-full bg-primary/60" style="width: {Math.max(3, c.share * 100)}%"></span></span>
                <span class="w-10 text-right tabular-nums text-content-subtle">{Math.round(c.share * 100)}%</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if review.similar}
          <p class="text-caption text-content-subtle leading-relaxed">Load {n0(workout.loadFactor)} against {n0(review.similar.avgLoad)} on average over your last {review.similar.count} “{review.similar.name}” session{review.similar.count === 1 ? '' : 's'}.</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
