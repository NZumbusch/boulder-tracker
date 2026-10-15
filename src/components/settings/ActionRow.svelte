<script lang="ts">
  /**
   * A row that does something (saves a file, starts a sync, restores a backup), as opposed to `NavRow`, which opens a
   * page. Icon, title, a line of hint, no chevron: a chevron promises navigation. `expanded` (true or false) adds the
   * expand/collapse arrow for a row that opens its options in place. `tone="danger"` is for the destructive ones.
   */
  import Icon from '@iconify/svelte';

  let { icon, title, hint, onclick, disabled = false, busy = false, expanded, tone = 'normal' }: {
    icon: string;
    title: string;
    hint?: string;
    onclick: () => void;
    disabled?: boolean;
    /** A request is running: the row says so and cannot be pressed again. */
    busy?: boolean;
    expanded?: boolean;
    tone?: 'normal' | 'danger';
  } = $props();
</script>

<button
  type="button"
  {onclick}
  disabled={disabled || busy}
  aria-expanded={expanded}
  aria-busy={busy || undefined}
  class="w-full flex items-center gap-3 py-3 min-h-11 text-left group transition-colors disabled:opacity-40"
>
  <Icon icon={busy ? 'ic:baseline-sync' : icon} class="text-xl shrink-0 {busy ? 'animate-spin' : ''} {tone === 'danger' ? 'text-danger' : 'text-content-subtle group-hover:text-primary'} transition-colors" />
  <span class="min-w-0 flex-1">
    <span class="block text-body font-semibold {tone === 'danger' ? 'text-danger' : 'text-content group-hover:text-primary'} transition-colors">{title}</span>
    {#if hint}<span class="block text-caption text-content-subtle">{hint}</span>{/if}
  </span>
  {#if expanded !== undefined}
    <Icon icon={expanded ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-content-subtle text-xl shrink-0" />
  {/if}
</button>
