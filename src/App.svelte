<script lang="ts">
  // Logic & Storage
  import { trainingState } from './lib/state.svelte';
  import { hapticsConfig } from './lib/native/haptics';
  $effect(() => { hapticsConfig.enabled = trainingState.hapticsEnabled; });
  
  import FatigueModal from './components/common/FatigueModal.svelte';
  import ActiveSessionModal from './components/workout/ActiveSessionModal.svelte';
  import QuickTimerHost from './components/workout/QuickTimerHost.svelte';
  import WorkoutModal from './components/workout/WorkoutModal.svelte';
  import Toast from './components/common/Toast.svelte';
  import InAppBrowserBanner from './components/common/InAppBrowserBanner.svelte';
  import ExampleDataBanner from './components/common/ExampleDataBanner.svelte';
  import InfoSheet from './components/common/InfoSheet.svelte';
  import AcwrSheet from './components/dashboard/home/AcwrSheet.svelte';
  import AskAboutSheet from './components/plan/AskAboutSheet.svelte';
  import BlockReviewSheet from './components/analytics/BlockReviewSheet.svelte';
  import TaperSheet from './components/dashboard/home/TaperSheet.svelte';
  import ExerciseProgressSheet from './components/analytics/ExerciseProgressSheet.svelte';
  import Welcome from './components/onboarding/Welcome.svelte';
  import WhatsNewSheet from './components/common/WhatsNewSheet.svelte';
  import TourOverlay from './components/tour/TourOverlay.svelte';
  import { tour } from './lib/tour/tour.svelte';
  import SessionBubble from './components/workout/SessionBubble.svelte';
  import SessionActionsSheet from './components/workout/SessionActionsSheet.svelte';
  import PastSessionSheet from './components/workout/PastSessionSheet.svelte';
  import PainScreens from './components/health/PainScreens.svelte';
  import { sessionDuration } from './lib/planning/sessionDuration';
  import { onMount } from 'svelte';
  import { startWarming } from './lib/analytics/daily';
  import { Capacitor } from '@capacitor/core';
  import { shouldAskForNotifications } from './lib/notifications/promptRule';
  import { installAndroidBack } from './lib/navigation/backStack.svelte';
  import { installDialogLayer } from './lib/ui/dialogLayer';
  import { stravaSync } from './lib/strava/stravaSync.svelte';
  import { installDeepLinks } from './lib/native/deepLinks';
  import { driveSync } from './lib/sync/driveSync.svelte';
  import { healthConnect } from './lib/health/healthConnect.svelte';
  import { deviceCalendar } from './lib/calendar/deviceCalendar.svelte';
  import { startWidgetSync } from './lib/widget/widgetSync.svelte';
  import { updater } from './lib/update/updater.svelte';
  import type { ViewType } from './lib/types';
  import NavDrawer from './components/nav/NavDrawer.svelte';
  import NavRail from './components/nav/NavRail.svelte';
  import BottomBar from './components/nav/BottomBar.svelte';
  import Fab from './components/nav/Fab.svelte';
  import { scrollChrome } from './lib/navigation/scrollChrome.svelte';
  import { initialScrollHide, nextScrollHide, SCROLL_HIDE_END_ZONE, SCROLL_HIDE_TOP_ZONE } from './lib/navigation/scrollHide';
  import { layout } from './lib/navigation/layoutMode.svelte';
  import { MAIN_ITEMS, SETTINGS_ITEM } from './lib/navigation/navItems';

  const drawerNav = $derived(trainingState.navStyle === 'drawer');
  $effect(() => { document.documentElement.dataset.nav = trainingState.navStyle; });
  // Fill the analytics models in the background once the app has loaded, and again (from the new models) whenever the data
  // or a setting changes - the returned function stops the previous pass. See lib/analytics/daily.
  $effect(() => {
    if (trainingState.isLoading) return;
    return startWarming([trainingState.readingsModel, trainingState.readinessModel]);
  });
  // Soft panels (default) or fully flat sections - see `.card` in app.css.
  $effect(() => { document.documentElement.dataset.cards = trainingState.tunableOn('ui.flatCards') ? 'flat' : trainingState.tunableOn('ui.raisedCards') ? 'raised' : 'soft'; });

  // Back navigation (see lib/navigation/backStack): the page loads as Home
  // in history's base entry, then opens the tab its address names, so back
  // from a reloaded #/plan still goes Home rather than leaving the app.
  const VIEWS: ViewType[] = ['home', 'plan', 'add', 'history', 'settings', 'analytics'];
  onMount(() => {
    const requested = window.location.hash.match(/^#\/(\w+)/)?.[1] as ViewType | undefined;
    window.history.replaceState(null, '', '#/home');
    if (requested && requested !== 'home' && VIEWS.includes(requested)) trainingState.navigate(requested);
    void installAndroidBack();
    const stopDialogLayer = installDialogLayer();
    void installDeepLinks();
    void driveSync.init();
    void healthConnect.init();
    void stravaSync.init();
    void deviceCalendar.init();
    void updater.init();
    startWidgetSync();
    return stopDialogLayer;
  });

  // --- Derived State ---
  const plannedThisWeek = $derived(trainingState.getStartableWorkoutsForWeek(trainingState.currentWeekId));

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

  // Ask about reminders after the first finished session - not at launch (lib/notifications/promptRule).
  $effect(() => {
    if (shouldAskForNotifications({
      native: Capacitor.isNativePlatform(),
      loading: trainingState.isLoading,
      welcomeDone: trainingState.welcomeDone,
      completedSessions: trainingState.workouts.filter((w) => w.status === 'completed').length,
      sessionRunning: trainingState.isSessionActive,
      ratingOpen: !!trainingState.activeWorkout && trainingState.showFatigue,
      exampleData: trainingState.demoActive,
    })) {
      void trainingState.maybePromptForNotifications();
    }
  });

  // The floating + gets out of the way while the screen is scrolled down through content (lib/navigation/scrollHide).
  let scrollHide = initialScrollHide;
  function onContentScroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    scrollHide = nextScrollHide(scrollHide, el.scrollTop, { atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_HIDE_END_ZONE });
    scrollChrome.hidden = scrollHide.hidden;
    scrollChrome.scrolled = el.scrollTop > SCROLL_HIDE_TOP_ZONE;
  }
  // Keyboard and screen-reader users: a way past the navigation, and the new screen's name said when the view changes.
  let scroller = $state<HTMLElement | null>(null);
  const viewName = $derived([...MAIN_ITEMS, SETTINGS_ITEM].find((i) => i.view === trainingState.view)?.label ?? '');
  let announce = $state('');
  let firstView = true;
  $effect(() => {
    const name = viewName;
    // Not at launch: a screen reader already reads the page then.
    if (firstView) { firstView = false; return; }
    announce = name;
  });

  // Loading that never ends (storage that cannot be read) needs a way out, not three dots.
  let slowLoad = $state(false);
  $effect(() => {
    if (!trainingState.isLoading) { slowLoad = false; return; }
    const timer = setTimeout(() => (slowLoad = true), 12000);
    return () => clearTimeout(timer);
  });

  // The import overlay is read out in quarters, not on every tick.
  const importSpoken = $derived(trainingState.importProgress ? `${trainingState.importProgress.label}, ${Math.min(100, Math.floor(trainingState.importProgress.fraction * 4) * 25)} percent` : '');

  // A new screen starts at its top, with the + back.
  $effect(() => {
    void trainingState.view;
    scrollHide = initialScrollHide;
    scrollChrome.hidden = false;
    scrollChrome.scrolled = false;
  });
</script>

<!-- A screen is its own chunk. While it loads there is a spinner; if it cannot load (offline right after an update, a
     stale chunk name) there is a way out - reloading fetches the current files - not a blank page. -->
{#snippet pending()}
  <div class="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
    <div class="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
{/snippet}
{#snippet failed()}
  <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6" role="alert">
    <p class="text-body text-content">This screen could not load.</p>
    <p class="text-caption text-content-subtle">That usually means the connection dropped just after an update.</p>
    <button onclick={() => window.location.reload()} class="btn btn-primary">Reload the app</button>
  </div>
{/snippet}

<main class="flex flex-col h-dvh pt-safe overflow-hidden bg-app-bg text-content font-sans">
  <button type="button" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[300] btn btn-primary" onclick={() => scroller?.focus()}>Skip to the screen</button>
  <div class="sr-only" role="status" aria-live="polite">{announce}</div>
  <InAppBrowserBanner />
  <ExampleDataBanner />
  <!-- `overflow-x-hidden` is a guard, not a layout tool: several charts
       hang absolutely-positioned nowrap tooltips off their data points,
       and one on a right-edge point reaches past the viewport, which made
       the whole page scroll sideways into empty space on a phone. The
       tooltips are decoration, so clipping them at the edge is right;
       anything that genuinely needs horizontal room (the Analytics chip
       row, Home's weather strip) is its own `overflow-x-auto` scroller and
       is unaffected. -->
  <div class="flex-1 min-h-0 flex">
  {#if drawerNav && layout.wide}<NavRail />{/if}
  <!-- On a wide screen (a mouse, a window) the thin scrollbar stays, so there is something to grab. -->
  <div bind:this={scroller} tabindex="-1" onscroll={onContentScroll} class="flex-1 min-w-0 overflow-y-auto overflow-x-hidden outline-none {layout.wide ? '' : 'no-scrollbar'} bg-surface flex flex-col items-center w-full p-4 pt-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] {drawerNav ? 'pb-[calc(1rem+env(safe-area-inset-bottom)+var(--fab-b))]' : ''}">
    {#if trainingState.isLoading}
      <div class="flex flex-col items-center justify-center h-full space-y-4">
        <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p class="text-content-subtle text-caption">Loading your training data…</p>
        {#if slowLoad}
          <div class="text-center space-y-2 px-6" role="alert">
            <p class="text-caption text-content-muted">This is taking longer than it should. Your data has not been touched.</p>
            <button type="button" onclick={() => window.location.reload()} class="btn btn-secondary">Reload the app</button>
          </div>
        {/if}
      </div>
    {:else if trainingState.view === 'home'}
      {#await import('./components/dashboard/Home.svelte')}
        {@render pending()}
      {:then { default: Home }}
        <Home />
      {:catch}
        {@render failed()}
      {/await}
    {:else if trainingState.view === 'plan'}
      {#await import('./components/plan/TrainingPlan.svelte')}
        {@render pending()}
      {:then { default: TrainingPlan }}
        <TrainingPlan />
      {:catch}
        {@render failed()}
      {/await}
    {:else if trainingState.view === 'add'}
      {#await import('./components/workout/StartScreen.svelte')}
        {@render pending()}
      {:then { default: StartScreen }}
        <StartScreen plannedWorkouts={plannedThisWeek} />
      {:catch}
        {@render failed()}
      {/await}
    {:else if trainingState.view === 'history'}
      {#await import('./components/history/History.svelte')}
        {@render pending()}
      {:then { default: History }}
        <History />
      {:catch}
        {@render failed()}
      {/await}
    {:else if trainingState.view === 'settings'}
      {#await import('./components/settings/Settings.svelte')}
        {@render pending()}
      {:then { default: Settings }}
        <Settings 
          onExport={() => trainingState.exportData()}
          onImport={(e) => trainingState.importData(e)}
        />
      {:catch}
        {@render failed()}
      {/await}
    {:else if trainingState.view === 'analytics'}
      {#await import('./components/analytics/Analytics.svelte')}
        {@render pending()}
      {:then { default: Analytics }}
        <Analytics />
      {:catch}
        {@render failed()}
      {/await}
    {/if}
  </div>
  </div>

  {#if drawerNav}
    <SessionBubble variant="strip" />
    <NavDrawer />
    <Fab />
  {:else}
  <BottomBar />
  {/if}

  <!-- The live session and its minimised bubble are mounted here, outside
       the view switch, so a running session survives navigating between
       screens. They are mutually exclusive (the bubble only shows while
       the modal is closed), so the modal's stopwatch never competes with
       the bubble's own elapsed readout. -->
  <ActiveSessionModal />
  <QuickTimerHost />
  <SessionActionsSheet />
  <PastSessionSheet />
  <PainScreens />
  <WorkoutModal />
  <Toast />
  <InfoSheet />
  <AcwrSheet />
  <AskAboutSheet />
  <BlockReviewSheet />
  <TaperSheet />
  <ExerciseProgressSheet />
  <TourOverlay />
  <WhatsNewSheet />
  <!-- First run only: a fresh install that hasn't been welcomed and has no
       sessions (a restored or synced install skips it). -->
  {#if !trainingState.isLoading && !trainingState.welcomeDone && !tour.active && trainingState.workouts.length === 0}
    <Welcome />
  {/if}

  {#if trainingState.importProgress}
    {@const p = trainingState.importProgress}
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-app-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
      <p class="sr-only" aria-live="polite" aria-atomic="true">{importSpoken}</p>
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
