<script lang="ts">
  /**
   * The side drawer: every destination, Settings, the tour. It slides over the
   * screen from the left behind a scrim; Android back, Escape, a tap outside
   * or choosing something closes it. A running session shows first, as a way
   * back into it.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
  import { drawer } from '../../lib/navigation/drawer.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { drawerRows, type DrawerRow } from '../../lib/navigation/navItems';
  import { driveSync } from '../../lib/sync/driveSync.svelte';

  backWhile(() => drawer.open, () => drawer.close());

  const rows = $derived(drawerRows({ sessionRunning: trainingState.isSessionActive, syncError: driveSync.status === 'error' }));
  const current = $derived(trainingState.view);
  let panel = $state<HTMLElement | null>(null);

  // Focus moves into the drawer when it opens (and back to the button that opened it when it closes - see `drawer.close`).
  $effect(() => {
    if (drawer.open) queueMicrotask(() => (panel?.querySelector('[data-active="true"], button') as HTMLElement | null)?.focus());
  });

  function choose(row: DrawerRow) {
    drawer.close();
    if (row.kind === 'view') {
      trainingState.navigate(row.view);
    } else if (row.id === 'resume') {
      trainingState.sessionStore.openModal();
    } else if (row.id === 'tour') {
      void tour.start();
    } else if (row.id === 'sync') {
      trainingState.uiStore.openSettingsPage('sync');
    }
  }

</script>

{#if drawer.open}
  <!-- The dialog layer (lib/ui/dialogLayer) treats this as a dialog: the page behind goes inert, Tab stays inside, Escape closes it. -->
  <div class="fixed inset-0 z-[140]">
    <button class="absolute inset-0 bg-black/55 animate-in fade-in duration-150" aria-label="Close the menu" tabindex="-1" onclick={() => drawer.close()}></button>
    <nav
      bind:this={panel}
      aria-label="Main menu"
      class="absolute inset-y-0 left-0 w-[84%] max-w-80 bg-surface pt-safe pb-safe flex flex-col shadow-[0_0_40px_rgb(0_0_0/0.35)] animate-in slide-in-from-left duration-200"
    >
      <p class="px-6 pt-5 pb-3 text-title text-content">Boulder Tracker</p>
      <ul class="flex-1 overflow-y-auto no-scrollbar px-3 pb-3 space-y-0.5">
        {#each rows as row, i (row.id)}
          {@const active = row.kind === 'view' && current === row.view}
          <!-- A little air before Settings, where the destinations end. -->
          {#if row.id === 'settings'}<li class="h-2" aria-hidden="true"></li>{/if}
          <li>
            <button
              onclick={() => choose(row)}
              data-active={active}
              aria-current={active ? 'page' : undefined}
              class="w-full h-12 px-4 flex items-center gap-4 rounded-full text-body text-left transition-colors {active ? 'bg-primary/12 text-primary font-semibold' : row.kind === 'action' && row.id === 'resume' ? 'bg-success/15 text-success font-semibold' : 'text-content hover:bg-surface-elevated/70'}"
            >
              <Icon icon={row.icon} class="text-[22px] shrink-0 {row.kind === 'view' && row.id === 'add' ? 'text-content-muted' : ''}" />
              <span class="truncate">{row.label}</span>
              {#if row.kind === 'action' && row.id === 'resume'}<span class="ml-auto text-caption tabular-nums opacity-80">{Math.floor(trainingState.sessionStore.elapsedMinutes)} min</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
{/if}
