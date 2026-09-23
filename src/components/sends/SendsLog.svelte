<script lang="ts">
  /**
   * History's Sends tab: every outdoor send, grouped under the trip that
   * covers it (with that trip's projects ticked) or by month. Add and edit
   * here, or import from 8a.nu.
   */
  import { displayGrade } from '../../lib/sends/gradeScale';
  import { trainingState } from '../../lib/state.svelte';
  import { groupSends } from '../../lib/sends/grouping';
  import { tripSummary } from '../../lib/goals/projects';
  import { formatDate } from '../../lib/dateUtils';
  import { formatGoalDates } from '../../lib/goals/goals';
  import type { OutdoorAscent } from '../../lib/types';
  import SendForm from './SendForm.svelte';
  import SendImport from './SendImport.svelte';
  import GradeChart from './GradeChart.svelte';
  import { filterSends, type SendPeriod } from '../../lib/sends/filter';
  import Icon from '@iconify/svelte';

  /** The sends to show - History's filters already applied. `filtered` says whether any filter is on. */
  let { ascents, filtered = false }: { ascents: OutdoorAscent[]; filtered?: boolean } = $props();

  let mode = $state<'list' | 'add' | 'import'>('list');
  let editingId = $state<string | null>(null);

  // The chart's period and tapped grade filter the list too, so the two always agree.
  let period = $state<SendPeriod>('all');
  let selectedGrade = $state<string | null>(null);
  // A grade picked in one scale means nothing in the other.
  $effect(() => {
    trainingState.units.grades;
    selectedGrade = null;
  });
  const inPeriod = $derived(filterSends(ascents, period, null, new Date()));
  const shown = $derived(filterSends(inPeriod, 'all', selectedGrade, new Date(), trainingState.units.grades));
  const groups = $derived(groupSends(shown, trainingState.goals));

  function monthLabel(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  /** A stored (Font) grade in the chosen display scale. */
  const G = (grade: string | undefined) => (grade ? displayGrade(grade, trainingState.units.grades) : '');
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
          {send.name || 'Unnamed'} <span class="text-primary tabular-nums">{G(send.grade)}</span>{send.style ? ` · ${send.style}` : ''}
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

  {#if mode === 'list' && ascents.length > 0}
    <GradeChart ascents={inPeriod} bind:period bind:selectedGrade />
    {#if selectedGrade}
      <div class="flex items-center gap-2 px-1">
        <span class="text-label text-content">Showing {selectedGrade} sends{period === 'year' ? ' from the last 12 months' : ''}</span>
        <button onclick={() => selectedGrade = null} class="px-2 py-0.5 rounded-full border border-border-strong/60 text-caption text-content-subtle hover:text-content flex items-center gap-1">
          <Icon icon="ic:baseline-close" class="text-xs" /> Clear
        </button>
      </div>
    {/if}
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
        <p class="text-caption text-content-subtle italic">
          {filtered && trainingState.outdoorAscents.length > 0 ? 'No sends match the filters.' : selectedGrade ? `No ${selectedGrade} sends${period === 'year' ? ' in the last 12 months' : ''} yet.` : period === 'year' && trainingState.outdoorAscents.length > 0 ? 'No sends in the last 12 months.' : 'No outdoor sends yet - add one, or import your 8a.nu log.'}
        </p>
      </div>
    {/if}
  {/each}
</div>
