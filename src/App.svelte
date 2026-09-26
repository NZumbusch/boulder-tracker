<script lang="ts">
  // Logic & Storage
  import { trainingState } from './lib/state.svelte';
  
  import FatigueModal from './components/common/FatigueModal.svelte';
  import ActiveSessionModal from './components/workout/ActiveSessionModal.svelte';
  import WorkoutModal from './components/workout/WorkoutModal.svelte';
  import Toast from './components/common/Toast.svelte';
  import InfoSheet from './components/common/InfoSheet.svelte';
  import Welcome from './components/onboarding/Welcome.svelte';
  import TourOverlay from './components/tour/TourOverlay.svelte';
  import { tour } from './lib/tour/tour.svelte';
  import SessionBubble from './components/workout/SessionBubble.svelte';
  import { sessionDuration } from './lib/planning/sessionDuration';
  import { onMount } from 'svelte';
  import { installAndroidBack } from './lib/navigation/backStack.svelte';
  import { installDeepLinks } from './lib/native/deepLinks';
  import { driveSync } from './lib/sync/driveSync.svelte';
  import { startWidgetSync } from './lib/widget/widgetSync.svelte';
  import type { ViewType } from './lib/types';
  import Icon from "@iconify/svelte";

  // Back navigation (see lib/navigation/backStack): the page loads as Home
  // in history's base entry, then opens the tab its address names, so back
  // from a reloaded #/plan still goes Home rather than leaving the app.
  const VIEWS: ViewType[] = ['home', 'plan', 'add', 'history', 'settings', 'analytics'];
  onMount(() => {
    const requested = window.location.hash.match(/^#\/(\w+)/)?.[1] as ViewType | undefined;
    window.history.replaceState(null, '', '#/home');
    if (requested && requested !== 'home' && VIEWS.includes(requested)) trainingState.navigate(requested);
    void installAndroidBack();
    void installDeepLinks();
    void driveSync.init();
    startWidgetSync();
  });

  // --- Derived State ---
  const plannedThisWeek = $derived(trainingState.getPlannedWorkoutsForWeek(trainingState.currentWeekId));

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', trainingState.resolvedTheme);
      // The browser/PWA chrome (address bar, task switcher) takes the
      // app background's colour, so light mode isn't framed in black.
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--theme-app-bg').trim();
      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      if (bg) meta.content = bg;
    }
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-text-scale', trainingState.textScale);
    }
  });

  // Resolves the "system" motion preference against the OS-level
  // prefers-reduced-motion query - an explicit
  // full/reduced choice always wins; "system" (the default) tracks the
  // media query live rather than being read once at load.
  $effect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const motion = trainingState.motion;
    if (motion !== 'system') {
      document.documentElement.setAttribute('data-motion', motion);
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => document.documentElement.setAttribute('data-motion', query.matches ? 'reduced' : 'full');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  });

  $effect(() => {
    if (!trainingState.isLoading) {
      trainingState.maybePromptForNotifications();
    }
  });
</script>

<main class="flex flex-col h-dvh pt-safe overflow-hidden bg-app-bg text-content font-sans">
  <!-- `overflow-x-hidden` is a guard, not a layout tool: several charts
       hang absolutely-positioned nowrap tooltips off their data points,
       and one on a right-edge point reaches past the viewport, which made
       the whole page scroll sideways into empty space on a phone. The
       tooltips are decoration, so clipping them at the edge is right;
       anything that genuinely needs horizontal room (the Analytics chip
       row, Home's weather strip) is its own `overflow-x-auto` scroller and
       is unaffected. -->
  <div class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar bg-surface flex flex-col items-center w-full p-4">
    {#if trainingState.isLoading}
      <div class="flex flex-col items-center justify-center h-full space-y-4">
        <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p class="text-content-subtle text-caption">Loading Training Data...</p>
      </div>
    {:else if trainingState.view === 'home'}
      {#await import('./components/dashboard/Home.svelte') then { default: Home }}
        <Home />
      {/await}
    {:else if trainingState.view === 'plan'}
      {#await import('./components/plan/TrainingPlan.svelte') then { default: TrainingPlan }}
        <TrainingPlan />
      {/await}
    {:else if trainingState.view === 'add'}
      {#await import('./components/workout/StartScreen.svelte') then { default: StartScreen }}
        <StartScreen plannedWorkouts={plannedThisWeek} />
      {/await}
    {:else if trainingState.view === 'history'}
      {#await import('./components/history/History.svelte') then { default: History }}
        <History />
      {/await}
    {:else if trainingState.view === 'settings'}
      {#await import('./components/settings/Settings.svelte') then { default: Settings }}
        <Settings 
          onExport={() => trainingState.exportData()}
          onImport={(e) => trainingState.importData(e)}
        />
      {/await}
    {:else if trainingState.view === 'analytics'}
      {#await import('./components/analytics/Analytics.svelte') then { default: Analytics }}
        <Analytics />
      {/await}
    {/if}
  </div>

  <nav
    class="w-full h-[calc(75px+env(safe-area-inset-bottom))] pb-safe border-t flex justify-evenly items-center shrink-0 select-none bg-surface border-border"
  >
    {#snippet tab(view: ViewType, icon: string, label: string)}
      {@const active = trainingState.view === view}
      <button
        onclick={() => trainingState.navigate(view)}
        class="flex flex-col items-center justify-center w-16 h-full cursor-pointer transition-all duration-300 {active ? 'text-success scale-105' : 'text-content-subtle scale-100'}"
        aria-label={label}
        data-tour="nav-{view}"
      >
        <Icon {icon} class="text-[24px]" />
        {#if trainingState.navLabels}
          <span class="mt-0.5 text-[10px] font-semibold leading-none">{label}</span>
        {:else}
          <div class="w-1 h-1 mt-1 rounded-full transition-all duration-300 {active ? 'bg-success scale-100' : 'bg-transparent scale-0'}"></div>
        {/if}
      </button>
    {/snippet}

    {@render tab('home', 'ic:baseline-home', 'Home')}
    {@render tab('plan', 'ic:baseline-calendar-month', 'Plan')}

    <button
      onclick={() => trainingState.navigate('add')}
      class="flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all duration-300 active:scale-90 {trainingState.view === 'add' ? 'bg-success text-app-bg shadow-[0_0_20px_var(--color-success)]' : 'bg-surface-elevated text-content-muted'}"
      aria-label="Log a workout"
      data-tour="nav-add"
    >
      <Icon icon="ic:baseline-plus" class="text-[34px]" />
    </button>

    {@render tab('history', 'ic:baseline-content-paste', 'History')}
    {@render tab('analytics', 'ic:baseline-show-chart', 'Analytics')}
  </nav>

  <!-- The live session and its minimised bubble are mounted here, outside
       the view switch, so a running session survives navigating between
       screens. They are mutually exclusive (the bubble only shows while
       the modal is closed), so the modal's stopwatch never competes with
       the bubble's own elapsed readout. -->
  <ActiveSessionModal />
  <SessionBubble />
  <WorkoutModal />
  <Toast />
  <InfoSheet />
  <TourOverlay />
  <!-- First run only: a fresh install that hasn't been welcomed and has no
       sessions (a restored or synced install skips it). -->
  {#if !trainingState.isLoading && !trainingState.welcomeDone && !tour.active && trainingState.workouts.length === 0}
    <Welcome />
  {/if}

  {#if trainingState.importProgress}
    {@const p = trainingState.importProgress}
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-app-bg/80 backdrop-blur-sm animate-in fade-in duration-200" role="status" aria-live="polite">
      <div class="w-72 bg-surface border border-border rounded-card p-5 shadow-card space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-label text-content">Importing backup</p>
          <span class="text-caption text-content-subtle tabular-nums">{Math.round(p.fraction * 100)}%</span>
        </div>
        <div class="h-2 bg-surface-elevated rounded-full overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(p.fraction * 100)}>
          <div class="h-full bg-primary rounded-full transition-[width] duration-300 ease-out" style="width: {p.fraction * 100}%"></div>
        </div>
        <p class="text-caption text-content-subtle">{p.label}…</p>
      </div>
    </div>
  {/if}

  {#if trainingState.activeWorkout && trainingState.showFatigue}
    <FatigueModal 
      initialData={trainingState.activeWorkout}
      duration={sessionDuration(trainingState.activeWorkout)}
      onConfirm={(data) => trainingState.confirmFatigue(data)} 
    />
  {/if}
</main>
