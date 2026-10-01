<script lang="ts">
  /**
   * A heads-up on a planned session that hits an open pain issue: one of
   * its exercises is charted under a category the issue watches ("Warn me
   * before sessions with…"). A chip in a row, or a line in
   * the viewer and the live session.
   */
  import type { Workout } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { issuesTouchedBy, painLevelOn, inSentence } from '../../lib/pain/issues';
  import { localIsoDate } from '../../lib/dateUtils';
  import { openPainIssue } from '../../lib/pain/painUi.svelte';
  import Icon from '@iconify/svelte';

  let { workout, variant = 'chip' }: { workout: Pick<Workout, 'exercises' | 'status'>; variant?: 'chip' | 'line' } = $props();

  const touched = $derived(
    workout.status === 'completed' ? [] : issuesTouchedBy(workout, trainingState.painIssues, trainingState.exerciseTypes, trainingState.analyticsCategories),
  );
  const today = localIsoDate();
  /** The category names this session's exercises are charted under - the slot's own, else its type's. */
  const sessionCats = $derived(new Set(workout.exercises.map((s) =>
    (s.categoryId ? trainingState.analyticsCategories.find((c) => c.id === s.categoryId)?.name : undefined)
      ?? trainingState.exerciseTypes.find((t) => t.id === s.typeId)?.category,
  ).filter(Boolean)));
  const levelOf = (id: string) => painLevelOn(trainingState.painIssues.filter((i) => i.id === id), trainingState.painLogs, today)?.level;
</script>

{#if touched.length}
  {#if variant === 'chip'}
    <span class="inline-flex align-middle items-center gap-0.5 px-1.5 py-px rounded-full text-[10px] font-semibold bg-status-caution/15 text-status-caution" title="Hits an open pain issue: {touched.map((i) => i.bodyPart).join(', ')}">
      <Icon icon="ic:baseline-healing" class="text-[11px]" />{touched.length === 1 ? touched[0].bodyPart.split(' - ')[0] : `${touched.length} issues`}
    </span>
  {:else}
    {#each touched as issue (issue.id)}
      <button onclick={() => openPainIssue(issue.id)} class="w-full flex items-start gap-2 px-3 py-2 rounded-control bg-status-caution/10 border border-status-caution/30 text-left text-caption text-content">
        <Icon icon="ic:baseline-healing" class="text-base text-status-caution shrink-0 mt-px" />
        <span class="min-w-0 flex-1">
          Easy on your <span class="font-bold">{inSentence(issue.bodyPart)}</span>{levelOf(issue.id) !== undefined ? ` (${levelOf(issue.id)}/10)` : ''} - this session has {issue.watchCategories!.filter((c) => sessionCats.has(c)).join(', ')}.
        </span>
        <Icon icon="ic:baseline-chevron-right" class="text-base text-content-subtle shrink-0" />
      </button>
    {/each}
  {/if}
{/if}
