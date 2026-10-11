<script lang="ts">
    /**
   * Goals (Plan screen): competitions and outdoor trips in one list, with a
   * countdown to the next one - or "day N of M" while a trip is under way.
   * Replaces the competition-only calendar; see `GoalEvent`.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { GoalEvent, GoalKind } from '../../lib/types';
  import { upcomingGoals, pastGoals, isOngoing, daysUntilGoal, goalLength, formatGoalDates } from '../../lib/goals/goals';
  import GoalForm from './GoalForm.svelte';
  import NoteSheet from '../common/NoteSheet.svelte';
  import ListRow from '../common/ListRow.svelte';
  import Icon from "@iconify/svelte";

  const todayIso = trainingState.todayIso;
  const upcoming = $derived(upcomingGoals(trainingState.goals, todayIso));
  const past = $derived(pastGoals(trainingState.goals, todayIso));
  const next = $derived(upcoming[0]);

  let adding = $state<GoalKind | null>(null);
  let chooseKind = $state(false);
  let editingId = $state<string | null>(null);
  let noteGoal = $state<GoalEvent | null>(null);
  let showPast = $state(false);

  function headline(goal: GoalEvent): string {
    if (isOngoing(goal, todayIso)) {
      const day = -daysUntilGoal(goal, todayIso) + 1;
      return goalLength(goal) > 1 ? `Day ${day} of ${goalLength(goal)} - ${goal.name}` : `Today - ${goal.name}`;
    }
    const days = daysUntilGoal(goal, todayIso);
    return `${days} ${days === 1 ? 'day' : 'days'} to ${goal.name}`;
  }
</script>

{#snippet goalRow(goal: GoalEvent)}
  {#if editingId === goal.id}
    <GoalForm {goal} kind={goal.kind} onDone={() => editingId = null} />
  {:else}
    <ListRow
      title={goal.name}
      meta={`${formatGoalDates(goal)}${goal.location ? ` · ${goal.location.name}` : ''}${goal.projects?.length ? ` · ${goal.projects.length} project${goal.projects.length === 1 ? '' : 's'}` : ''}`}
      onclick={() => editingId = goal.id}
    >
      {#snippet leading()}
        <Icon icon={goal.kind === 'trip' ? 'ic:baseline-terrain' : 'ic:baseline-flag'} class="text-primary text-lg shrink-0" />
      {/snippet}
      {#snippet trailing()}
        <button onclick={() => noteGoal = goal} class="p-1.5 transition-colors {goal.notes ? 'text-primary' : 'text-content-subtle hover:text-content'}" aria-label="{goal.notes ? 'Open' : 'Add'} note">
          <Icon icon={goal.notes ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-base" />
        </button>
        <button onclick={() => trainingState.deleteGoal(goal.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors" aria-label="Delete"><Icon icon="ic:baseline-delete" class="text-base" /></button>
      {/snippet}
    </ListRow>
  {/if}
{/snippet}

<div class="card space-y-3">
  <div class="flex items-center justify-between">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted">Goals</h3>
      {#if next}
        <p class="text-caption text-content-subtle mt-0.5 truncate">{headline(next)}</p>
      {:else}
        <p class="text-caption text-content-subtle mt-0.5">Competitions and outdoor trips to peak for</p>
      {/if}
    </div>
    <button onclick={() => { chooseKind = !chooseKind; adding = null; }} class="p-1.5 rounded-control text-primary hover:bg-surface-elevated transition-colors" aria-label="Add a goal" aria-expanded={chooseKind}>
      <Icon icon="ic:baseline-plus" class="text-lg" />
    </button>
  </div>

  {#if chooseKind}
    <div class="flex gap-2 animate-in fade-in">
      <button onclick={() => { adding = 'competition'; chooseKind = false; }} class="chip text-content hover:border-primary/40 transition-colors">
        <Icon icon="ic:baseline-flag" class="text-primary" /> Competition
      </button>
      <button onclick={() => { adding = 'trip'; chooseKind = false; }} class="chip text-content hover:border-primary/40 transition-colors">
        <Icon icon="ic:baseline-terrain" class="text-primary" /> Outdoor trip
      </button>
    </div>
  {/if}

  {#if adding}
    <GoalForm kind={adding} onDone={() => adding = null} />
  {/if}

  <div class="divide-y divide-border">
    {#each upcoming as goal (goal.id)}
      {@render goalRow(goal)}
    {:else}
      {#if !adding}
        <p class="text-caption text-content-subtle italic py-1">Nothing planned yet</p>
      {/if}
    {/each}
  </div>

  {#if past.length > 0}
    <div>
      <button onclick={() => showPast = !showPast} class="flex items-center gap-1 text-label text-content-subtle hover:text-content" aria-expanded={showPast}>
        <Icon icon="ic:baseline-chevron-right" class="text-base transition-transform {showPast ? 'rotate-90' : ''}" />
        Past goals ({past.length})
      </button>
      {#if showPast}
        <div class="divide-y divide-border mt-1">
          {#each past as goal (goal.id)}
            {@render goalRow(goal)}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if noteGoal}
  {@const goal = noteGoal}
  <NoteSheet
    title="{goal.name} note"
    subtitle={formatGoalDates(goal)}
    text={goal.notes ?? ''}
    placeholder={goal.kind === 'trip' ? 'Logistics, beta, who\'s coming…' : 'Format, rounds, what to prepare…'}
    onSave={(text) => trainingState.saveGoal({ ...$state.snapshot(goal) as GoalEvent, notes: text.trim() || undefined })}
    onClose={() => noteGoal = null}
  />
{/if}
