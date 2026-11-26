<script lang="ts">
  /**
   * The log, full screen (lib/log; docs/logging.md): newest first, a search,
   * four views - Problems, Activity, Data, Everything - and one file to share
   * when something went wrong. Tap an entry for its details (a stack, a
   * refused session kept whole).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { formatClockDate } from '../../lib/timeFormat';
  import { portal } from '../../lib/ui/portal';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { readLog, clearLog, onLog, formatEntry, matchesFilter, matchesQuery, type LogEntry, type LogFilter, type LogLevel } from '../../lib/log';
  import { saveFile } from '../../lib/share/saveFile';
  import { localIsoDate } from '../../lib/dateUtils';
  import { dayOf, dayHeading } from '../../lib/log/when';
  import { toast } from '../../lib/toast.svelte';
  import { showConfirm } from '../../lib/utils';
  import Icon from '@iconify/svelte';
  import Segmented from '../ui/Segmented.svelte';

  let { onClose, initialFilter = 'activity' }: { onClose: () => void; initialFilter?: LogFilter } = $props();

  const PAGE = 200;
  let entries = $state<LogEntry[]>([]);
  let query = $state('');
  // svelte-ignore state_referenced_locally
  let filter = $state<LogFilter>(initialFilter);
  let count = $state(PAGE);
  let open = $state<string | null>(null);

  const load = async () => { entries = [...(await readLog())]; };
  $effect(() => {
    void load();
    // New entries come all the time (opening this logs a screen line too): re-read at most once a second.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const stop = onLog(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = undefined; void load(); }, 1000);
    });
    return () => { stop(); if (pending) clearTimeout(pending); };
  });

  const shown = $derived.by(() => {
    const out: LogEntry[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (matchesFilter(e, filter) && matchesQuery(e, query)) out.push(e);
    }
    return out;
  });
  const visible = $derived(shown.slice(0, count));
  const keyOf = (e: LogEntry, i: number) => `${e.at}|${i}`;

  const TONE: Record<LogLevel, string> = { error: 'text-danger', warn: 'text-warning', info: 'text-content', debug: 'text-content-subtle' };
  const TAG: Record<LogLevel, string> = { error: 'ERR', warn: 'WRN', info: 'INF', debug: 'DBG' };
  const time = (at: string) => formatClockDate(new Date(at), trainingState.clock12, true);

  async function share() {
    const text = `${navigator.userAgent}\n\n${(await readLog()).map(formatEntry).join('\n')}`;
    const outcome = await saveFile({ content: text, fileName: `boulder-tracker-log-${localIsoDate()}.txt`, mimeType: 'text/plain', title: 'Boulder Tracker log' });
    if (outcome === 'failed') toast.show("Couldn't save the log on this device");
  }

  async function copy() {
    const lines = shown.slice(0, 500).reverse().map(formatEntry);
    try {
      await navigator.clipboard.writeText([navigator.userAgent, ...lines].join('\n'));
      toast.show(shown.length > 500 ? 'Copied the newest 500 - share the file for all of it' : `Copied ${lines.length} entries`);
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }

  async function clear() {
    if (!(await showConfirm('Clear the log?', `All ${entries.length.toLocaleString()} entries are removed from this device. It is what shows what happened when something goes missing - share it first if you might need it.`, { ok: 'Clear log', cancel: 'Keep it' }))) return;
    await clearLog();
    open = null;
    await load();
  }

  backWhile(() => true, () => onClose());
</script>

<div use:portal class="fixed inset-0 z-[125] safe-y bg-app-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Log">
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-2xl mx-auto w-full px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-center gap-1">
        <button onclick={onClose} class="btn-icon -ml-2" aria-label="Close">
          <Icon icon="ic:baseline-arrow-back" class="text-2xl" />
        </button>
        <div class="min-w-0 flex-1 ml-2">
          <h2 class="text-title text-content">Log</h2>
          <p class="text-caption text-content-subtle">{shown.length.toLocaleString()} of {entries.length.toLocaleString()} · this device</p>
        </div>
        <button onclick={share} class="btn-icon" aria-label="Share the whole log as a file" title="Share as a file">
          <Icon icon="ic:baseline-share" class="text-xl" />
        </button>
        <button onclick={copy} class="btn-icon" aria-label="Copy the shown entries" title="Copy">
          <Icon icon="ic:baseline-content-copy" class="text-xl" />
        </button>
        <button onclick={clear} class="btn-icon -mr-2 hover:text-danger" aria-label="Clear the log" title="Clear">
          <Icon icon="ic:baseline-delete" class="text-xl" />
        </button>
      </div>
      <input bind:value={query} oninput={() => (count = PAGE)} type="search" placeholder="Search" aria-label="Search the log" class="field w-full" />
      <Segmented
        label="Show"
        full
        value={filter}
        onChange={(v) => { filter = v; count = PAGE; open = null; }}
        options={[{ value: 'problems', label: 'Problems' }, { value: 'activity', label: 'Activity' }, { value: 'data', label: 'Data' }, { value: 'everything', label: 'All' }]}
      />
    </div>
  </header>

  <div class="flex-1 overflow-y-auto">
    <ul class="max-w-2xl mx-auto w-full px-3 py-1 divide-y divide-border/50">
      {#each visible as e, i (keyOf(e, i))}
        {@const k = keyOf(e, i)}
        {#if i === 0 || dayOf(visible[i - 1].at) !== dayOf(e.at)}
          <li class="pt-4 pb-1 text-label font-semibold text-content-muted">{dayHeading(dayOf(e.at))}</li>
        {/if}
        {@const more = !!(e.stack || e.data !== undefined)}
        <li>
          <button onclick={() => (open = open === k ? null : k)} disabled={!more && e.msg.length < 120} class="w-full text-left py-2 flex gap-2.5 disabled:cursor-default" aria-expanded={more ? open === k : undefined}>
            <span class="shrink-0 font-mono text-caption font-bold w-8 {TONE[e.level]}">{TAG[e.level]}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-caption text-content-subtle tabular-nums truncate">
                {time(e.at)} · {e.area}{e.n && e.n > 1 ? ` · ×${e.n}` : ''}{e.ops?.length ? ` · ${e.ops.join(' › ')}` : ''}{e.where ? ` · ${e.where}` : ''}
              </span>
              <span class="block text-caption break-words {e.level === 'debug' ? 'text-content-subtle' : 'text-content'} {open === k ? '' : 'line-clamp-3'}">{e.msg}</span>
              {#if open === k && e.stack}
                <span class="block mt-1 font-mono text-caption leading-snug text-content-subtle whitespace-pre-wrap break-all">{e.stack}</span>
              {/if}
              {#if open === k && e.data !== undefined}
                <span class="block mt-1 font-mono text-caption leading-snug text-content-subtle whitespace-pre-wrap break-all">{JSON.stringify(e.data, null, 1)}</span>
              {/if}
            </span>
            {#if more}<Icon icon={open === k ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="shrink-0 text-lg text-content-subtle mt-0.5" />{/if}
          </button>
        </li>
      {:else}
        <li class="py-10 text-center text-content-subtle text-caption">{entries.length ? 'Nothing here matches.' : 'Nothing logged yet.'}</li>
      {/each}
    </ul>
    {#if shown.length > visible.length}
      <div class="max-w-2xl mx-auto w-full px-3 pb-6">
        <button onclick={() => (count += PAGE)} class="btn btn-ghost w-full">Show older ({(shown.length - visible.length).toLocaleString()})</button>
      </div>
    {/if}
  </div>
</div>
