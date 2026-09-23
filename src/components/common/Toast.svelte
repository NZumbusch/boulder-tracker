<script lang="ts">
  /** Renders `toast` (lib/toast.svelte.ts): one line above the bottom nav, with its action. */
  import { toast } from '../../lib/toast.svelte';
</script>

{#if toast.current}
  {#key toast.current.id}
    <div class="fixed inset-x-0 bottom-[88px] z-[150] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      <div class="pointer-events-auto max-w-md w-full flex items-center gap-3 px-4 py-3 bg-surface-elevated border border-border-strong rounded-card shadow-card animate-in fade-in slide-in-from-bottom-2 duration-200">
        <span class="flex-1 min-w-0 text-body text-content truncate">{toast.current.text}</span>
        {#if toast.current.action}
          <button onclick={() => toast.current?.action?.run()} class="shrink-0 px-2 py-1 -my-1 text-label font-bold text-primary hover:text-primary-hover">
            {toast.current.action.label}
          </button>
        {/if}
      </div>
    </div>
  {/key}
{/if}
