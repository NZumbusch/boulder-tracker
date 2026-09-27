<script lang="ts">
  /**
   * Pull down at the top of the page to refresh (Home: sync, Health
   * Connect, weather, updates). Listens on the page's scroll container,
   * and only takes over a touch that starts at the very top and moves
   * down - sideways swipes and ordinary scrolling are left alone.
   * The maths is in `lib/pullToRefresh.ts`.
   */
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import { pullOffset, pullTriggers, PULL_THRESHOLD } from '../../lib/pullToRefresh';
  import { motionReduced } from '../../lib/motion';

  let { onRefresh, label = 'Pull to refresh' }: { onRefresh: () => Promise<void>; label?: string } = $props();

  let anchor: HTMLDivElement;
  let offset = $state(0);
  let dragging = $state(false);
  let refreshing = $state(false);

  onMount(() => {
    let scroller: HTMLElement | null = anchor.parentElement;
    while (scroller && getComputedStyle(scroller).overflowY !== 'auto' && getComputedStyle(scroller).overflowY !== 'scroll') scroller = scroller.parentElement;
    const target: HTMLElement | Window = scroller ?? window;
    const atTop = () => (scroller ? scroller.scrollTop : window.scrollY) <= 0;
    let startX = 0;
    let startY: number | null = null;
    let claimed = false;

    const start = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1 || !atTop()) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      claimed = false;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!claimed) {
        // Only a clearly downward pull is ours.
        if (dy < -4 || Math.abs(dx) > 10) { startY = null; return; }
        if (dy < 8 || Math.abs(dx) > dy) return;
        claimed = true;
        dragging = true;
      }
      if (!atTop()) { startY = null; dragging = false; offset = 0; return; }
      e.preventDefault();
      offset = pullOffset(dy);
    };
    const end = async () => {
      if (startY === null) return;
      startY = null;
      dragging = false;
      if (!claimed) return;
      if (!pullTriggers(offset)) { offset = 0; return; }
      refreshing = true;
      offset = PULL_THRESHOLD * 0.75;
      try {
        await onRefresh();
      } finally {
        refreshing = false;
        offset = 0;
      }
    };

    target.addEventListener('touchstart', start as EventListener, { passive: true });
    target.addEventListener('touchmove', move as EventListener, { passive: false });
    target.addEventListener('touchend', end as EventListener);
    target.addEventListener('touchcancel', end as EventListener);
    return () => {
      target.removeEventListener('touchstart', start as EventListener);
      target.removeEventListener('touchmove', move as EventListener);
      target.removeEventListener('touchend', end as EventListener);
      target.removeEventListener('touchcancel', end as EventListener);
    };
  });

  const progress = $derived(Math.min(1, offset / PULL_THRESHOLD));
</script>

<div
  bind:this={anchor}
  class="w-full flex items-end justify-center overflow-hidden -mb-4 {dragging || motionReduced() ? '' : 'transition-[height] duration-200 ease-out'}"
  style="height: {offset}px;"
  aria-hidden={offset === 0}
>
  {#if offset > 0}
    <div class="mb-2 flex items-center gap-2 text-caption text-content-subtle" role="status">
      <span
        class="w-8 h-8 rounded-full bg-surface border border-border shadow-card flex items-center justify-center {progress >= 1 || refreshing ? 'text-primary' : ''}"
        style="opacity: {0.4 + progress * 0.6};"
      >
        <Icon icon="ic:baseline-sync" class="text-lg {refreshing ? 'animate-spin' : ''}" style="transform: rotate({refreshing ? 0 : progress * 270}deg);" />
      </span>
      {#if refreshing}Refreshing…{:else if progress >= 1}Release to refresh{:else}{label}{/if}
    </div>
  {/if}
</div>
