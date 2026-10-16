<script lang="ts">
  /**
   * The bottom bar (the default on a phone held upright): four destinations and, in the middle, Log a workout - which
   * becomes the way back into the session while one is running. The current destination is its icon in the chosen accent
   * with a small dot under it (the rail and the drawer keep their soft pill), the label between them when labels are on.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { accentClasses } from '../../lib/navigation/accent';
  import { MAIN_ITEMS, type NavItem } from '../../lib/navigation/navItems';
  import SessionBubble from '../workout/SessionBubble.svelte';

  const accent = $derived(accentClasses(trainingState.navAccent));
  const store = trainingState.sessionStore;
  const sessionUp = $derived(store.isActive && !store.isModalOpen && !trainingState.showFatigue);
  const tabs = MAIN_ITEMS.filter((i) => i.view !== 'add');
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);
  const logActive = $derived(trainingState.view === 'add');
</script>

{#snippet tab(it: NavItem)}
  {@const active = trainingState.view === it.view}
  <button
    onclick={() => trainingState.navigate(it.view)}
    class="flex flex-col items-center justify-center gap-0.5 w-16 h-full cursor-pointer {active ? accent.text : 'text-content-subtle'}"
    aria-label={it.label}
    aria-current={active ? 'page' : undefined}
    data-tour="nav-{it.view}"
  >
    <span class="w-14 h-8 short:h-7 grid place-items-center">
      <Icon icon={it.icon} class="text-[24px] short:text-[22px]" />
    </span>
    {#if trainingState.navLabels}<span class="text-caption font-semibold leading-none">{it.label}</span>{/if}
    <span class="w-1.5 h-1.5 rounded-full transition-colors duration-200 {active ? accent.solid : 'bg-transparent'}" aria-hidden="true"></span>
  </button>
{/snippet}

<nav
  class="w-full h-[calc(75px+env(safe-area-inset-bottom))] short:h-[calc(52px+env(safe-area-inset-bottom))] pb-safe border-t flex justify-evenly items-center shrink-0 select-none bg-surface border-border"
  aria-label="Main"
>
  {#each left as it (it.id)}{@render tab(it)}{/each}

  {#if sessionUp}
    <SessionBubble variant="button" />
  {:else}
    <button
      onclick={() => trainingState.navigate('add')}
      class="flex items-center justify-center w-12 h-12 short:w-10 short:h-10 rounded-full cursor-pointer transition-colors duration-200 active:scale-90 {logActive ? accent.solid : 'bg-surface-elevated text-content-muted'}"
      aria-label="Log a workout"
      aria-current={logActive ? 'page' : undefined}
      data-tour="nav-add"
    >
      <Icon icon="ic:baseline-plus" class="text-[34px] short:text-[28px]" />
    </button>
  {/if}

  {#each right as it (it.id)}{@render tab(it)}{/each}
</nav>
