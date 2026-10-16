<script lang="ts">
  import ListRow from '../common/ListRow.svelte';
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
  import { sendStats } from '../../lib/sends/stats';
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
    <div class="py-3">
      <SendForm ascent={send} onDone={() => editingId = null} />
    </div>
  {:else}
    <ListRow
      title={send.name || 'Unnamed'}
      meta={[formatDate(send.date), send.style, send.crag].filter(Boolean).join(' · ')}
      value={G(send.grade)}
      onclick={() => editingId = send.id}
    >
      {#snippet trailing()}
        {#if project}<span role="img" aria-label="Trip project" class="shrink-0 grid"><Icon icon="ic:baseline-star" class="text-primary" /></span>{/if}
      {/snippet}
    </ListRow>
  {/if}
{/snippet}

<div class="space-y-4">
  <div class="flex gap-2">
    <button onclick={() => mode = mode === 'add' ? 'list' : 'add'} aria-pressed={mode === 'add'} class="btn transition-colors {mode === 'add' ? 'btn-secondary' : 'btn-primary'}">
      {#if mode === 'add'}<Icon icon="ic:baseline-close" class="text-base" /> Close{:else}Add send{/if}
    </button>
    <button onclick={() => mode = mode === 'import' ? 'list' : 'import'} aria-pressed={mode === 'import'} class="btn transition-colors {mode === 'import' ? 'btn-secondary' : 'btn-ghost'}">
      <Icon icon="ic:baseline-upload-file" class="text-base" /> {mode === 'import' ? 'Close import' : 'Import from 8a.nu'}
    </button>
  </div>

  {#if mode === 'add'}
    <div class="card">
      <SendForm onDone={() => mode = 'list'} />
    </div>
  {:else if mode === 'import'}
    <div class="card">
      <SendImport onDone={() => mode = 'list'} />
    </div>
  {/if}

  {#if mode === 'list' && ascents.length > 0}
    {@const stats = sendStats(inPeriod)}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      <div class="px-3 py-2 rounded-control bg-surface-elevated/40"><p class="text-caption text-content-subtle leading-tight">Sends</p><p class="text-body font-semibold text-content tabular-nums">{stats.count}</p></div>
      <div class="px-3 py-2 rounded-control bg-surface-elevated/40"><p class="text-caption text-content-subtle leading-tight">First go</p><p class="text-body font-semibold text-content tabular-nums">{stats.firstGoRate !== undefined ? `${Math.round(stats.firstGoRate * 100)}%` : '–'}</p></div>
      <div class="px-3 py-2 rounded-control bg-surface-elevated/40"><p class="text-caption text-content-subtle leading-tight">Hardest</p><p class="text-body font-semibold text-content tabular-nums">{stats.hardest ? G(stats.hardest.grade) : '–'}</p></div>
      <div class="px-3 py-2 rounded-control bg-surface-elevated/40"><p class="text-caption text-content-subtle leading-tight">Hardest flash</p><p class="text-body font-semibold text-content tabular-nums">{stats.hardestFirstGo ? G(stats.hardestFirstGo.grade) : '–'}</p></div>
    </div>
    <GradeChart ascents={inPeriod} bind:period bind:selectedGrade />
    {#if selectedGrade}
      <div class="flex items-center gap-2 px-1">
        <span class="text-label text-content">Showing {selectedGrade} sends{period === 'year' ? ' from the last 12 months' : ''}</span>
        <button onclick={() => selectedGrade = null} class="btn btn-ghost px-3">
          <Icon icon="ic:baseline-close" class="text-base" /> Clear
        </button>
      </div>
    {/if}
  {/if}

  {#each groups as group (group.key)}
    <div class="card space-y-1">
      {#if group.kind === 'trip'}
        {@const summary = tripSummary(group.trip, trainingState.outdoorAscents)}
        {@const projectSendIds = new Set(summary.projects.filter((p) => p.send).map((p) => p.send!.id))}
        <div class="flex items-center gap-2">
          <Icon icon="ic:baseline-terrain" class="text-primary shrink-0" />
          <p class="text-section uppercase text-content-muted truncate flex-1">{group.trip.name} <span class="normal-case tracking-normal font-normal text-content-subtle">{` · ${formatGoalDates(group.trip)}`}</span></p>
          <span class="text-caption text-content-subtle shrink-0">
            {group.sends.length} send{group.sends.length === 1 ? '' : 's'}{summary.projects.length ? ` · ${summary.projectsDone}/${summary.projects.length} projects` : ''}
          </span>
        </div>
        <div class="divide-y divide-border">{#each group.sends as send (send.id)}{@render sendRow(send, projectSendIds.has(send.id))}{/each}</div>
      {:else}
        <p class="text-section uppercase text-content-muted">{monthLabel(group.month)}</p>
        <div class="divide-y divide-border">{#each group.sends as send (send.id)}{@render sendRow(send, false)}{/each}</div>
      {/if}
    </div>
  {:else}
    {#if mode === 'list'}
      <div class="py-8 text-center space-y-3">
        <p class="text-body text-content-subtle">
          {filtered && trainingState.outdoorAscents.length > 0 ? 'No sends match the filters.' : selectedGrade ? `No ${selectedGrade} sends${period === 'year' ? ' in the last 12 months' : ''} yet.` : period === 'year' && trainingState.outdoorAscents.length > 0 ? 'No sends in the last 12 months.' : 'No outdoor sends yet. Add one, or import your 8a.nu log.'}
        </p>
        {#if trainingState.outdoorAscents.length === 0}
          <button onclick={() => (mode = 'add')} class="btn btn-primary mx-auto"><Icon icon="ic:baseline-plus" class="text-base" /> Add your first send</button>
        {/if}
      </div>
    {/if}
  {/each}
</div>
