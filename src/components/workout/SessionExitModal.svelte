<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * The "stop the session" fork: save what happened, or throw it away.
   *
   * A confirmation step rather than a plain confirm dialog because the two
   * outcomes are genuinely different actions, not yes/no on one - and
   * because discarding is unrecoverable, so it needs to state exactly what
   * is being lost and must never be the easy default. Saving is the
   * primary action; discarding is a quiet destructive one below it.
   */
  import type { SessionProgress } from '../../lib/session/activeSession';
  import { onDestroy } from 'svelte';
  import Icon from '@iconify/svelte';

  let { progress, elapsedLabel, onSave, onDiscard, onCancel }: {
    progress: SessionProgress;
    elapsedLabel: string;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  } = $props();

  const pending = $derived(progress.total - progress.settled);

  // Discarding takes two taps: the first arms the button, which disarms itself after a few seconds.
  let armed = $state(false);
  let disarm: ReturnType<typeof setTimeout> | undefined;
  function discard() {
    if (armed) { clearTimeout(disarm); onDiscard(); return; }
    armed = true;
    disarm = setTimeout(() => (armed = false), 4000);
  }
  onDestroy(() => clearTimeout(disarm));

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onCancel());
</script>

<div
  class="fixed inset-0 pb-safe z-[130] flex items-end sm:items-center justify-center bg-app-bg/90 backdrop-blur-md"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
>
  <div class="bg-surface w-full max-w-md rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card p-5 space-y-5 animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onCancel()}>
    <div class="space-y-1">
      <h3 class="text-title text-content">End this session?</h3>
      <p class="text-caption text-content-subtle">
        {progress.done} of {progress.total} logged
        {#if progress.skipped > 0}&middot; {progress.skipped} skipped{/if}
        &middot; {elapsedLabel} in
      </p>
    </div>

    <div class="space-y-2.5">
      <button
        onclick={onSave}
        class="w-full p-4 bg-primary hover:bg-primary-hover text-white rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3"
      >
        <Icon icon="ic:baseline-check-circle" class="text-xl shrink-0 mt-0.5" />
        <span class="min-w-0">
          <span class="text-label font-bold block">Save what I did</span>
          <span class="text-caption text-white/75 block">
            {#if pending > 0}
              Keeps the {pending} unfinished {pending === 1 ? 'exercise' : 'exercises'} unlogged, so the plan still shows what was missed.
            {:else}
              Records the session and moves on to rating it.
            {/if}
          </span>
        </span>
      </button>

      <button
        onclick={onCancel}
        class="w-full p-4 bg-surface-elevated/60 hover:bg-surface-elevated text-content rounded-card transition-all active:scale-[0.99] text-left flex items-start gap-3 border border-border-strong/50"
      >
        <Icon icon="ic:baseline-play-arrow" class="text-xl shrink-0 mt-0.5 text-success" />
        <span class="min-w-0">
          <span class="text-label font-bold block">Keep going</span>
          <span class="text-caption text-content-subtle block">Back to the session, clock still running.</span>
        </span>
      </button>
    </div>

    <div class="pt-1 border-t border-border">
      <button
        onclick={discard}
        class="w-full py-3 text-label font-bold rounded-control transition-colors flex items-center justify-center gap-2 {armed ? 'bg-danger text-white' : 'text-danger hover:bg-danger/10'}"
      >
        <Icon icon="ic:baseline-delete-outline" class="text-base shrink-0" />
        {armed ? 'Tap again to discard' : 'Discard — log nothing'}
      </button>
      <p class="text-caption text-content-subtle text-center px-2 mt-1">
        {#if progress.done > 0}
          Throws away all {progress.done} logged {progress.done === 1 ? 'exercise' : 'exercises'}. The planned session stays planned.
        {:else}
          Nothing has been logged yet. The planned session stays planned.
        {/if}
      </p>
    </div>
  </div>
</div>
