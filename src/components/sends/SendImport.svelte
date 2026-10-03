<script lang="ts">
  /**
   * 8a.nu CSV import: every row shown and editable before anything is
   * written. Sends already logged are discarded (listed, collapsed); likely
   * duplicates - a similar name, or a day apart - come unticked with what
   * they look like, so the user decides. See `lib/sends/matching.ts`.
   */
  import { displayGrade, gradeFromInput } from '../../lib/sends/gradeScale';
  import { trainingState } from '../../lib/state.svelte';
  import { parseOutdoorAscentCsv } from '../../lib/importers/outdoorAscentCsvImport';
  import { classifyImport, type ImportRow } from '../../lib/sends/matching';
  import { formatDate } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import type { OutdoorAscent } from '../../lib/types';
  import Icon from '@iconify/svelte';

  let { onDone }: { onDone: () => void } = $props();

  let fileInput = $state<HTMLInputElement>();
  let rows = $state<(ImportRow & { include: boolean })[] | null>(null);
  let skipped = $state<{ line: number; reason: string }[]>([]);
  let editingId = $state<string | null>(null);
  let showDiscarded = $state(false);
  let importing = $state(false);

  const reviewable = $derived((rows ?? []).filter((r) => r.status !== 'duplicate'));
  const discarded = $derived((rows ?? []).filter((r) => r.status === 'duplicate'));
  const selectedCount = $derived(reviewable.filter((r) => r.include).length);
  const maybeCount = $derived(reviewable.filter((r) => r.status === 'maybe').length);

  async function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const parsed = parseOutdoorAscentCsv(await file.text());
    if (parsed.ascents.length === 0 && parsed.skipped.length === 0) {
      await showAlert('Empty File', 'No rows found in this CSV file.');
      return;
    }
    skipped = parsed.skipped;
    rows = classifyImport(parsed.ascents, $state.snapshot(trainingState.outdoorAscents) as OutdoorAscent[])
      .map((r) => ({ ...r, include: r.status === 'new' }));
  }

  function update(id: string, field: keyof OutdoorAscent, value: string) {
    const row = rows?.find((r) => r.ascent.id === id);
    if (!row) return;
    const next = { ...row.ascent };
    if (value.trim()) (next as any)[field] = value.trim();
    else if (field !== 'grade' && field !== 'date') delete (next as any)[field];
    row.ascent = next;
  }

  async function confirm() {
    const chosen = reviewable.filter((r) => r.include && r.ascent.grade && r.ascent.date).map((r) => $state.snapshot(r.ascent) as OutdoorAscent);
    if (chosen.length === 0) return;
    importing = true;
    try {
      await trainingState.addOutdoorAscents(chosen);
      onDone();
    } finally {
      importing = false;
    }
  }

  const cellInput = 'bg-surface text-content p-2 rounded-control border border-border-strong outline-none text-sm min-w-0';

  /** A stored (Font) grade in the chosen display scale. */
  const G = (grade: string | undefined) => (grade ? displayGrade(grade, trainingState.units.grades) : '');
</script>

{#if !rows}
  <div class="p-4 rounded-card border border-dashed border-border-strong/60 space-y-3 text-center">
    <p class="text-caption text-content-subtle">Export your ascents from 8a.nu as CSV, then pick the file. You'll see every send before anything is added.</p>
    <div class="flex gap-2 justify-center">
      <button onclick={() => fileInput?.click()} class="px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-control flex items-center gap-1.5">
        <Icon icon="ic:baseline-upload-file" /> Choose CSV
      </button>
      <button onclick={onDone} class="px-4 py-2.5 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
    </div>
    <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden" onchange={handleFile} />
  </div>
{:else}
  <div class="space-y-3">
    <p class="text-label text-content">
      {reviewable.length - maybeCount} new{maybeCount ? ` · ${maybeCount} maybe` : ''}{discarded.length ? ` · ${discarded.length} already logged` : ''}
    </p>
    {#if skipped.length > 0}
      <details class="text-caption text-warning">
        <summary>{skipped.length} row{skipped.length === 1 ? '' : 's'} could not be read</summary>
        <ul class="text-content-subtle mt-1 space-y-0.5">{#each skipped as s}<li>Line {s.line}: {s.reason}</li>{/each}</ul>
      </details>
    {/if}

    <div class="space-y-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar">
      {#each reviewable as row (row.ascent.id)}
        {@const a = row.ascent}
        <div class="rounded-control border p-2.5 {row.status === 'maybe' ? 'border-warning/40 bg-warning/5' : 'border-border-strong/50 bg-surface-elevated/40'}">
          <div class="flex items-center gap-2.5">
            <input type="checkbox" bind:checked={row.include} class="w-4 h-4 accent-primary shrink-0" aria-label="Import {a.name ?? a.grade}" />
            <div class="min-w-0 flex-1">
              <p class="text-label text-content truncate">{a.name || 'Unnamed'} <span class="text-primary tabular-nums">{G(a.grade)}</span>{a.style ? ` · ${a.style}` : ''}</p>
              <p class="text-caption text-content-subtle truncate">{formatDate(a.date)}{a.crag ? ` · ${a.crag}` : ''}</p>
            </div>
            <button onclick={() => editingId = editingId === a.id ? null : a.id} class="p-1.5 text-content-subtle hover:text-content" aria-label="Edit before importing">
              <Icon icon="ic:baseline-edit" class="text-sm" />
            </button>
          </div>
          {#if row.status === 'maybe' && row.match}
            <p class="text-caption text-warning mt-1.5 pl-6 flex items-start gap-1">
              <Icon icon="ic:baseline-warning-amber" class="text-sm shrink-0 mt-px" />
              <span>Looks like "{row.match.name || 'Unnamed'} {G(row.match.grade)}" ({formatDate(row.match.date)}) - tick it only if it's a different send.</span>
            </p>
          {/if}
          {#if editingId === a.id}
            <div class="grid grid-cols-2 gap-1.5 mt-2">
              <input value={a.name ?? ''} oninput={(e) => update(a.id, 'name', e.currentTarget.value)} placeholder="Name" class="{cellInput} col-span-2" />
              <input value={G(a.grade)} oninput={(e) => update(a.id, 'grade', gradeFromInput(e.currentTarget.value))} placeholder="Grade" class={cellInput} />
              <input value={a.style ?? ''} oninput={(e) => update(a.id, 'style', e.currentTarget.value)} placeholder="Style" class={cellInput} />
              <input value={a.crag ?? ''} oninput={(e) => update(a.id, 'crag', e.currentTarget.value)} placeholder="Crag" class={cellInput} />
              <input type="date" value={a.date.slice(0, 10)} oninput={(e) => update(a.id, 'date', e.currentTarget.value)} class={cellInput} />
            </div>
          {/if}
        </div>
      {:else}
        <p class="text-caption text-content-subtle italic">Nothing new in this file.</p>
      {/each}
    </div>

    {#if discarded.length > 0}
      <div>
        <button onclick={() => showDiscarded = !showDiscarded} class="flex items-center gap-1 text-label text-content-subtle hover:text-content" aria-expanded={showDiscarded}>
          <Icon icon="ic:baseline-chevron-right" class="text-base transition-transform {showDiscarded ? 'rotate-90' : ''}" />
          {discarded.length} already logged (discarded)
        </button>
        {#if showDiscarded}
          <ul class="mt-1.5 space-y-0.5 pl-5 text-caption text-content-subtle">
            {#each discarded as row}<li class="line-through">{row.ascent.name || 'Unnamed'} {G(row.ascent.grade)} · {formatDate(row.ascent.date)}</li>{/each}
          </ul>
        {/if}
      </div>
    {/if}

    <div class="flex gap-2">
      <button onclick={onDone} class="flex-1 py-2.5 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
      <button onclick={confirm} disabled={selectedCount === 0 || importing} class="flex-1 py-2.5 bg-primary text-white text-sm font-bold rounded-control disabled:opacity-40">
        {importing ? 'Importing…' : `Import ${selectedCount}`}
      </button>
    </div>
  </div>
{/if}
