<script lang="ts">
  /**
   * Renders `toast` (lib/toast.svelte.ts): a message above the floating + and the bottom bar (when it is on) - or, over a sheet or a full-screen
   * view, above that view's footer - with its action. It wraps to three lines rather than cutting the message, the clock stops while it is held, and it sits above
   * every sheet (and stays tappable behind a modal: `data-dialog-keep`).
   * The screen-reader region is always in the page - a region that appears together with its text is often not read.
   */
  import { onMount } from 'svelte';
  import { toast } from '../../lib/toast.svelte';

  // While a sheet or a full-screen view is open the toast stays at the bottom - where a thumb is, and out of the title and
  // close button at the top - but lifted above that view's own footer (its Save and Cancel, the session's Pause and End).
  let overSheet = $state(false);
  /** Pixels from the bottom of the screen to the top of the open dialog's footer (0 when it has none). */
  let footerTop = $state(0);
  function look() {
    const dialogs = document.querySelectorAll('[aria-modal="true"]');
    overSheet = dialogs.length > 0;
    const top = dialogs[dialogs.length - 1];
    const footer = top?.querySelector('footer, [data-sheet-footer]');
    footerTop = footer ? Math.max(0, Math.round(window.innerHeight - footer.getBoundingClientRect().top)) : 0;
  }
  onMount(() => {
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    window.addEventListener('resize', look);
    return () => { observer.disconnect(); window.removeEventListener('resize', look); };
  });
  // The footer can change height after the dialog opens (the session bar): measure again when a toast arrives.
  $effect(() => {
    if (toast.current) requestAnimationFrame(look);
  });
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{toast.current ? `${toast.current.text}${toast.current.action ? `. ${toast.current.action.label} available` : ''}` : ''}</div>

{#if toast.current}
  {#key toast.current.id}
    <div
      data-dialog-keep
      style={overSheet ? `bottom: calc(${footerTop}px + 12px + ${footerTop === 0 ? 'env(safe-area-inset-bottom)' : '0px'})` : undefined}
      class="fixed inset-x-0 {overSheet ? '' : 'bottom-[calc(var(--chrome-b)+var(--fab-b)+16px+env(safe-area-inset-bottom))]'} z-[190] flex justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pointer-events-none"
    >
      <div
        class="pointer-events-auto max-w-md w-full flex items-center gap-3 pl-4 pr-2 py-2 min-h-12 bg-surface-elevated border border-border-strong rounded-card shadow-card animate-in fade-in slide-in-from-bottom-2 duration-200"
        onpointerenter={() => toast.pause()}
        onpointerdown={() => toast.pause()}
        onpointerleave={() => toast.resume()}
        onpointercancel={() => toast.resume()}
        onfocusin={() => toast.pause()}
        onfocusout={() => toast.resume()}
        role="presentation"
      >
        <span class="flex-1 min-w-0 text-body text-content line-clamp-3 break-words">{toast.current.text}</span>
        {#if toast.current.action}
          <button onclick={() => toast.current?.action?.run()} class="btn-quiet shrink-0 px-3 text-label font-bold text-primary hover:text-primary-hover">
            {toast.current.action.label}
          </button>
        {/if}
      </div>
    </div>
  {/key}
{/if}
