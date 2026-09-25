<script lang="ts">
  /**
   * The title row every Home card starts with: label, optional subtitle and
   * note button. No icon tile - the app-wide card header is title and
   * subtitle only (the Analytics cards' style).
   */
  import Icon from '@iconify/svelte';

  let { label, subtitle, note }: {
    label: string;
    subtitle?: string;
    note?: { has: boolean; open: () => void; what: string };
  } = $props();
</script>

<div class="min-w-0">
  <div class="flex items-center gap-1.5">
    <span class="text-section uppercase text-content-muted">{label}</span>
    {#if note}
      <button
        onclick={note.open}
        class="p-1 -m-1 rounded-control transition-colors {note.has ? 'text-primary hover:text-primary-hover' : 'text-content-subtle hover:text-content'}"
        aria-label={note.has ? `Open ${note.what} note` : `Add a ${note.what} note`}
        title={note.has ? `${note.what[0].toUpperCase()}${note.what.slice(1)} note` : `Add a ${note.what} note`}
      >
        <Icon icon={note.has ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-sm" />
      </button>
    {/if}
  </div>
  {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
  </div>
