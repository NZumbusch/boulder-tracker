<script lang="ts">
  /**
   * Competition/peaking calendar (PLAN.md Phase 4): list + add form for
   * `CompetitionEvent`s, plus a countdown to the next event.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { formatDate } from '../../lib/dateUtils';
  import type { CompetitionEvent } from '../../lib/types';
  import Icon from "@iconify/svelte";

  const upcomingEvents = $derived(
    [...trainingState.competitionEvents]
      .filter((e) => e.date >= new Date().toISOString().split('T')[0])
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  const nextEvent = $derived(upcomingEvents[0]);

  const daysUntil = $derived.by(() => {
    if (!nextEvent) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(nextEvent.date);
    return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  });

  let isAdding = $state(false);
  let draft = $state<CompetitionEvent>({ id: '', name: '', date: '' });

  function startAdd() {
    draft = { id: generateId(), name: '', date: new Date().toISOString().split('T')[0] };
    isAdding = true;
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.date) return;
    await trainingState.saveCompetitionEvent($state.snapshot(draft));
    isAdding = false;
  }

  async function handleDelete(id: string) {
    await trainingState.deleteCompetitionEvent(id);
  }
</script>

<div class="bg-surface/50 border border-border p-5 rounded-card backdrop-blur-sm space-y-4 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Competition Calendar</h3>
      {#if nextEvent && daysUntil !== null}
        <p class="text-caption text-primary mt-0.5 font-bold">{daysUntil} {daysUntil === 1 ? 'day' : 'days'} to {nextEvent.name}</p>
      {:else}
        <p class="text-caption text-content-subtle mt-0.5">No upcoming events</p>
      {/if}
    </div>
    <button onclick={startAdd} class="bg-surface-elevated hover:bg-surface-elevated-hover text-content p-1.5 rounded-control transition-colors"><Icon icon="ic:baseline-plus" class="text-sm" /></button>
  </div>

  {#if isAdding}
    <div class="p-4 bg-surface-elevated/50 border border-primary/30 rounded-card space-y-3">
      <input bind:value={draft.name} placeholder="Event name" class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
      <input type="date" bind:value={draft.date} class="w-full bg-surface text-content p-3 rounded-control border border-border-strong outline-none text-sm" />
      <div class="flex gap-2">
        <button onclick={handleSave} class="flex-1 py-2.5 bg-primary text-white text-sm font-bold rounded-control">Save</button>
        <button onclick={() => isAdding = false} class="px-4 py-2.5 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
      </div>
    </div>
  {/if}

  <div class="space-y-2">
    {#each upcomingEvents as event}
      <div class="flex items-center justify-between p-3 bg-surface-elevated/50 rounded-control border border-border-strong/50">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <Icon icon="ic:baseline-flag" class="text-primary text-base flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-body font-bold text-content truncate">{event.name}</p>
            <p class="text-caption text-content-subtle mt-0.5">{formatDate(event.date)}</p>
          </div>
        </div>
        <button onclick={() => handleDelete(event.id)} class="p-1.5 text-content-subtle hover:text-danger transition-colors flex-shrink-0"><Icon icon="ic:baseline-delete" class="text-sm" /></button>
      </div>
    {:else}
      {#if !isAdding}
        <div class="p-4 bg-surface-elevated/20 rounded-control border border-dashed border-border text-center"><p class="text-caption text-content-subtle italic">No events scheduled</p></div>
      {/if}
    {/each}
  </div>
</div>
