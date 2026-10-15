<script lang="ts">
  /**
   * The slim bar at the top of every screen: the menu button (a back arrow on
   * a nested page), the screen's title with an optional line under it, and
   * that screen's own actions on the right. It is always the same height, so
   * nothing jumps when you move between screens. It scrolls with the page. With the bottom bar chosen
   * (Settings -> Navigation) or on a wide screen (where a rail holds the
   * menu) it simply has no menu button.
   */
  import type { Snippet } from 'svelte';
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { layout } from '../../lib/navigation/layoutMode.svelte';
  import { drawer } from '../../lib/navigation/drawer.svelte';
  import { appBarBack, menuBadge } from '../../lib/navigation/navItems';
  import { driveSync } from '../../lib/sync/driveSync.svelte';

  let { title, subtitle, onBack, actions }: { title: string; subtitle?: string; onBack?: () => void; actions?: Snippet } = $props();

  const lead = $derived(appBarBack({ nested: !!onBack }));
  const showMenu = $derived(lead === 'menu' && trainingState.navStyle === 'drawer' && !layout.wide);
  const showLead = $derived(lead === 'back' || showMenu);
  // The menu (drawer) holds the way back into a running session and the sync warning; the bottom bar has no drawer, so
  // there Settings is a button in the bar itself on every screen and carries the sync dot.
  const badge = $derived(menuBadge({ sessionRunning: trainingState.isSessionActive, syncError: driveSync.status === 'error' }));
  const showSettings = $derived(trainingState.navStyle === 'bar' && trainingState.view !== 'settings' && lead === 'menu');
</script>

<!-- Flush to the screen's edges (the page has 16 px of side padding and none on top). Part of the page: it scrolls away
     with the content like any other heading. Must be the first thing in its screen. -->
<header class="-mx-4 mb-2 px-2 h-[52px] short:h-11 flex items-center gap-1 bg-surface">
  {#if showLead}
    <button
      onclick={(e) => (lead === 'back' ? onBack?.() : drawer.show(e.currentTarget as HTMLElement))}
      class="relative w-11 h-11 -ml-0.5 flex items-center justify-center rounded-full text-content hover:bg-surface-elevated/70 active:bg-surface-elevated transition-colors shrink-0"
      aria-label={lead === 'back' ? 'Back' : badge === 'sync' ? 'Open the menu - sync needs attention' : badge === 'session' ? 'Open the menu - a session is running' : 'Open the menu'}
      aria-haspopup={lead === 'menu' ? 'dialog' : undefined}
      aria-expanded={lead === 'menu' ? drawer.open : undefined}
      data-tour="nav-menu"
    >
      <Icon icon={lead === 'back' ? 'ic:baseline-arrow-back' : 'ic:baseline-menu'} class="text-2xl" />
      {#if lead === 'menu' && badge}<span class="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full border-2 border-surface {badge === 'sync' ? 'bg-warning' : 'bg-success'}" aria-hidden="true"></span>{/if}
    </button>
  {/if}
  <div class="flex-1 min-w-0 {showLead ? '' : 'pl-2'}">
    <h1 class="text-title text-content truncate leading-tight">{title}</h1>
    {#if subtitle}<p class="text-caption text-content-subtle truncate leading-tight">{subtitle}</p>{/if}
  </div>
  {#if actions || showSettings}
    <div class="flex items-center gap-0.5 shrink-0">
      {#if actions}{@render actions()}{/if}
      {#if showSettings}
        <button onclick={() => trainingState.navigate('settings')} class="btn-icon relative" aria-label={driveSync.status === 'error' ? 'Settings - sync needs attention' : 'Settings'}>
          <Icon icon="ic:baseline-settings" class="text-2xl" />
          {#if driveSync.status === 'error'}<span class="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full border-2 border-surface bg-warning" aria-hidden="true"></span>{/if}
        </button>
      {/if}
    </div>
  {/if}
</header>
