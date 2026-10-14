<script lang="ts">
  /**
   * The slim bar at the top of every screen: the menu button (a back arrow on
   * a nested page), the screen's title with an optional line under it, and
   * that screen's own actions on the right. It is always the same height, so
   * nothing jumps when you move between screens. With the bottom bar chosen
   * (Settings -> Navigation) or on a wide screen (where a rail holds the
   * menu) it simply has no menu button.
   */
  import type { Snippet } from 'svelte';
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { layout } from '../../lib/navigation/layoutMode.svelte';
  import { drawer } from '../../lib/navigation/drawer.svelte';
  import { appBarBack } from '../../lib/navigation/navItems';
  import { scrollChrome } from '../../lib/navigation/scrollChrome.svelte';

  let { title, subtitle, onBack, actions }: { title: string; subtitle?: string; onBack?: () => void; actions?: Snippet } = $props();

  const lead = $derived(appBarBack({ nested: !!onBack }));
  const showMenu = $derived(lead === 'menu' && trainingState.navStyle === 'drawer' && !layout.wide);
  const showLead = $derived(lead === 'back' || showMenu);
  /** Slides away while the screen is scrolled down through content (Settings -> Look & feel), and comes back on scrolling up. */
  const away = $derived(scrollChrome.hidden && trainingState.tunableOn('nav.hideBarOnScroll'));
</script>

<!-- Flush to the screen's edges (the page has 16 px of side padding and none on top). It is sticky so it can come back the
     moment you scroll up, and slides out of the way while you read on - content cut off by a bar that stays is the ugly
     part. Over content it has an opaque ground and a soft edge, never a see-through band. Must be the first thing in its
     screen. z-50: nothing inside a screen (chart tips, the calendar's year chips) may draw over it. -->
<header
  class="sticky top-0 z-50 -mx-4 mb-2 px-2 h-[52px] short:h-11 flex items-center gap-1 bg-surface transition-[transform,box-shadow] duration-200 ease-out motion-reduce:transition-none {away ? '-translate-y-full pointer-events-none' : ''} {scrollChrome.scrolled && !away ? 'shadow-[0_1px_0_var(--color-border),0_6px_16px_rgb(0_0_0/0.06)]' : ''}"
  aria-hidden={away}
  inert={away}
>
  {#if showLead}
    <button
      onclick={(e) => (lead === 'back' ? onBack?.() : drawer.show(e.currentTarget as HTMLElement))}
      class="w-11 h-11 -ml-0.5 flex items-center justify-center rounded-full text-content hover:bg-surface-elevated/70 active:bg-surface-elevated transition-colors shrink-0"
      aria-label={lead === 'back' ? 'Back' : 'Open the menu'}
      aria-haspopup={lead === 'menu' ? 'dialog' : undefined}
      aria-expanded={lead === 'menu' ? drawer.open : undefined}
      data-tour="nav-menu"
    >
      <Icon icon={lead === 'back' ? 'ic:baseline-arrow-back' : 'ic:baseline-menu'} class="text-2xl" />
    </button>
  {/if}
  <div class="flex-1 min-w-0 {showLead ? '' : 'pl-2'}">
    <h1 class="text-title text-content truncate leading-tight">{title}</h1>
    {#if subtitle}<p class="text-caption text-content-subtle truncate leading-tight">{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="flex items-center gap-0.5 shrink-0">{@render actions()}</div>{/if}
</header>
