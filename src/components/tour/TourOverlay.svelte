<script lang="ts">
  /**
   * Draws the tour (lib/tour): dims the screen, cuts a spotlight around the
   * step's `data-tour` element and puts the step's text next to it. It
   * covers the whole app while open, so nothing underneath can be tapped -
   * the example data can only be looked at.
   *
   * The target is re-measured every frame rather than on events: the view
   * it lives on is lazy-loaded, cards animate in and the page scrolls, and
   * one cheap getBoundingClientRect per frame follows all of that without a
   * listener for each.
   */
  import { tour } from '../../lib/tour/tour.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';

  const PAD = 6;
  const MARGIN = 16;

  let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
  let cardHeight = $state(0);
  let viewport = $state({ w: 0, h: 0 });

  // Back steps back through the tour, and closes it from the first step.
  backWhile(() => tour.active, () => (tour.index === 0 ? void tour.end() : tour.back()));

  $effect(() => {
    if (!tour.active) return;
    const target = tour.step.target;
    let frame = 0;
    let scrolled = false;
    const tick = () => {
      if (viewport.w !== window.innerWidth || viewport.h !== window.innerHeight) viewport = { w: window.innerWidth, h: window.innerHeight };
      const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          scrolled = true;
        }
        const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        if (!rect || rect.top !== next.top || rect.left !== next.left || rect.width !== next.width || rect.height !== next.height) rect = next;
      } else if (rect) {
        rect = null;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  });

  /** Below the spotlight when it sits in the top half, above it otherwise; centred without one. */
  const cardTop = $derived.by(() => {
    if (!rect) return Math.max(MARGIN, (viewport.h - cardHeight) / 2);
    const below = rect.top + rect.height / 2 < viewport.h / 2;
    const top = below ? rect.top + rect.height + 12 : rect.top - cardHeight - 12;
    return Math.min(Math.max(MARGIN, top), viewport.h - cardHeight - MARGIN);
  });

  function onKey(e: KeyboardEvent) {
    if (!tour.active) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') tour.next();
    else if (e.key === 'ArrowLeft') tour.back();
    else if (e.key === 'Escape') void tour.end();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if tour.active}
  <div class="fixed inset-0 z-[170]" role="dialog" aria-modal="true" aria-label="Tour: {tour.step.title}">
    <!-- Swallows every tap on the app underneath. -->
    <div class="absolute inset-0 {rect ? '' : 'bg-black/65'}"></div>
    {#if rect}
      <div
        class="absolute rounded-card ring-2 ring-primary pointer-events-none transition-all duration-300 ease-out"
        style="top: {rect.top}px; left: {rect.left}px; width: {rect.width}px; height: {rect.height}px; box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.65);"
      ></div>
    {/if}

    <div
      bind:clientHeight={cardHeight}
      class="absolute left-1/2 -translate-x-1/2 w-[min(360px,calc(100vw-2rem))] bg-surface border border-border-strong rounded-card shadow-2xl p-4 space-y-3 transition-[top] duration-300 ease-out"
      style="top: {cardTop}px;"
    >
      <div class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-body font-bold text-content">{tour.step.title}</h3>
          <span class="text-caption text-content-subtle tabular-nums shrink-0">{tour.index + 1} / {tour.count}</span>
        </div>
        <p class="text-body text-content-muted leading-relaxed">{tour.step.body}</p>
      </div>
      <div class="flex items-center gap-2">
        {#if tour.index < tour.count - 1}
          <button onclick={() => tour.end()} class="mr-auto px-1 py-2 text-label text-content-subtle hover:text-content">Skip tour</button>
        {:else}
          <span class="mr-auto"></span>
        {/if}
        {#if tour.index > 0}
          <button onclick={() => tour.back()} class="px-3 py-2 text-label text-content-muted bg-surface-elevated rounded-control">Back</button>
        {/if}
        <button onclick={() => tour.next()} class="px-4 py-2 text-label text-white bg-primary rounded-control">
          {tour.index === tour.count - 1 ? 'Done' : 'Next'}
        </button>
      </div>
    </div>
  </div>
{/if}
