<script lang="ts">
  /**
   * The slim rail on the left of wide screens (tablet, laptop, a phone on its
   * side): the menu button, the five destinations as icons with labels (a
   * landscape phone drops them unless Settings asks for them), Settings at the bottom. The menu button opens the
   * full drawer over the screen.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { drawer } from '../../lib/navigation/drawer.svelte';
  import { MAIN_ITEMS, SETTINGS_ITEM, menuBadge, type NavItem } from '../../lib/navigation/navItems';
  import { accentClasses } from '../../lib/navigation/accent';
  import { driveSync } from '../../lib/sync/driveSync.svelte';

  const accent = $derived(accentClasses(trainingState.navAccent));
  const badge = $derived(menuBadge({ sessionRunning: trainingState.isSessionActive, syncError: driveSync.status === 'error' }));
</script>

{#snippet item(it: NavItem)}
  {@const active = trainingState.view === it.view}
  <button
    onclick={() => trainingState.navigate(it.view)}
    class="w-14 h-14 {trainingState.navLabels ? '' : 'short:h-12'} shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors {active ? `${accent.tint} ${accent.text}` : 'text-content-muted hover:bg-surface-elevated/70 hover:text-content'}"
    aria-label={it.label}
    aria-current={active ? 'page' : undefined}
    title={it.label}
    data-tour="nav-{it.view}"
  >
    <Icon icon={it.icon} class="text-[24px]" />
    <!-- The rail has the room for labels: always on, except on a landscape phone (short) where the setting decides. -->
    <span class="text-caption font-semibold leading-none {trainingState.navLabels ? '' : 'short:hidden'}">{it.label === 'Log a workout' ? 'Log' : it.label}</span>
  </button>
{/snippet}

<nav class="w-[72px] shrink-0 pb-safe pl-[env(safe-area-inset-left)] flex flex-col items-center py-3 gap-1 bg-surface overflow-y-auto no-scrollbar" aria-label="Main">
  <button
    onclick={(e) => drawer.show(e.currentTarget as HTMLElement)}
    class="relative w-12 h-12 mb-2 shrink-0 flex items-center justify-center rounded-full text-content hover:bg-surface-elevated/70 transition-colors"
    aria-label={badge === 'sync' ? 'Open the menu - sync needs attention' : badge === 'session' ? 'Open the menu - a session is running' : 'Open the menu'}
    aria-haspopup="dialog"
    aria-expanded={drawer.open}
    data-tour="nav-menu"
  >
    <Icon icon="ic:baseline-menu" class="text-2xl" />
    {#if badge}<span class="absolute top-2 right-2 w-2.5 h-2.5 rounded-full border-2 border-surface {badge === 'sync' ? 'bg-warning' : 'bg-success'}" aria-hidden="true"></span>{/if}
  </button>
  {#each MAIN_ITEMS as it (it.id)}{@render item(it)}{/each}
  <div class="flex-1 min-h-0"></div>
  {@render item(SETTINGS_ITEM)}
</nav>
