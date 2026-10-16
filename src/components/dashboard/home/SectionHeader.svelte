<script lang="ts">
  /**
   * The title row every Home card starts with: label, optional subtitle and
   * note button. No icon tile - the app-wide card header is title and
   * subtitle only (the Analytics cards' style).
   */
  import Icon from '@iconify/svelte';
  import InfoButton from '../../common/InfoButton.svelte';
  import type { TermId } from '../../../lib/help/glossary';
  import { getContext, type Snippet } from 'svelte';
  import { HOME_COLLAPSE, type HomeCollapse } from '../../../lib/home/collapse';

  let { label, subtitle, note, info, action }: {
    label: string;
    subtitle?: string;
    note?: { has: boolean; open: () => void; what: string };
    /** A glossary term explained by a (?) next to the label. */
    info?: TermId;
    /** A control at the right end of the title row (dismiss, snooze). */
    action?: Snippet;
  } = $props();

  // Inside a Home card the title folds and opens it (CollapsibleCard); anywhere else it is plain text.
  const collapse = getContext<HomeCollapse | undefined>(HOME_COLLAPSE);
  const foldable = $derived(!!collapse?.enabled);
  const folded = $derived(foldable && !!collapse?.collapsed);

  /** A tap on the empty part of the header folds too; the buttons inside keep their own jobs. */
  function headerClick(e: MouseEvent) {
    if (!foldable || (e.target as HTMLElement).closest('button, a, input, select')) return;
    collapse!.toggle();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="flex items-start justify-between gap-3 {foldable ? 'cursor-pointer' : ''}" onclick={headerClick}>
<div class="min-w-0 flex-1">
  <div class="flex items-center gap-1.5">
    {#if foldable}
      <button type="button" onclick={() => collapse!.toggle()} aria-expanded={!folded} class="tap inline-flex items-center gap-1 min-h-10 -my-2.5 text-left">
        <span class="text-section uppercase text-content-muted">{label}</span>
        <Icon icon="ic:baseline-chevron-right" class="text-base text-content-subtle transition-transform {folded ? '' : 'rotate-90'}" />
      </button>
    {:else}
      <span class="text-section uppercase text-content-muted">{label}</span>
    {/if}
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
  {#if subtitle && !folded}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
</div>
{#if action}<div class="shrink-0 -mr-2 -mt-2">{@render action()}</div>{/if}
</div>
