<script lang="ts">
  /** The title row every Home card starts with: label, optional subtitle and note button, and the card's icon. */
  import Icon from '@iconify/svelte';

  let { icon, label, subtitle, note }: {
    icon: string;
    label: string;
    subtitle?: string;
    note?: { has: boolean; open: () => void; what: string };
  } = $props();
</script>

<div class="flex items-center justify-between">
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
  <div class="p-2 bg-primary-hover/10 rounded-control text-primary shrink-0 ml-3">
    <Icon {icon} class="text-lg" />
  </div>
</div>
