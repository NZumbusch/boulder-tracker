<script lang="ts">
  /**
   * The minimised session: how long it has been going and which exercise is current, anywhere in the app, and the way
   * back into it. It never floats over the screen (a floating pill hid the right-hand column of every list):
   *
   *  - `button` - with the bottom bar it takes the place of the middle + while a session runs: a ring round the elapsed
   *    minutes (or the circuit's clock), 48 px like the + it replaces;
   *  - `strip` - with the drawer or rail there is no bar, so it is a slim strip along the bottom of the content, part of
   *    the layout (the content ends above it) and in the safe area.
   *
   * Only ever visible while a session is running *and* the session modal is closed (`dockVisible`), so it can never
   * overlap the modal's own header or its timer. While it is up it tells the rest of the shell how much room it takes
   * (`--chrome-b`), so toasts and timer pills sit above it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import Icon from '@iconify/svelte';
  import { circuitHud } from '../../lib/session/circuitHud.svelte';
  import { accentClasses } from '../../lib/navigation/accent';

  let { variant }: { variant: 'button' | 'strip' } = $props();

  const store = trainingState.sessionStore;

  const progress = $derived(store.progress);
  const elapsed = $derived(store.elapsedMinutes);
  const expected = $derived(store.expectedMinutes);

  /** Capped at 100% so a long session fills the ring rather than overflowing it. */
  const ratio = $derived(expected > 0 ? Math.min(1, elapsed / expected) : 0);
  const overrun = $derived(expected > 0 && elapsed > expected);
  const current = $derived(
    circuitHud.active ? circuitHud.exercise : store.currentSlot ? slotTypeName(store.currentSlot, trainingState.exerciseTypes) : 'Session',
  );
  const accent = $derived(accentClasses(trainingState.navAccent));
  const summary = $derived(
    circuitHud.active
      ? `${circuitHud.phase} ${circuitHud.time}`
      : `${elapsed}${expected > 0 ? `/${expected}` : ''} min${progress.total > 0 ? ` · ${progress.settled}/${progress.total} done` : ''}${store.isPaused ? ' · paused' : ''}`,
  );

  function open() {
    if (circuitHud.active) circuitHud.openRequested = true;
    store.openModal();
  }

  // The strip is in the layout; everything that sits above the bottom edge moves up by its height.
  let stripHeight = $state(0);
  $effect(() => {
    if (variant !== 'strip') return;
    document.documentElement.style.setProperty('--chrome-b', `${stripHeight}px`);
    return () => document.documentElement.style.removeProperty('--chrome-b');
  });
</script>

{#snippet ring(size: string)}
  <span class="relative shrink-0 {size} grid place-items-center">
    <svg viewBox="0 0 36 36" class="absolute inset-0 -rotate-90 w-full h-full" aria-hidden="true">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-elevated)" stroke-width="3" />
      <circle
        cx="18" cy="18" r="15.5" fill="none"
        stroke={circuitHud.active ? circuitHud.accent : overrun ? 'var(--color-warning)' : 'var(--color-primary)'}
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray="{ratio * 97.4} 97.4"
        class="transition-[stroke-dasharray] duration-500"
      />
    </svg>
    {#if store.isPaused}
      <Icon icon="ic:baseline-pause" class="text-base text-warning relative" />
    {:else}
      <span class="text-caption font-bold text-content tabular-nums relative leading-none">{circuitHud.active ? circuitHud.time : elapsed}</span>
    {/if}
  </span>
{/snippet}

{#if store.isActive && !store.isModalOpen && !trainingState.showFatigue}
  {#if variant === 'button'}
    <button
      onclick={open}
      class="flex items-center justify-center w-12 h-12 short:w-10 short:h-10 rounded-full cursor-pointer active:scale-90 transition-transform bg-surface-elevated"
      aria-label="Return to the running session: {current}, {summary}"
      data-tour="nav-add"
    >
      {@render ring('w-11 h-11 short:w-9 short:h-9')}
    </button>
  {:else}
    <button
      bind:offsetHeight={stripHeight}
      onclick={open}
      class="w-full shrink-0 min-h-14 pl-4 pr-3 pb-safe flex items-center gap-3 bg-surface-elevated/70 border-t border-border text-left animate-in slide-in-from-bottom-2 duration-200"
      aria-label="Return to the running session: {current}, {summary}"
    >
      {@render ring('w-9 h-9')}
      <span class="min-w-0 flex-1">
        <span class="text-label font-bold text-content block truncate">{current}</span>
        <span class="text-caption block tabular-nums truncate {circuitHud.active ? '' : 'text-content-subtle'}" style={circuitHud.active ? `color: ${circuitHud.accent};` : ''}>{summary}</span>
      </span>
      <span class="shrink-0 {accent.text} text-label font-semibold inline-flex items-center gap-1">Return<Icon icon="ic:baseline-open-in-full" class="text-sm" /></span>
    </button>
  {/if}
{/if}
