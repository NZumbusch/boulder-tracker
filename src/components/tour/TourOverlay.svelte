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
  import { motionReduced, scrollBehavior } from '../../lib/motion';

  const PAD = 6;
  const MARGIN = 16;
  const GAP = 12;
  /** How much of the remaining distance the spotlight and card cover per frame. */
  const EASE = 0.28;
  /** The target hasn't moved for this many frames: the scroll to it is done. */
  const SETTLED_FRAMES = 6;

  type Rect = { top: number; left: number; width: number; height: number };
  /** Where the spotlight is drawn - eased towards the target every frame. */
  let rect = $state<Rect | null>(null);
  let cardHeight = $state(0);
  let viewport = $state({ w: 0, h: 0 });
  /** Which side of the spotlight the card sits on - chosen once per step, after the scroll settles. */
  let side = $state<'above' | 'below' | 'center' | null>(null);
  let cardTop = $state(MARGIN);
  let cardVisible = $state(false);

  // Back steps back through the tour, and closes it from the first step.
  backWhile(() => tour.active, () => (tour.index === 0 ? void tour.end() : tour.back()));

  function approach(from: number, to: number, snap: boolean): number {
    if (snap || Math.abs(to - from) < 0.5) return to;
    return from + (to - from) * EASE;
  }

  function desiredTop(r: Rect | null, s: 'above' | 'below' | 'center'): number {
    if (!r || s === 'center') return Math.max(MARGIN, (viewport.h - cardHeight) / 2);
    const top = s === 'below' ? r.top + r.height + GAP : r.top - cardHeight - GAP;
    return Math.min(Math.max(MARGIN, top), viewport.h - cardHeight - MARGIN);
  }

  /*
   * One frame loop per step. The target is re-measured every frame (its view
   * is lazy-loaded, cards animate in, the page scrolls to it), and both the
   * spotlight and the card ease towards where they should be with the same
   * per-frame step - no CSS transition restarting on every measurement,
   * which made the spotlight rubber-band behind the scroll.
   *
   * The card fades out when the step changes and only comes back once the
   * target has stopped moving, on the side that suits where it ended up.
   * Choosing the side live made it flip across the spotlight mid-scroll
   * whenever the target passed the middle of the screen.
   */
  $effect(() => {
    if (!tour.active) return;
    const target = tour.step.target;
    void tour.index;
    const snap = motionReduced();
    let frame = 0;
    let scrolled = false;
    let last: Rect | null = null;
    let still = 0;
    /** Frames spent looking for a target that isn't on screen (yet). */
    let missing = 0;
    cardVisible = false;
    side = null;
    const tick = () => {
      if (viewport.w !== window.innerWidth || viewport.h !== window.innerHeight) viewport = { w: window.innerWidth, h: window.innerHeight };
      const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
      const r = el?.getBoundingClientRect();
      let measured: Rect | null = null;
      if (el && r && r.width > 0) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
          scrolled = true;
        }
        measured = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      }

      // Spotlight: glide towards the target (or appear on it the first time).
      if (measured) {
        rect = rect
          ? {
              top: approach(rect.top, measured.top, snap),
              left: approach(rect.left, measured.left, snap),
              width: approach(rect.width, measured.width, snap),
              height: approach(rect.height, measured.height, snap),
            }
          : measured;
        missing = 0;
      } else if (!target || ++missing > 60) {
        // No target, or it hasn't shown up within a second: no spotlight,
        // card in the middle, rather than the last step's spotlight lingering.
        rect = null;
      }

      // Has the target stopped moving?
      const same = !!measured && !!last && Math.abs(measured.top - last.top) < 0.5 && Math.abs(measured.left - last.left) < 0.5;
      still = same || (!measured && (!target || missing > 60)) ? still + 1 : 0;
      last = measured;

      if (side === null && still >= SETTLED_FRAMES) {
        side = !measured ? 'center' : measured.top + measured.height / 2 < viewport.h / 2 ? 'below' : 'above';
        cardTop = desiredTop(measured, side);
        cardVisible = true;
      } else if (side !== null) {
        cardTop = approach(cardTop, desiredTop(rect, side), snap);
      }
      frame = requestAnimationFrame(tick);
    };
    // Started on the next frame, not called here: a synchronous first tick
    // would make this effect depend on the state it writes (and loop).
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
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
        class="absolute rounded-card ring-2 ring-primary pointer-events-none"
        style="top: {rect.top}px; left: {rect.left}px; width: {rect.width}px; height: {rect.height}px; box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.65);"
      ></div>
    {/if}

    <div
      bind:clientHeight={cardHeight}
      class="absolute left-1/2 -translate-x-1/2 w-[min(360px,calc(100vw-2rem))] bg-surface border border-border-strong rounded-card shadow-2xl p-4 space-y-3 transition-opacity ease-out motion-reduce:transition-none {cardVisible ? 'opacity-100 duration-200' : 'opacity-0 duration-100 pointer-events-none'}"
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
