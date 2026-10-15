<script lang="ts">
  /**
   * The one bottom sheet (a centred dialog from `sm` up): scrim, panel, title bar with a 44 px close button, a body that
   * scrolls and an optional sticky footer for the primary action. It brings what every sheet needs - drag down to close,
   * Android Back (backWhile), the keyboard-aware footer, the safe area, Escape (the dialog layer) and an accessible name
   * (the title) - so a sheet only supplies its content.
   *
   *   <Sheet title="Note" subtitle="Week 42" icon="ic:outline-sticky-note-2" {onClose}>
   *     ...fields...
   *     {#snippet footer()}<button class="btn btn-primary flex-1">Save</button>{/snippet}
   *   </Sheet>
   *
   * `level` is the stacking: a sheet over the page, one opened from another sheet, one over everything (the glossary).
   * `dirty` makes every way of closing (scrim, drag, Back, X) ask first, so a half-filled form is not lost by a stray tap.
   * The z-index classes are written out in full on purpose: the dialog layer reads them to find the top overlay.
   */
  import type { Snippet } from 'svelte';
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { keyboardAware } from '../../lib/ui/keyboardAware';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { showConfirm } from '../../lib/utils';

  let {
    title,
    subtitle,
    icon,
    onClose,
    level = 'sheet',
    dirty = false,
    discardMessage = 'Your changes will be lost.',
    wide = false,
    children,
    footer,
    headerExtra,
  }: {
    title: string;
    subtitle?: string;
    icon?: string;
    onClose: () => void;
    level?: 'sheet' | 'nested' | 'top';
    dirty?: boolean;
    discardMessage?: string;
    wide?: boolean;
    children: Snippet;
    footer?: Snippet;
    headerExtra?: Snippet;
  } = $props();

  const Z = { sheet: 'z-[110]', nested: 'z-[130]', top: 'z-[160]' } as const;
  let asking = false;

  async function requestClose() {
    if (!dirty) return onClose();
    if (asking) return;
    asking = true;
    try {
      if (await showConfirm('Discard changes?', discardMessage, { ok: 'Discard', cancel: 'Keep editing' })) onClose();
    } finally {
      asking = false;
    }
  }

  // Back (phone key or browser) does what the X does - see lib/navigation/backStack.
  backWhile(() => true, () => void requestClose());
</script>

<div class="fixed inset-0 pb-safe bg-scrim backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 {Z[level]} animate-in fade-in duration-150">
  <button type="button" class="absolute inset-0 cursor-default" onclick={requestClose} tabindex="-1" aria-label="Close {title}"></button>
  <div
    class="group relative bg-surface w-full {wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border px-5 pt-5 shadow-card flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-200"
    use:sheetDrag={() => void requestClose()}
    use:keyboardAware
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 pt-1">
        <h3 data-sheet-title class="text-title text-content flex items-center gap-2">
          {#if icon}<Icon {icon} class="text-primary text-xl shrink-0" />{/if}
          <span class="truncate">{title}</span>
        </h3>
        {#if subtitle}<p class="text-caption text-content-subtle mt-0.5">{subtitle}</p>{/if}
      </div>
      <div class="flex items-center shrink-0 -mr-2 -mt-1">
        {#if headerExtra}{@render headerExtra()}{/if}
        <button type="button" onclick={requestClose} class="btn-icon" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>
    </div>

    {@render children()}

    {#if footer}
      <div class="sticky bottom-0 -mx-5 px-5 pt-3 pb-4 bg-surface flex gap-2 group-data-[typing]:static">{@render footer()}</div>
    {:else}
      <div class="pb-2" aria-hidden="true"></div>
    {/if}
  </div>
</div>
