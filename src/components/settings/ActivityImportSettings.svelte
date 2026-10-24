<script lang="ts">
  /**
   * Import activities (Settings → Data & connections): a Strava archive, a
   * Garmin export, or single FIT / GPX / TCX / CSV files. Everything is read
   * on this device (`lib/importers/activityFiles.ts`), checked against what
   * is already here (`lib/activity/overlap.ts`) and previewed before anything
   * is saved. Imported activities are history: they show on History's
   * Activities tab and never count toward load.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { readActivityFiles, type ActivityRead } from '../../lib/importers/activityFiles';
  import { DEFAULT_IMPORT_OPTIONS, planImport, type ImportOptions } from '../../lib/activity/overlap';
  import { SOURCE_LABELS, summaryLine } from '../../lib/activity/format';
  import { formatDay } from '../../lib/dateUtils';
  import { showAlert, showConfirm } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import ActionRow from './ActionRow.svelte';
  import type { ExternalActivity } from '../../lib/types';

  let fileInput = $state<HTMLInputElement>();
  let read = $state<ActivityRead | null>(null);
  let reading = $state<{ done: number; total: number } | null>(null);
  let importing = $state(false);
  let options = $state<ImportOptions>({ ...DEFAULT_IMPORT_OPTIONS });

  const stored = $derived(trainingState.externalActivities);

  const plan = $derived.by(() => {
    if (!read) return null;
    const cache = new Map<string, ReturnType<typeof trainingState.workoutsOnDays>>();
    const around = (days: string[]) => {
      const key = days.join();
      if (!cache.has(key)) cache.set(key, trainingState.workoutsOnDays(days));
      return cache.get(key)!;
    };
    return planImport(stored, read.activities, around, (w) => w.notes || 'Session', options, (w) => trainingState.sessionText(w));
  });
  const withRoute = $derived((plan?.add ?? []).filter((a) => a.track).length);
  const byType = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const a of plan?.add ?? []) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  const bySource = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const a of stored) counts.set(SOURCE_LABELS[a.source], (counts.get(SOURCE_LABELS[a.source]) ?? 0) + 1);
    return [...counts].map(([s, n]) => `${n} ${s}`).join(' · ');
  });

  async function handleFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!files.length) return;
    reading = { done: 0, total: 0 };
    try {
      const result = await readActivityFiles(files, (done, total) => (reading = { done, total }));
      if (result.activities.length === 0) {
        await showAlert('Nothing to import', result.skipped[0] ? `${result.skipped[0].where}: ${result.skipped[0].reason}` : 'No activities found in these files.');
        return;
      }
      read = result;
    } catch (err) {
      await showAlert('Could not read the files', (err as Error).message);
    } finally {
      reading = null;
    }
  }

  async function runImport() {
    if (!plan || plan.add.length === 0) return;
    importing = true;
    try {
      const added = await trainingState.addExternalActivities($state.snapshot(plan.add) as ExternalActivity[]);
      toast.show(`Imported ${added} activit${added === 1 ? 'y' : 'ies'}`);
      read = null;
    } finally {
      importing = false;
    }
  }

  async function removeAll() {
    if (await showConfirm('Remove imported activities?', `All ${stored.length} imported activities are deleted from this app (and from synced devices). Your own sessions are not touched, and you can import the files again.`, { ok: 'Remove', cancel: 'Keep' })) {
      await trainingState.removeExternalActivities(stored.map((a) => a.id));
    }
  }

  const miles = $derived(trainingState.units.wind === 'mph');
  const when = (a: ExternalActivity) => `${formatDay(a.date)} · ${summaryLine(a, miles)}`;
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1 px-1">
    <h2 class="text-section uppercase text-content-muted">Strava, Garmin and files</h2>
    <p class="text-caption text-content-subtle leading-relaxed">
      Pick a Strava archive (the .zip from Settings → My Account → Download or delete your account), a Garmin data export (.zip), or single .fit, .gpx, .tcx or activities.csv files. Runs, rides, walks and workouts are kept as history, with a route where there was GPS. They are not sessions and do not count toward your load. Everything is read on this device.
    </p>
  </div>

  {#if reading}
    <p class="text-label text-content-subtle px-1" role="status">Reading… {reading.total ? `${reading.done} of ${reading.total}` : ''}</p>
  {:else if !read}
    <input bind:this={fileInput} type="file" multiple accept=".zip,.csv,.fit,.gpx,.tcx,.gz" class="hidden" onchange={handleFiles} />
    <button onclick={() => fileInput?.click()} class="btn btn-primary w-full">Choose files</button>
  {:else if plan}
    <div class="space-y-2 px-1">
      <p class="text-body font-semibold">{plan.add.length} to import</p>
      <p class="text-label text-content-subtle">
        {read.activities.length} found{plan.already.length ? `, ${plan.already.length} already imported` : ''}{read.skipped.length ? `, ${read.skipped.length} skipped` : ''}{withRoute ? `, ${withRoute} with a route` : ''}
      </p>
      {#if byType.length}
        <p class="text-caption text-content-subtle">{byType.map(([t, n]) => `${n} ${t}`).join(' · ')}</p>
      {/if}
    </div>

    {#if plan.duplicates.length || plan.logged.length || plan.planned.length}
      <div class="space-y-2 px-1">
        <h3 class="text-section uppercase text-content-muted">Overlaps</h3>

        {#if plan.duplicates.length}
          <label class="flex items-start gap-3 py-1 min-h-11">
            <input type="checkbox" bind:checked={options.skipDuplicates} class="mt-1" />
            <span class="text-label"><span class="font-semibold">Skip {plan.duplicates.length} already imported from another source</span><br /><span class="text-caption text-content-subtle">Same time as an activity you imported before (for example Strava and Garmin both have the run).</span></span>
          </label>
          <details class="text-caption text-content-subtle">
            <summary class="cursor-pointer">Which?</summary>
            <ul class="mt-1 space-y-0.5">{#each plan.duplicates.slice(0, 30) as d}<li>{d.activity.name} · {when(d.activity)} ↔ {d.with.label}</li>{/each}</ul>
          </details>
        {/if}

        {#if plan.logged.length}
          <label class="flex items-start gap-3 py-1 min-h-11">
            <input type="checkbox" bind:checked={options.skipLogged} class="mt-1" />
            <span class="text-label"><span class="font-semibold">Skip {plan.logged.filter((l) => l.with.how === 'time').length} that match a session you logged</span><br /><span class="text-caption text-content-subtle">Same time as a done session. A session matched only by day and kind ("Easy run") is never skipped.</span></span>
          </label>
          <details class="text-caption text-content-subtle">
            <summary class="cursor-pointer">Which?</summary>
            <ul class="mt-1 space-y-0.5">{#each plan.logged.slice(0, 30) as d}<li>{d.activity.name} · {when(d.activity)} ↔ {d.with.label}{d.with.how === 'day' ? ' (same day, kept)' : ''}</li>{/each}</ul>
          </details>
        {/if}

        {#if plan.planned.length}
          <p class="text-caption text-content-subtle">{plan.planned.length} overlap a planned session. They are imported, and say so in History.</p>
        {/if}
      </div>
    {/if}

    {#if read.skipped.length}
      <details class="px-1 text-caption text-content-subtle">
        <summary class="cursor-pointer">{read.skipped.length} skipped files or rows</summary>
        <ul class="mt-1 space-y-0.5">{#each read.skipped.slice(0, 20) as s}<li>{s.where}: {s.reason}</li>{/each}</ul>
      </details>
    {/if}

    <div class="flex gap-2">
      <button onclick={() => (read = null)} class="btn btn-secondary flex-1">Cancel</button>
      <button onclick={runImport} disabled={importing || plan.add.length === 0} class="btn btn-primary flex-1">{importing ? 'Importing…' : `Import ${plan.add.length}`}</button>
    </div>
  {/if}
</div>

{#if stored.length}
  <div class="card space-y-2 mt-4">
    <h2 class="text-section uppercase text-content-muted px-1">Imported ({stored.length})</h2>
    <p class="text-caption text-content-subtle px-1">{bySource}</p>
    <ActionRow icon="ic:baseline-directions-run" title="See them in History" hint="History → Activities" onclick={() => { trainingState.uiStore.historyTab = 'activities'; trainingState.navigate('history'); }} />
    <ActionRow icon="ic:baseline-delete-sweep" title="Remove all imported activities" tone="danger" onclick={removeAll} />
  </div>
{/if}
