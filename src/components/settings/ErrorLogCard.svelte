<script lang="ts">
  /**
   * Settings -> About & Help: everything the console showed as an error or
   * a warning on this device (see lib/errorReporting), and whether they
   * also pop up as they happen. For tracing a problem back - copy the log
   * into a bug report.
   */
  import { readErrorLog, clearErrorLog, readAlertLevel, setAlertLevel, LOG_CHANGED_EVENT, type LoggedError, type AlertLevel } from '../../lib/errorReporting';
  import { toast } from '../../lib/toast.svelte';
  import FullLogView from './FullLogView.svelte';
  import Icon from '@iconify/svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { showConfirm } from '../../lib/utils';

  let entries = $state<LoggedError[]>(readErrorLog());
  let alertLevel = $state<AlertLevel>(readAlertLevel());
  let filter = $state<'all' | 'error' | 'warning'>('all');
  /** The open row is remembered by what identifies it, not by its position, so a new entry does not move it. */
  let expanded = $state<string | null>(null);
  const keyOf = (e: LoggedError) => `${e.at}|${e.message.slice(0, 60)}`;
  let showAll = $state(false);
  let fullLogOpen = $state(false);

  $effect(() => {
    const refresh = () => { entries = [...readErrorLog()]; };
    window.addEventListener(LOG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LOG_CHANGED_EVENT, refresh);
  });

  const levelOf = (e: LoggedError) => e.level ?? 'error';
  const counts = $derived({
    error: entries.filter((e) => levelOf(e) === 'error').length,
    warning: entries.filter((e) => levelOf(e) === 'warning').length,
  });
  const shown = $derived(entries.filter((e) => filter === 'all' || levelOf(e) === filter));
  const visible = $derived(showAll ? shown : shown.slice(0, 15));

  function chooseAlert(level: AlertLevel) {
    alertLevel = level;
    setAlertLevel(level);
  }

  const SOURCE: Record<string, string> = { uncaught: 'uncaught', promise: 'unhandled promise', console: 'console', caught: 'caught' };

  async function copy() {
    const text = [
      `${navigator.userAgent}`,
      ...shown.map((e) => [
        `[${e.at}] ${levelOf(e).toUpperCase()}${e.count && e.count > 1 ? ` ×${e.count}` : ''} (${SOURCE[e.source ?? 'caught'] ?? e.source}${e.where ? `, ${e.where}` : ''})`,
        e.message,
        e.stack ?? '',
      ].filter(Boolean).join('\n')),
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Copied');
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }

  async function clear() {
    if (!(await showConfirm('Clear the error log?', 'It is the trail you would attach to a bug report. Copy it first if you still need it.', { ok: 'Clear log', cancel: 'Keep it' }))) return;
    clearErrorLog();
    expanded = null;
  }

  const OPTIONS: { id: AlertLevel; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'errors', label: 'Errors' },
    { id: 'all', label: 'Warnings too' },
  ];
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1">
    <h2 class="text-section uppercase text-content-muted">Errors &amp; warnings</h2>
    <p class="text-caption text-content-subtle">Everything the app's console reports is kept here, on this device, so a problem can be traced afterwards.</p>
  </div>

  <div class="space-y-2">
    <span class="text-label text-content-subtle block">Pop up a message for</span>
    <Segmented
      variant="setting"
      full
      label="Pop up a message for"
      value={alertLevel}
      onChange={(v) => chooseAlert(v)}
      options={OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
    />
  </div>

  <button onclick={() => fullLogOpen = true} class="btn btn-secondary w-full gap-1.5">
    <Icon icon="ic:baseline-terminal" class="text-base" /> Full log (every line the app wrote)
  </button>

  {#if entries.length === 0}
    <p class="text-caption text-content-subtle italic">No errors or warnings logged.</p>
  {:else}
    <div class="flex items-center justify-between gap-2">
      <Segmented
        label="Show"
        value={filter}
        onChange={(v) => (filter = v)}
        options={[{ value: 'all', label: `All ${entries.length}` }, { value: 'error', label: `Errors ${counts.error}` }, { value: 'warning', label: `Warnings ${counts.warning}` }]}
      />
    </div>

    <ul class="divide-y divide-border">
      {#each visible as e (keyOf(e))}
        <li>
          <button onclick={() => expanded = expanded === keyOf(e) ? null : keyOf(e)} class="w-full text-left py-2 min-h-11 flex gap-2.5" aria-expanded={expanded === keyOf(e)}>
            <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 {levelOf(e) === 'error' ? 'bg-danger' : 'bg-warning'}"><span class="sr-only">{levelOf(e)}</span></span>
            <span class="min-w-0 flex-1">
              <span class="block text-caption text-content-subtle tabular-nums truncate">
                {new Date(e.at).toLocaleString()} · {SOURCE[e.source ?? 'caught'] ?? e.source}{e.where ? ` · ${e.where}` : ''}{e.count && e.count > 1 ? ` · ×${e.count}` : ''}
              </span>
              <span class="block text-caption text-content break-words {expanded === keyOf(e) ? '' : 'line-clamp-2'}">{e.message}</span>
              {#if expanded === keyOf(e) && e.stack}
                <span class="block mt-1 text-[10px] leading-snug font-mono text-content-subtle whitespace-pre-wrap break-all">{e.stack}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if shown.length > visible.length}
      <button onclick={() => showAll = true} class="btn btn-ghost w-full">Show all {shown.length}</button>
    {/if}

    <div class="flex gap-2">
      <button onclick={copy} class="btn btn-secondary flex-1 gap-1.5">
        <Icon icon="ic:baseline-content-copy" class="text-base" /> Copy {filter === 'all' ? 'all' : filter === 'error' ? 'errors' : 'warnings'}
      </button>
      <button onclick={clear} class="btn btn-ghost hover:text-danger">Clear</button>
    </div>
  {/if}
</div>

{#if fullLogOpen}
  <FullLogView onClose={() => fullLogOpen = false} />
{/if}
