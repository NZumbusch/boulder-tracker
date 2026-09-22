<script lang="ts">
  /**
   * The minimised session: a corner pill showing which exercise you're on
   * and how long you've been at it, anywhere in the app.
   *
   * Only ever visible while a session is running *and* the session modal
   * is closed - the two are mutually exclusive, so the bubble can never
   * overlap the modal's own header or its timer.
   *
   * Sits above the nav bar (`h-[75px]` in App.svelte) rather than over it,
   * the same clearance `TimerWidget` uses, so it never covers a tab.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import Icon from '@iconify/svelte';

  const store = trainingState.sessionStore;

  const progress = $derived(store.progress);
  const elapsed = $derived(store.elapsedMinutes);
  const expected = $derived(store.expectedMinutes);

  /** Capped at 100% so a long session fills the ring rather than overflowing it. */
  const ratio = $derived(expected > 0 ? Math.min(1, elapsed / expected) : 0);
  const overrun = $derived(expected > 0 && elapsed > expected);
</script>

<!-- Hidden during the post-session rating too: finishing minimises the
     modal (the session is only cleared once the save goes through), and
     without this the bubble would sit behind the fatigue modal inviting
     you back into a session you have just ended. -->
{#if store.isActive && !store.isModalOpen && !trainingState.showFatigue}
  <button
    onclick={() => store.openModal()}
    class="fixed bottom-[91px] right-4 z-[90] flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full bg-surface/95 backdrop-blur-md border border-border-strong shadow-card hover:border-primary/50 transition-all active:scale-95 animate-in slide-in-from-bottom-4 duration-200 max-w-[calc(100vw-2rem)]"
    aria-label="Return to the running session"
  >
    <span class="relative shrink-0 w-9 h-9 grid place-items-center">
      <!-- Elapsed-vs-expected as a ring: readable at a glance without
           needing the numbers, which are spelled out beside it anyway. -->
      <svg viewBox="0 0 36 36" class="absolute inset-0 -rotate-90 w-9 h-9" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-elevated)" stroke-width="3" />
        <circle
          cx="18" cy="18" r="15.5" fill="none"
          stroke={overrun ? 'var(--color-warning)' : 'var(--color-primary)'}
          stroke-width="3"
          stroke-linecap="round"
          stroke-dasharray="{ratio * 97.4} 97.4"
          class="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      {#if store.isPaused}
        <Icon icon="ic:baseline-pause" class="text-base text-warning relative" />
      {:else}
        <span class="text-caption font-bold text-content tabular-nums relative leading-none">
          {progress.settled}/{progress.total}
        </span>
      {/if}
    </span>

    <span class="min-w-0 text-left">
      <span class="text-label font-bold text-content block truncate">
        {store.currentSlot ? slotTypeName(store.currentSlot, trainingState.exerciseTypes) : 'Session'}
      </span>
      <!-- Minutes, not a ticking stopwatch: the running clock belongs to
           the session modal, and a second one out here would be the
           interference this bubble exists to avoid. -->
      <span class="text-caption text-content-subtle block tabular-nums truncate">
        {elapsed}{#if expected > 0}<span class="text-content-subtle/70">/{expected}</span>{/if} min
        {#if store.isPaused}&middot; paused{/if}
      </span>
    </span>

    <Icon icon="ic:baseline-open-in-full" class="text-sm text-content-subtle shrink-0" />
  </button>
{/if}
