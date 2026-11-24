<script lang="ts">
  /**
   * Settings -> About & Help: the data log (lib/storage/dataLog.ts) - every
   * read and save of the stored data, the disk writes, sync, the live
   * session, refused changes and safety backups. For tracing "where did my
   * session go": share it as a file into a bug report.
   */
  import { readDataLog, clearDataLog, dataLogText, onDataLog } from '../../lib/storage/dataLogStore';
  import { formatEntry, type DataLogEntry, type DataLogKind } from '../../lib/storage/dataLog';
  import { webSafetyBackups } from '../../lib/storage/safetyBackup';
  import { saveFile } from '../../lib/share/saveFile';
  import { localIsoDate } from '../../lib/dateUtils';
  import { toast } from '../../lib/toast.svelte';
  import { showConfirm } from '../../lib/utils';
  import Icon from '@iconify/svelte';
  import Segmented from '../ui/Segmented.svelte';

  type Filter = 'all' | 'saves' | 'sessions' | 'safety';
  const GROUPS: Record<Exclude<Filter, 'all'>, DataLogKind[]> = {
    saves: ['load', 'write', 'disk'],
    sessions: ['session', 'sync', 'app'],
    safety: ['guard', 'backup', 'error'],
  };
  const DOT: Record<DataLogKind, string> = {
    load: 'bg-content-subtle', call: 'bg-border', write: 'bg-primary', disk: 'bg-primary/50',
    guard: 'bg-danger', backup: 'bg-success', sync: 'bg-warning/70', session: 'bg-warning', app: 'bg-content-subtle', error: 'bg-danger',
  };
  const PAGE = 40;

  let entries = $state<DataLogEntry[]>([]);
  let filter = $state<Filter>('all');
  let count = $state(PAGE);
  let expanded = $state<string | null>(null);
  let webBackups = $state<{ name: string; content: string }[]>([]);

  const load = async () => { entries = [...(await readDataLog())]; };
  $effect(() => {
    void load();
    void webSafetyBackups().then((b) => (webBackups = b));
    // New entries arrive constantly (this card's own reads are logged too): refresh at most once a second.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const stop = onDataLog(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = undefined; void load(); }, 1000);
    });
    return () => { stop(); if (pending) clearTimeout(pending); };
  });

  const newestFirst = $derived([...entries].reverse());
  const shown = $derived.by(() => {
    if (filter === 'all') return newestFirst;
    const kinds = GROUPS[filter];
    return newestFirst.filter((e) => kinds.includes(e.kind));
  });
  const visible = $derived(shown.slice(0, count));
  const problems = $derived(entries.filter((e) => e.kind === 'guard' || e.kind === 'error').length);
  const keyOf = (e: DataLogEntry) => `${e.at}|${e.kind}|${e.msg.slice(0, 80)}`;

  async function share() {
    const text = `${navigator.userAgent}\n\n${await dataLogText()}`;
    const outcome = await saveFile({ content: text, fileName: `boulder-tracker-data-log-${localIsoDate()}.txt`, mimeType: 'text/plain', title: 'Boulder Tracker data log' });
    if (outcome === 'failed') toast.show("Couldn't save the log on this device");
  }

  async function copyShown() {
    try {
      await navigator.clipboard.writeText(shown.slice(0, 500).reverse().map(formatEntry).join('\n'));
      toast.show(shown.length > 500 ? 'Copied the newest 500 - share the file for all of it' : 'Copied');
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }

  async function clear() {
    if (!(await showConfirm('Clear the data log?', 'It is what shows how your data changed, when something goes missing. Share it first if you might still need it.', { ok: 'Clear log', cancel: 'Keep it' }))) return;
    await clearDataLog();
    expanded = null;
    await load();
  }

  async function saveWebBackup(b: { name: string; content: string }) {
    await saveFile({ content: b.content, fileName: b.name, mimeType: 'application/json', title: 'Boulder Tracker safety backup' });
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1">
    <h2 class="text-section uppercase text-content-muted">Data log</h2>
    <p class="text-caption text-content-subtle">
      Everything that reads or changes your data - each save with what it changed, the writes to the phone's storage, sync, live sessions - kept on this device apart from the data itself.
      A change that would turn a logged session back into a planned one is refused and noted here, and a safety backup is written before big changes (Android: Documents/BoulderTracker/safety).
    </p>
  </div>

  {#if entries.length === 0}
    <p class="text-caption text-content-subtle italic">Nothing logged yet.</p>
  {:else}
    <p class="text-caption text-content-subtle">
      {entries.length.toLocaleString()} entries since {new Date(entries[0].at).toLocaleString()}{problems ? ` · ${problems} refused or failed` : ''}
    </p>
    <Segmented
      label="Show"
      value={filter}
      onChange={(v) => { filter = v; count = PAGE; }}
      options={[{ value: 'all', label: 'All' }, { value: 'saves', label: 'Saves' }, { value: 'sessions', label: 'Activity' }, { value: 'safety', label: 'Safety' }]}
    />

    {#if shown.length === 0}
      <p class="text-caption text-content-subtle italic">Nothing of this kind logged.</p>
    {:else}
      <ul class="divide-y divide-border">
        {#each visible as e (keyOf(e))}
          <li>
            <button onclick={() => expanded = expanded === keyOf(e) ? null : keyOf(e)} class="w-full text-left py-2 min-h-11 flex gap-2.5" aria-expanded={expanded === keyOf(e)}>
              <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 {DOT[e.kind]}"><span class="sr-only">{e.kind}</span></span>
              <span class="min-w-0 flex-1">
                <span class="block text-caption text-content-subtle tabular-nums truncate">
                  {new Date(e.at).toLocaleString()} · {e.kind}{e.n && e.n > 1 ? ` · ×${e.n}` : ''}{e.ops?.length ? ` · ${e.ops.join(' › ')}` : ''}
                </span>
                <span class="block text-caption text-content break-words {expanded === keyOf(e) ? '' : 'line-clamp-2'}">{e.msg}</span>
                {#if expanded === keyOf(e) && e.data !== undefined}
                  <span class="block mt-1 text-caption leading-snug font-mono text-content-subtle whitespace-pre-wrap break-all">{JSON.stringify(e.data, null, 1)}</span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
      {#if shown.length > visible.length}
        <button onclick={() => count += PAGE * 5} class="btn btn-ghost w-full">Show more ({(shown.length - visible.length).toLocaleString()} older)</button>
      {/if}
    {/if}

    <div class="flex flex-wrap gap-2">
      <button onclick={share} class="btn btn-secondary flex-1 gap-1.5">
        <Icon icon="ic:baseline-share" class="text-base" /> Share as a file
      </button>
      <button onclick={copyShown} class="btn btn-secondary flex-1 gap-1.5">
        <Icon icon="ic:baseline-content-copy" class="text-base" /> Copy
      </button>
      <button onclick={clear} class="btn btn-ghost hover:text-danger">Clear</button>
    </div>
  {/if}

  {#if webBackups.length > 0}
    <div class="space-y-2">
      <span class="text-label text-content-subtle block">Safety backups in this browser</span>
      {#each [...webBackups].reverse() as b (b.name)}
        <button onclick={() => saveWebBackup(b)} class="btn btn-ghost w-full justify-start gap-1.5 text-caption">
          <Icon icon="ic:baseline-download" class="text-base shrink-0" /> <span class="truncate">{b.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
