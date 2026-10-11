<script lang="ts">
  /**
   * "Get started": the first few steps, ticked from what's in the app
   * (lib/home/starterChecklist.ts). Gone once they're done, closed, or the
   * person has a few sessions behind them. Also the way into the example
   * data for anyone who'd rather see the app full first.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../../lib/state.svelte';
  import { driveSync } from '../../../lib/sync/driveSync.svelte';
  import { tour } from '../../../lib/tour/tour.svelte';
  import { checklistState } from '../../../lib/home/checklistState.svelte';
  import { buildChecklist, type ChecklistItemId } from '../../../lib/home/starterChecklist';
  import SectionHeader from './SectionHeader.svelte';

  let { onBodyweight }: { onBodyweight: () => void } = $props();

  const checklist = $derived(
    buildChecklist({
      workouts: trainingState.workouts,
      dailyMetrics: trainingState.dailyMetrics,
      benchmarks: trainingState.benchmarks,
      painLogs: trainingState.painLogs,
      outdoorAscents: trainingState.outdoorAscents,
      trainingBlocks: trainingState.trainingBlocks,
      goals: trainingState.goals,
      tourSeen: checklistState.tourSeen,
      dismissed: checklistState.dismissed,
      syncAvailable: driveSync.available,
      syncConnected: driveSync.connected,
    }),
  );

  function go(id: ChecklistItemId) {
    if (id === 'plan' || id === 'goal') trainingState.navigate('plan');
    else if (id === 'session') trainingState.navigate('add');
    else if (id === 'metric') onBodyweight();
    else if (id === 'tour') void tour.start();
    else trainingState.navigate('settings');
  }
</script>

{#if checklist.visible && !trainingState.demoActive}
  <div class="card space-y-3 animate-in fade-in">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <SectionHeader label="Get started" subtitle="{checklist.doneCount} of {checklist.total} done" />
      </div>
      <button onclick={() => checklistState.dismiss()} class="p-1 -mr-1 text-content-subtle hover:text-content shrink-0" aria-label="Hide this card for good">
        <Icon icon="ic:baseline-close" class="text-lg" />
      </button>
    </div>

    <div class="divide-y divide-border">
      {#each checklist.items as item (item.id)}
        <button onclick={() => go(item.id)} class="w-full flex items-center gap-3 py-2.5 text-left group">
          <span class="w-5 h-5 shrink-0 rounded-full border flex items-center justify-center {item.done ? 'bg-success border-success text-app-bg' : 'border-border-strong'}" aria-hidden="true">
            {#if item.done}<Icon icon="ic:baseline-check" class="text-sm" />{/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-body {item.done ? 'text-content-subtle line-through' : 'text-content group-hover:text-primary'} transition-colors">{item.label}{item.optional ? ' (optional)' : ''}</span>
            {#if !item.done}<span class="block text-caption text-content-subtle">{item.hint}</span>{/if}
          </span>
          {#if !item.done}<Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />{/if}
        </button>
      {/each}
    </div>

    <button onclick={() => void tour.startExample()} class="text-caption text-primary">Or look around with example data first</button>
  </div>
{/if}
