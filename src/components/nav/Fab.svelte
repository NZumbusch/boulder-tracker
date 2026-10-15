<script lang="ts">
  /**
   * The floating +, bottom right. What it does depends on the screen: log a
   * workout from Home, History and Analytics; add a session on the selected
   * day on Plan. It is not shown on Log or in Settings, while a session is
   * running (its bubble takes the corner) or while a Plan B is being edited.
   * It tells the rest of the shell how much room it takes (`--fab-b`), so the
   * toast and the timer pill sit above it instead of on it.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { fabFor } from '../../lib/navigation/navItems';
  import { fabActions } from '../../lib/navigation/fabActions.svelte';
  import { scrollChrome } from '../../lib/navigation/scrollChrome.svelte';
  import { accentClasses } from '../../lib/navigation/accent';

  const accent = $derived(accentClasses(trainingState.navAccent));

  const action = $derived(fabFor(trainingState.view, { sessionRunning: trainingState.isSessionActive, inEditor: !!trainingState.planBEditing }));
  const label = $derived(action === 'add-to-plan' ? 'Add a session to the plan' : 'Log a workout');

  $effect(() => {
    document.documentElement.style.setProperty('--fab-b', action ? '76px' : '0px');
    return () => document.documentElement.style.setProperty('--fab-b', '0px');
  });

  function press() {
    if (action === 'add-to-plan') fabActions.addToPlan?.();
    else trainingState.navigate('add');
  }
</script>

{#if action}
  <button
    onclick={press}
    class="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--chrome-b)+16px+env(safe-area-inset-bottom))] z-[80] w-14 h-14 rounded-full {accent.solid} shadow-card flex items-center justify-center active:scale-90 transition-[transform,opacity] duration-200 animate-in zoom-in-75 {scrollChrome.hidden ? 'translate-y-24 opacity-0 pointer-events-none' : ''}"
    tabindex={scrollChrome.hidden ? -1 : 0}
    aria-hidden={scrollChrome.hidden}
    aria-label={label}
    title={label}
    data-tour="fab-add"
  >
    <Icon icon="ic:baseline-plus" class="text-[32px]" />
  </button>
{/if}
