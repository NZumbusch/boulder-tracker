<script lang="ts">
  import { portal } from '../../lib/ui/portal';
  /**
   * The full console log, full screen: every line the app's console got
   * (log, info, debug, warnings, errors) and every uncaught error, oldest
   * first like a console - the last 500, kept on this device. Search,
   * filter by level, copy for a bug report. See lib/errorReporting.
   */
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { readFullLog, clearFullLog, LOG_CHANGED_EVENT, type ConsoleLine, type ConsoleLevel } from '../../lib/errorReporting';
  import { toast } from '../../lib/toast.svelte';
  import { tick } from 'svelte';
  import Icon from '@iconify/svelte';

  let { onClose }: { onClose: () => void } = $props();

  let lines = $state<ConsoleLine[]>([...readFullLog()]);
  let query = $state('');
  let level = $state<'all' | 'problems' | 'error'>('all');
  let listEl = $state<HTMLElement | null>(null);
  let follow = $state(true);

  $effect(() => {
    const refresh = () => { lines = [...readFullLog()]; };
    window.addEventListener(LOG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LOG_CHANGED_EVENT, refresh);
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) =>
      (level === 'all' || (level === 'error' ? l.level === 'error' : l.level === 'error' || l.level === 'warning')) &&
      (!q || l.message.toLowerCase().includes(q)),
    );
  });

  // Opens at the newest line, and stays there as lines arrive unless you've scrolled up.
  $effect(() => {
    void shown.length;
    if (!follow) return;
    void tick().then(() => { if (listEl) listEl.scrollTop = listEl.scrollHeight; });
  });
  function onScroll() {
    if (!listEl) return;
    follow = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
  }

  const TONE: Record<ConsoleLevel, string> = {
    error: 'text-danger',
    warning: 'text-warning',
    info: 'text-content',
    log: 'text-content',
    debug: 'text-content-subtle',
  };
  const TAG: Record<ConsoleLevel, string> = { error: 'ERR', warning: 'WRN', info: 'INF', log: 'LOG', debug: 'DBG' };
  const time = (at: string) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  async function copy() {
    const text = [navigator.userAgent, ...shown.map((l) => `${l.at} ${TAG[l.level]} ${l.message}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`Copied ${shown.length} lines`);
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }

  function clear() {
    clearFullLog();
    lines = [];
  }

  backWhile(() => true, () => onClose());
</script>

<div use:portal class="fixed inset-0 z-[125] safe-y bg-app-bg flex flex-col">
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-2xl mx-auto w-full px-4 pt-4 pb-3 space-y-3">
      <div class="flex items-center gap-3">
        <button onclick={onClose} class="p-2 -ml-2 text-content-subtle hover:text-content" aria-label="Close">
          <Icon icon="ic:baseline-arrow-back" class="text-2xl" />
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="text-title text-content">Full log</h2>
          <p class="text-caption text-content-subtle">{shown.length} of {lines.length} lines · this device</p>
        </div>
        <button onclick={copy} class="p-2 text-content-subtle hover:text-content" aria-label="Copy the shown lines" title="Copy">
          <Icon icon="ic:baseline-content-copy" class="text-xl" />
        </button>
        <button onclick={clear} class="p-2 -mr-2 text-content-subtle hover:text-danger" aria-label="Clear the log" title="Clear">
          <Icon icon="ic:baseline-delete" class="text-xl" />
        </button>
      </div>
      <div class="flex items-center gap-2">
        <input
          bind:value={query}
          type="search"
          placeholder="Search"
          class="flex-1 min-w-0 px-3 py-2 bg-surface-elevated/60 text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50"
        />
        <div class="seg shrink-0">
          <button onclick={() => level = 'all'} class="seg-item {level === 'all' ? 'seg-on' : ''}">All</button>
          <button onclick={() => level = 'problems'} class="seg-item {level === 'problems' ? 'seg-on' : ''}">Warn+</button>
          <button onclick={() => level = 'error'} class="seg-item {level === 'error' ? 'seg-on' : ''}">Errors</button>
        </div>
      </div>
    </div>
  </header>

  <div bind:this={listEl} onscroll={onScroll} class="flex-1 overflow-y-auto">
    <div class="max-w-2xl mx-auto w-full px-3 py-2 font-mono text-[11px] leading-snug">
      {#each shown as l, i (i + l.at)}
        <div class="flex gap-2 py-0.5 border-b border-border/40 {TONE[l.level]}">
          <span class="shrink-0 text-content-subtle tabular-nums">{time(l.at)}</span>
          <span class="shrink-0 font-bold w-7">{TAG[l.level]}</span>
          <span class="min-w-0 flex-1 whitespace-pre-wrap break-all">{l.message}</span>
        </div>
      {:else}
        <p class="py-8 text-center text-content-subtle font-sans text-caption">{lines.length ? 'No lines match.' : 'Nothing logged yet.'}</p>
      {/each}
    </div>
  </div>
</div>
