<script lang="ts">
  /** Settings -> About & Help: what went wrong recently, on this device, to copy into a bug report. Hidden when empty. */
  import { readErrorLog, clearErrorLog, type LoggedError } from '../../lib/errorReporting';
  import { toast } from '../../lib/toast.svelte';
  import Icon from '@iconify/svelte';

  let entries = $state<LoggedError[]>(readErrorLog());
  let open = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      toast.show('Copied');
    } catch {
      toast.show("Couldn't copy on this device");
    }
  }

  function clear() {
    clearErrorLog();
    entries = [];
  }
</script>

{#if entries.length > 0}
  <div class="card space-y-3 animate-in fade-in">
    <button onclick={() => open = !open} class="w-full flex items-center justify-between gap-3 text-left">
      <span class="min-w-0">
        <span class="block text-section uppercase text-content-muted">Recent errors</span>
        <span class="block text-caption text-content-subtle">{entries.length} on this device &middot; last {new Date(entries[0].at).toLocaleString()}</span>
      </span>
      <Icon icon={open ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-xl text-content-subtle shrink-0" />
    </button>
    {#if open}
      <ul class="space-y-2">
        {#each entries as e}
          <li class="text-caption leading-snug">
            <span class="text-content-subtle tabular-nums">{new Date(e.at).toLocaleString()}{e.where ? ` · ${e.where}` : ''}</span>
            <span class="block text-content break-words">{e.message}</span>
          </li>
        {/each}
      </ul>
      <div class="flex gap-2">
        <button onclick={copy} class="flex-1 py-2.5 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control border border-border-strong/50">Copy details</button>
        <button onclick={clear} class="px-4 py-2.5 text-content-subtle hover:text-danger text-label font-bold rounded-control">Clear</button>
      </div>
    {/if}
  </div>
{/if}
