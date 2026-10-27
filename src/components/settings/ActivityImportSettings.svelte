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
  import { planImport as planDaily } from '../../lib/health/import';
  import { describeValues } from '../../lib/health/garminExport';
  import { storage } from '../../lib/storage';
  import { DEFAULT_METRIC_DEFS, NAP_DURATION_METRIC, SLEEP_DURATION_METRIC, WEARABLE_METRIC_DEFS } from '../../lib/constants';
  import { SOURCE_LABELS, summaryLine } from '../../lib/activity/format';
  import { formatDay } from '../../lib/dateUtils';
  import { showAlert, showConfirm } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import ActionRow from './ActionRow.svelte';
  import type { ExternalActivity } from '../../lib/types';
  import type { ArchiveInfo, ArchivePlan } from '../../lib/health/garminArchive';

  let fileInput = $state<HTMLInputElement>();
  let read = $state<ActivityRead | null>(null);
  let reading = $state<{ done: number; total: number } | null>(null);
  let importing = $state(false);
  let options = $state<ImportOptions>({ ...DEFAULT_IMPORT_OPTIONS });
  let includeDaily = $state(true);
  let includeRefresh = $state(true);
  let keepArchive = $state(true);
  let archivePlan = $state<ArchivePlan | null>(null);
  let archive = $state<ArchiveInfo | null>(null);
  const loadArchive = () => trainingState.garminArchiveInfo().then((info) => (archive = info));
  $effect(() => { void loadArchive(); });
  const megabytes = (bytes: number) => `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`;
  let dailyPlan = $state<ReturnType<typeof planDaily> | null>(null);

  const KNOWN_METRICS = [...DEFAULT_METRIC_DEFS, SLEEP_DURATION_METRIC, NAP_DURATION_METRIC, ...WEARABLE_METRIC_DEFS];
  const metricName = (id: string) => KNOWN_METRICS.find((m) => m.id === id)?.name ?? id;
  const dailySummary = $derived(read ? describeValues(read.daily) : []);
  const monthYear = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

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
  const refreshCount = $derived(plan?.refresh.length ?? 0);
  const archiveChanges = $derived(archivePlan ? archivePlan.add.length + archivePlan.change.length : 0);
  const somethingToDo = $derived(!!plan && (plan.add.length > 0 || (includeDaily && !!dailyPlan?.upserts.length) || (includeRefresh && refreshCount > 0) || (keepArchive && archiveChanges > 0)));
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
      if (result.activities.length === 0 && result.daily.length === 0) {
        await showAlert('Nothing to import', result.skipped[0] ? `${result.skipped[0].where}: ${result.skipped[0].reason}` : 'No activities found in these files.');
        return;
      }
      read = result;
      dailyPlan = result.daily.length ? planDaily(await storage.getDailyMetrics(), result.daily, 'garmin') : null;
      archivePlan = result.archive.length ? await trainingState.planGarminArchive($state.snapshot(result.archive) as typeof result.archive) : null;
    } catch (err) {
      await showAlert('Could not read the files', (err as Error).message);
    } finally {
      reading = null;
    }
  }

  async function runImport() {
    if (!plan || !somethingToDo) return;
    importing = true;
    try {
      const added = plan.add.length ? await trainingState.addExternalActivities($state.snapshot(plan.add) as ExternalActivity[]) : 0;
      const refreshed = includeRefresh && plan.refresh.length ? await trainingState.refreshExternalActivities($state.snapshot(plan.refresh) as ExternalActivity[]) : 0;
      const kept = keepArchive && read ? await trainingState.mergeGarminArchive($state.snapshot(read.archive) as typeof read.archive) : null;
      let days = 0;
      if (includeDaily && dailyPlan && dailyPlan.upserts.length) {
        const entries = $state.snapshot(dailyPlan.upserts) as typeof dailyPlan.upserts;
        const defs = KNOWN_METRICS.filter((d) => entries.some((e) => e.metricId === d.id));
        await trainingState.importDailyMetrics(entries, defs);
        days = entries.length;
      }
      toast.show([added ? `${added} activit${added === 1 ? 'y' : 'ies'} imported` : '', refreshed ? `${refreshed} updated with pace and heart-rate detail` : '', days ? `${days} daily values imported` : '', kept && kept.add.length + kept.change.length ? `${kept.add.length + kept.change.length} Garmin records kept` : ''].filter(Boolean).join(', '));
      void loadArchive();
      read = null;
      dailyPlan = null;
      archivePlan = null;
    } finally {
      importing = false;
    }
  }

  async function removeAll() {
    if (await showConfirm('Remove imported activities?', `All ${stored.length} imported activities are deleted from this app (and from synced devices). Your own sessions are not touched, and you can import the files again.`, { ok: 'Remove', cancel: 'Keep' })) {
      await trainingState.removeExternalActivities(stored.map((a) => a.id));
    }
  }

  async function removeArchive() {
    if (await showConfirm('Remove the kept Garmin data?', `All ${archive?.records ?? 0} records (${megabytes(archive?.bytes ?? 0)}) are deleted from this app and from synced devices. Your imported activities and daily values are not touched, and importing the export again brings the data back.`, { ok: 'Remove', cancel: 'Keep' })) {
      await trainingState.clearGarminArchive();
      await loadArchive();
    }
  }

  const miles = $derived(trainingState.units.wind === 'mph');
  const when = (a: ExternalActivity) => `${formatDay(a.date)} · ${summaryLine(a, miles)}`;
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1 px-1">
    <h2 class="text-section uppercase text-content-muted">Strava, Garmin and files</h2>
    <p class="text-caption text-content-subtle leading-relaxed">
      Pick a Strava archive (the .zip from Settings → My Account → Download or delete your account), a Garmin data export (.zip: garmin.com → Account → Data management → Export your data), or single .fit, .gpx, .tcx or activities.csv files. Runs, rides, walks and workouts are kept as history, with a route where there was GPS; they are not sessions and do not count toward your load. A Garmin export also fills in your sleep, HRV, resting heart rate, steps, stress, Body Battery, VO2max and weight, for as far back as the export goes. Everything is read on this device.
    </p>
  </div>

  {#if reading}
    <p class="text-label text-content-subtle px-1" role="status">Reading… {reading.total ? `${reading.done} of ${reading.total}` : ''}</p>
  {:else if !read}
    <input bind:this={fileInput} type="file" multiple accept=".zip,.csv,.fit,.gpx,.tcx,.gz" class="hidden" onchange={handleFiles} />
    <button onclick={() => fileInput?.click()} class="btn btn-primary w-full">Choose files</button>
  {:else if plan}
    <div class="space-y-2 px-1">
      <p class="text-body font-semibold">{plan.add.length} activit{plan.add.length === 1 ? 'y' : 'ies'} to import</p>
      <p class="text-label text-content-subtle">
        {read.activities.length} found{plan.already.length ? `, ${plan.already.length} already imported` : ''}{read.skipped.length ? `, ${read.skipped.length} skipped` : ''}{withRoute ? `, ${withRoute} with a route` : ''}
      </p>
      {#if byType.length}
        <p class="text-caption text-content-subtle">{byType.map(([t, n]) => `${n} ${t}`).join(' · ')}</p>
      {/if}
    </div>

    {#if refreshCount}
      <div class="space-y-2 px-1">
        <h3 class="text-section uppercase text-content-muted">Already imported</h3>
        <label class="flex items-start gap-3 py-1 min-h-11">
          <input type="checkbox" bind:checked={includeRefresh} class="mt-1" />
          <span class="text-label"><span class="font-semibold">Add pace, splits and heart-rate detail to {refreshCount} activit{refreshCount === 1 ? 'y' : 'ies'}</span><br /><span class="text-caption text-content-subtle">Imported before these existed, or from Strava, which only sends a summary. Only the new detail is added; their name, source and numbers stay.</span></span>
        </label>
      </div>
    {/if}

    {#if archivePlan && read.archive.length}
      <div class="space-y-2 px-1">
        <h3 class="text-section uppercase text-content-muted">Garmin data for later</h3>
        <label class="flex items-start gap-3 py-1 min-h-11">
          <input type="checkbox" bind:checked={keepArchive} class="mt-1" />
          <span class="text-label"><span class="font-semibold">Keep the full Garmin data in the app ({archivePlan.add.length} new{archivePlan.change.length ? `, ${archivePlan.change.length} changed` : ''}{archivePlan.same ? `, ${archivePlan.same} already kept` : ''})</span><br /><span class="text-caption text-content-subtle">Every row of the export's activity, sleep, stress, Body Battery, skin temperature, heart-rate and similar files, unchanged, so detail the app does not show yet is not lost. It is stored with your other data (backups, and sync if it is on), adds several MB, and is never duplicated by importing again. Your profile, contacts, devices and the recordings themselves are not kept.</span></span>
        </label>
      </div>
    {/if}

    {#if dailySummary.length}
      <div class="space-y-2 px-1">
        <h3 class="text-section uppercase text-content-muted">Daily health data</h3>
        <label class="flex items-start gap-3 py-1 min-h-11">
          <input type="checkbox" bind:checked={includeDaily} class="mt-1" />
          <span class="text-label"><span class="font-semibold">Import {dailyPlan?.upserts.length ?? 0} daily values</span><br /><span class="text-caption text-content-subtle">They feed readiness, the recovery chart and insights. A day you typed yourself, or Health Connect already filled, is never replaced{dailyPlan?.keptManual ? ` (${dailyPlan.keptManual} kept)` : ''}.</span></span>
        </label>
        <ul class="text-caption text-content-subtle space-y-0.5">
          {#each dailySummary as m (m.metricId)}<li>{metricName(m.metricId)}: {m.days} days, {monthYear(m.from)} – {monthYear(m.to)}</li>{/each}
        </ul>
      </div>
    {/if}

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
      <button onclick={runImport} disabled={importing || !somethingToDo} class="btn btn-primary flex-1">{importing ? 'Importing…' : 'Import'}</button>
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

{#if archive && archive.records > 0}
  <div class="card space-y-2 mt-4">
    <h2 class="text-section uppercase text-content-muted px-1">Garmin data kept ({archive.records} records, {megabytes(archive.bytes)})</h2>
    <p class="text-caption text-content-subtle px-1">{archive.kinds.map((k) => `${k.records} ${k.kind}`).join(' · ')}</p>
    <ActionRow icon="ic:baseline-delete-sweep" title="Remove the kept Garmin data" hint="Your activities and daily values stay; importing the export again brings it back" tone="danger" onclick={removeArchive} />
  </div>
{/if}
