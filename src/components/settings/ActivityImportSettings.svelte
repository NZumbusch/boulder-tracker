<script lang="ts">
  /**
   * Import activities from a Strava export: pick `activities.csv` from the
   * archive, see what it would add, then import. Parser and dedupe:
   * `lib/importers/stravaCsvImport.ts`. Imported activities are history only.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { parseStravaCsv, planStravaImport, type StravaImportResult } from '../../lib/importers/stravaCsvImport';
  import { formatDate } from '../../lib/dateUtils';
  import { showAlert, showConfirm } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import ActionRow from './ActionRow.svelte';
  import type { ExternalActivity } from '../../lib/types';

  let fileInput = $state<HTMLInputElement>();
  let parsed = $state<StravaImportResult | null>(null);
  let fileName = $state('');
  let importing = $state(false);

  const stored = $derived(trainingState.externalActivities);
  const plan = $derived(parsed ? planStravaImport(stored, parsed.activities) : null);
  const byType = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const a of plan?.add ?? []) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  const recent = $derived([...stored].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8));

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = parseStravaCsv(await file.text());
      if (result.activities.length === 0) {
        await showAlert('Nothing to import', result.skipped[0]?.reason ?? 'No activities found in this file. Pick the activities.csv from your Strava export.');
        return;
      }
      fileName = file.name;
      parsed = result;
    } catch {
      await showAlert('Could not read the file', 'Pick the activities.csv from your Strava export.');
    } finally {
      input.value = '';
    }
  }

  async function runImport() {
    if (!plan || plan.add.length === 0) return;
    importing = true;
    try {
      const added = await trainingState.addExternalActivities($state.snapshot(plan.add) as ExternalActivity[]);
      toast.show(`Imported ${added} activit${added === 1 ? 'y' : 'ies'}`);
      parsed = null;
    } finally {
      importing = false;
    }
  }

  async function removeAll() {
    if (await showConfirm('Remove imported activities?', `All ${stored.length} imported activities are deleted from this app (and from synced devices). Your own sessions are not touched, and you can import the file again.`, { ok: 'Remove', cancel: 'Keep' })) {
      await trainingState.removeExternalActivities(stored.map((a) => a.id));
    }
  }

  const duration = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min` : `${Math.round(sec / 60)} min`);
  const detail = (a: ExternalActivity) => [a.type, a.durationSec ? duration(a.durationSec) : '', a.distanceM ? `${(a.distanceM / 1000).toFixed(1)} km` : ''].filter(Boolean).join(' · ');
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1 px-1">
    <h2 class="text-section uppercase text-content-muted">Strava export</h2>
    <p class="text-caption text-content-subtle leading-relaxed">
      Strava on the web → Settings → My Account → Download or delete your account → Request your archive. When the email arrives, unzip it and pick <strong>activities.csv</strong> here. Runs, rides, hikes and the rest are kept as history; they are not sessions and do not count toward your load. Importing the same file again adds nothing twice.
    </p>
  </div>

  {#if !parsed}
    <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden" onchange={handleFile} />
    <button onclick={() => fileInput?.click()} class="btn btn-primary w-full">Choose activities.csv</button>
  {:else if plan}
    <div class="space-y-2 px-1">
      <p class="text-body font-semibold">{fileName}</p>
      <p class="text-label text-content-subtle">
        {plan.add.length} new{plan.already ? `, ${plan.already} already imported` : ''}{parsed.skipped.length ? `, ${parsed.skipped.length} skipped` : ''}
      </p>
      {#if byType.length}
        <p class="text-caption text-content-subtle">{byType.map(([t, n]) => `${n} ${t}`).join(' · ')}</p>
      {/if}
      {#if parsed.skipped.length}
        <details class="text-caption text-content-subtle">
          <summary class="cursor-pointer">Why were some skipped?</summary>
          <ul class="mt-1 space-y-0.5">
            {#each parsed.skipped.slice(0, 20) as s}<li>Line {s.line}: {s.reason}</li>{/each}
          </ul>
        </details>
      {/if}
    </div>
    <div class="flex gap-2">
      <button onclick={() => (parsed = null)} class="btn btn-secondary flex-1">Cancel</button>
      <button onclick={runImport} disabled={importing || plan.add.length === 0} class="btn btn-primary flex-1">
        {importing ? 'Importing…' : `Import ${plan.add.length}`}
      </button>
    </div>
  {/if}
</div>

{#if stored.length}
  <div class="card space-y-2 mt-4">
    <h2 class="text-section uppercase text-content-muted px-1">Imported ({stored.length})</h2>
    <ul class="divide-y divide-border/50">
      {#each recent as a (a.id)}
        <li class="py-2 px-1">
          <p class="text-body truncate">{a.name}</p>
          <p class="text-caption text-content-subtle">{formatDate(a.date)} · {detail(a)}</p>
        </li>
      {/each}
    </ul>
    <ActionRow icon="ic:baseline-delete-sweep" title="Remove all imported activities" tone="danger" onclick={removeAll} />
  </div>
{/if}
