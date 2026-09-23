<script lang="ts">
  /**
   * History's Sends tab: every outdoor send, grouped under the trip that
   * covers it (with that trip's projects ticked) or by month. Add and edit
   * here, or import from 8a.nu.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { groupSends } from '../../lib/sends/grouping';
  import { tripSummary } from '../../lib/goals/projects';
  import { formatDate } from '../../lib/dateUtils';
  import { formatGoalDates } from '../../lib/goals/goals';
  import type { OutdoorAscent } from '../../lib/types';
  import SendForm from './SendForm.svelte';
  import SendImport from './SendImport.svelte';
  import GradeChart from './GradeChart.svelte';
  import Icon from '@iconify/svelte';

  let mode = $state<'list' | 'add' | 'import'>('list');
  let editingId = $state<string | null>(null);

  const groups = $derived(groupSends(trainingState.outdoorAscents, trainingState.goals));

  function monthLabel(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
</script>

{#snippet sendRow(send: OutdoorAscent, project: boolean)}
  {#if editingId === send.id}
    <div class="p-3 rounded-control border border-primary/30 bg-surface-elevated/40">
      <SendForm ascent={send} onDone={() => editingId = null} />
    </div>
  {:else}
    <button onclick={() => editingId = send.id} class="w-full flex items-center gap-3 p-2.5 rounded-control bg-surface-elevated/40 border border-border-strong/40 text-left hover:border-border-strong transition-colors">
      <div class="min-w-0 flex-1">
        <p class="text-label text-content truncate">
          {send.name || 'Unnamed'} <span class="text-primary tabular-nums">{send.grade}</span>{send.style ? ` · ${send.style}` : ''}
        </p>
        <p class="text-caption text-content-subtle truncate">{formatDate(send.date)}{send.crag ? ` · ${send.crag}` : ''}</p>
      </div>
      {#if project}<Icon icon="ic:baseline-star" class="text-primary shrink-0" aria-label="Trip project" />{/if}
    </button>
  {/if}
{/snippet}

<div class="space-y-4">
  <div class="flex gap-2">
    <button onclick={() => mode = mode === 'add' ? 'list' : 'add'} class="flex-1 py-2.5 rounded-control text-label font-bold flex items-center justify-center gap-1.5 {mode === 'add' ? 'bg-primary text-white' : 'bg-surface-elevated/60 text-content border border-border-strong/50'}">
      <Icon icon="ic:baseline-plus" /> Add send
    </button>
    <button onclick={() => mode = mode === 'import' ? 'list' : 'import'} class="flex-1 py-2.5 rounded-control text-label font-bold flex items-center justify-center gap-1.5 {mode === 'import' ? 'bg-primary text-white' : 'bg-surface-elevated/60 text-content border border-border-strong/50'}">
      <Icon icon="ic:baseline-upload-file" /> Import 8a.nu
    </button>
  </div>

  {#if mode === 'add'}
    <div class="p-4 rounded-card border border-primary/30 bg-surface/50">
      <SendForm onDone={() => mode = 'list'} />
    </div>
  {:else if mode === 'import'}
    <div class="p-4 rounded-card border border-primary/30 bg-surface/50">
      <SendImport onDone={() => mode = 'list'} />
    </div>
  {/if}

  {#if mode === 'list' && trainingState.outdoorAscents.length > 0}
    <GradeChart ascents={trainingState.outdoorAscents} />
  {/if}

  {#each groups as group (group.key)}
    <div class="space-y-1.5">
      {#if group.kind === 'trip'}
        {@const summary = tripSummary(group.trip, trainingState.outdoorAscents)}
        {@const projectSendIds = new Set(summary.projects.filter((p) => p.send).map((p) => p.send!.id))}
        <div class="flex items-center gap-2 px-1 pt-1">
          <Icon icon="ic:baseline-terrain" class="text-primary shrink-0" />
          <p class="text-label text-content truncate flex-1">{group.trip.name} <span class="text-content-subtle">· {formatGoalDates(group.trip)}</span></p>
          <span class="text-caption text-content-subtle shrink-0">
            {group.sends.length} send{group.sends.length === 1 ? '' : 's'}{summary.projects.length ? ` · ${summary.projectsDone}/${summary.projects.length} projects` : ''}
          </span>
        </div>
        {#each group.sends as send (send.id)}{@render sendRow(send, projectSendIds.has(send.id))}{/each}
      {:else}
        <p class="text-section uppercase text-content-subtle px-1 pt-1">{monthLabel(group.month)}</p>
        {#each group.sends as send (send.id)}{@render sendRow(send, false)}{/each}
      {/if}
    </div>
  {:else}
    {#if mode === 'list'}
      <div class="p-6 text-center rounded-card border border-dashed border-border">
        <p class="text-caption text-content-subtle italic">No outdoor sends yet - add one, or import your 8a.nu log.</p>
      </div>
    {/if}
  {/each}
</div>
