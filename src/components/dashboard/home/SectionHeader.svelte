<script lang="ts">
  /**
   * The title row every Home card starts with: label, optional subtitle and
   * note button. No icon tile - the app-wide card header is title and
   * subtitle only (the Analytics cards' style).
   */
  import Icon from '@iconify/svelte';
  import InfoButton from '../../common/InfoButton.svelte';
  import type { TermId } from '../../../lib/help/glossary';
  import type { Snippet } from 'svelte';

  let { label, subtitle, note, info, action }: {
    label: string;
    subtitle?: string;
    note?: { has: boolean; open: () => void; what: string };
    /** A glossary term explained by a (?) next to the label. */
    info?: TermId;
    /** A control at the right end of the title row (dismiss, snooze). */
    action?: Snippet;
  } = $props();
</script>

<div class="flex items-start justify-between gap-3">
<div class="min-w-0 flex-1">
  <div class="flex items-center gap-1.5">
    <span class="text-section uppercase text-content-muted">{label}</span>
    {#if info}<InfoButton term={info} />{/if}
    {#if note}
      <button
        onclick={note.open}
        class="tap inline-grid place-items-center w-9 h-9 -m-2 rounded-control transition-colors {note.has ? 'text-primary hover:text-primary-hover' : 'text-content-subtle hover:text-content'}"
        aria-label={note.has ? `Open ${note.what} note` : `Add a ${note.what} note`}
        title={note.has ? `${note.what[0].toUpperCase()}${note.what.slice(1)} note` : `Add a ${note.what} note`}
      >
        <Icon icon={note.has ? 'ic:baseline-sticky-note-2' : 'ic:outline-sticky-note-2'} class="text-base" />
      </button>
    {/if}
  </div>
  {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
</div>
{#if action}<div class="shrink-0 -mr-2 -mt-2">{@render action()}</div>{/if}
</div>
