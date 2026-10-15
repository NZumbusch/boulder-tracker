<script lang="ts">
  /**
   * Renders `toast` (lib/toast.svelte.ts): a message above the floating + and the bottom bar (when it is on), with its
   * action. It wraps to three lines rather than cutting the message, the clock stops while it is held, and it sits above
   * every sheet (and stays tappable behind a modal: `data-dialog-keep`).
   * The screen-reader region is always in the page - a region that appears together with its text is often not read.
   */
  import { onMount } from 'svelte';
  import { toast } from '../../lib/toast.svelte';

  // While a sheet is open the toast moves to the top: at the bottom it would sit on the sheet's Save and Cancel.
  let overSheet = $state(false);
  onMount(() => {
    const look = () => (overSheet = !!document.querySelector('[aria-modal="true"]'));
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => observer.disconnect();
  });
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{toast.current ? `${toast.current.text}${toast.current.action ? `. ${toast.current.action.label} available` : ''}` : ''}</div>

{#if toast.current}
  {#key toast.current.id}
    <div
      data-dialog-keep
      class="fixed inset-x-0 {overSheet ? 'top-[calc(env(safe-area-inset-top)+12px)]' : 'bottom-[calc(var(--chrome-b)+var(--fab-b)+16px+env(safe-area-inset-bottom))]'} z-[190] flex justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pointer-events-none"
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
