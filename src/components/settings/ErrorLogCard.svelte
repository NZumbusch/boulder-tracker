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

  let entries = $state<LoggedError[]>(readErrorLog());
  let alertLevel = $state<AlertLevel>(readAlertLevel());
  let filter = $state<'all' | 'error' | 'warning'>('all');
  let expanded = $state<number | null>(null);
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

  function clear() {
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
    <h4 class="text-section uppercase text-content-muted">Errors &amp; warnings</h4>
    <p class="text-caption text-content-subtle">Everything the app's console reports is kept here, on this device, so a problem can be traced afterwards.</p>
  </div>

  <div class="space-y-2">
    <span class="text-label text-content-subtle block">Pop up a message for</span>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      {#each OPTIONS as o}
        <button
          onclick={() => chooseAlert(o.id)}
          class="flex-1 min-w-0 px-1 py-2 text-label whitespace-nowrap truncate rounded-control transition-all {alertLevel === o.id ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
        >{o.label}</button>
      {/each}
    </div>
  </div>

  <button onclick={() => fullLogOpen = true} class="w-full py-2.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control border border-border-strong/50 flex items-center justify-center gap-1.5">
    <Icon icon="ic:baseline-terminal" class="text-base" /> Full log — every console line
  </button>

  {#if entries.length === 0}
    <p class="text-caption text-content-subtle italic">No errors or warnings logged.</p>
  {:else}
    <div class="flex items-center justify-between gap-2">
      <div class="seg">
        <button onclick={() => filter = 'all'} class="seg-item {filter === 'all' ? 'seg-on' : ''}">All {entries.length}</button>
        <button onclick={() => filter = 'error'} class="seg-item {filter === 'error' ? 'seg-on' : ''}">Errors {counts.error}</button>
        <button onclick={() => filter = 'warning'} class="seg-item {filter === 'warning' ? 'seg-on' : ''}">Warnings {counts.warning}</button>
      </div>
    </div>

    <ul class="divide-y divide-border">
      {#each visible as e, i (e.at + i)}
        <li>
          <button onclick={() => expanded = expanded === i ? null : i} class="w-full text-left py-2 flex gap-2.5">
            <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 {levelOf(e) === 'error' ? 'bg-danger' : 'bg-warning'}"></span>
            <span class="min-w-0 flex-1">
              <span class="block text-caption text-content-subtle tabular-nums truncate">
                {new Date(e.at).toLocaleString()} · {SOURCE[e.source ?? 'caught'] ?? e.source}{e.where ? ` · ${e.where}` : ''}{e.count && e.count > 1 ? ` · ×${e.count}` : ''}
              </span>
              <span class="block text-caption text-content break-words {expanded === i ? '' : 'line-clamp-2'}">{e.message}</span>
              {#if expanded === i && e.stack}
                <span class="block mt-1 text-[10px] leading-snug font-mono text-content-subtle whitespace-pre-wrap break-all">{e.stack}</span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if shown.length > visible.length}
      <button onclick={() => showAll = true} class="w-full text-label text-content-subtle hover:text-content">Show all {shown.length}</button>
    {/if}

    <div class="flex gap-2">
      <button onclick={copy} class="flex-1 py-2.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control border border-border-strong/50 flex items-center justify-center gap-1.5">
        <Icon icon="ic:baseline-content-copy" class="text-base" /> Copy {filter === 'all' ? 'all' : filter === 'error' ? 'errors' : 'warnings'}
      </button>
      <button onclick={clear} class="px-4 py-2.5 text-content-subtle hover:text-danger text-label font-bold rounded-control">Clear</button>
    </div>
  {/if}
</div>

{#if fullLogOpen}
  <FullLogView onClose={() => fullLogOpen = false} />
{/if}
