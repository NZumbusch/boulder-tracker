<script lang="ts">
  import AppBar from '../nav/AppBar.svelte';
  import UpdateCard from '../update/UpdateCard.svelte';
  import AndroidAppCard from './AndroidAppCard.svelte';
  import PainCheckInCard from './home/PainCheckInCard.svelte';
  import CheckinCard from './home/CheckinCard.svelte';
  import { updater } from '../../lib/update/updater.svelte';
  /**
   * Home: a header (date, phase and block week, quick log) and
   * the cards, in the order and with the visibility set in Settings. Each
   * card is its own component under `home/`; the values more than one card
   * reads live in `HomeData`, computed once here and passed down.
   */
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { HomeData } from './home/homeData.svelte';
  import QuickLogSheet from './QuickLogSheet.svelte';
  import ChecklistCard from './home/ChecklistCard.svelte';
  import ReadinessCard from './home/ReadinessCard.svelte';
  import { hasAnyData, isHiddenWhileNew } from '../../lib/home/newUser';
  import AlertsCard from './home/AlertsCard.svelte';
  import ProgressCard from './home/ProgressCard.svelte';
  import CragsCard from './home/CragsCard.svelte';
  import TodayCard from './home/TodayCard.svelte';
  import MetricsCard from './home/MetricsCard.svelte';
  import TimerCard from './home/TimerCard.svelte';
  import FatigueCard from './home/FatigueCard.svelte';
  import ThisWeekCard from './home/ThisWeekCard.svelte';
  import TrainingBlockCard from './home/TrainingBlockCard.svelte';
  import WeekRecapCard from './home/WeekRecapCard.svelte';
  import NextGoalCard from './home/NextGoalCard.svelte';
  import RecentActivityCard from './home/RecentActivityCard.svelte';
  import WeatherCard from './home/WeatherCard.svelte';
  import Icon from "@iconify/svelte";
  import PullToRefresh from '../common/PullToRefresh.svelte';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import { healthConnect } from '../../lib/health/healthConnect.svelte';
  import { toast } from '../../lib/toast.svelte';

  const data = new HomeData();
  const hasData = $derived(
    hasAnyData({
      workouts: trainingState.workouts,
      dailyMetrics: trainingState.dailyMetrics,
      benchmarks: trainingState.benchmarks,
      painLogs: trainingState.painLogs,
      outdoorAscents: trainingState.outdoorAscents,
    }),
  );

  // Weather is fetched once per mount, not on every `refresh()` (a network
  // call on every save would be excessive for conditions that change over
  // hours). No-ops per location if it isn't set.
  onMount(() => {
    trainingState.refreshWeather();
  });

  /**
   * Pull down on Home: everything that comes from outside the app, at once -
   * Drive sync, Health Connect, weather, app updates. Each reports its own
   * errors; this says what ran.
   */
  async function pullRefresh() {
    const ran: string[] = [];
    const tasks: Promise<unknown>[] = [trainingState.refreshWeather()];
    if (driveSync.connected) {
      ran.push('synced');
      tasks.push(driveSync.syncNow());
    }
    if (healthConnect.supported && healthConnect.enabled) {
      ran.push('Health Connect imported');
      tasks.push(healthConnect.importNow({ quiet: true }));
    }
    if (updater.supported && updater.auto) tasks.push(updater.check());
    await Promise.allSettled(tasks);
    const failed = driveSync.connected && driveSync.status === 'error';
    toast.show(failed ? `Sync failed${driveSync.error ? `: ${driveSync.error}` : ''}` : ran.length ? `Up to date - ${ran.join(', ')}` : 'Up to date');
  }

  let refreshing = $state(false);
  async function refreshNow() {
    refreshing = true;
    try {
      await pullRefresh();
    } finally {
      refreshing = false;
    }
  }

  let showQuickLog = $state(false);
  let quickLogStart = $state<'pain' | 'bodyweight' | 'send' | 'benchmark' | null>(null);

  // A launcher shortcut / the widget asked for the quick log (see lib/navigation/deepLink).
  // "metrics" is MetricsCard's to handle - unless that card is hidden, then there's nothing to open.
  $effect(() => {
    const request = trainingState.uiStore.homeRequest;
    if (request === 'quickLog') {
      quickLogStart = trainingState.uiStore.quickLogAction;
      trainingState.uiStore.quickLogAction = null;
      showQuickLog = true;
      trainingState.uiStore.homeRequest = null;
    } else if (request === 'metrics' && !trainingState.homeSections.some((s) => s.id === 'metrics' && s.visible)) {
      trainingState.uiStore.homeRequest = null;
    }
  });
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in duration-200 pb-24">
  <AppBar title={data.currentPhaseName ?? 'Home'} subtitle={`${data.todayLabel}${data.blockWeekPosition ? ` · Week ${data.blockWeekPosition.week} of ${data.blockWeekPosition.of}` : ''}`}>
    {#snippet actions()}
      <!-- Pulling down needs a finger: with a mouse (or a screen reader) this is the way to sync and refresh. -->
      <button onclick={refreshNow} disabled={refreshing} class="btn-icon hidden pointer-fine:inline-grid" aria-label="Refresh: sync, weather and updates" title="Refresh">
        <Icon icon="ic:baseline-refresh" class="text-xl {refreshing ? 'animate-spin' : ''}" />
      </button>
      {#if trainingState.quickLogActions.some((a) => a.visible)}
        <button
          onclick={() => showQuickLog = true}
          class="btn-icon text-primary"
          aria-label="Quick log: pain, bodyweight, send or test result"
          data-tour="home-quicklog"
          title="Quick log"
        >
          <Icon icon="ic:baseline-edit" class="text-xl" />
        </button>
      {/if}
    {/snippet}
  </AppBar>
  <PullToRefresh onRefresh={pullRefresh} label={driveSync.connected ? 'Pull to sync' : 'Pull to refresh'} />

  <!-- Each section in `trainingState.homeSections`' order, skipping hidden
       ones. The header above isn't part of this list - always shown, first. -->
  {#if updater.showBanner}<UpdateCard compact />{/if}
  <AndroidAppCard />
  <PainCheckInCard />
  <CheckinCard />

  {#each trainingState.homeSections as section (section.id)}
    {#if section.visible && !isHiddenWhileNew(section.id, trainingState.simpleHome, hasData)}
      <div data-tour="home-{section.id}" class="empty:hidden">
      {#if section.id === 'checklist'}<ChecklistCard onBodyweight={() => { quickLogStart = 'bodyweight'; showQuickLog = true; }} />
      {:else if section.id === 'readiness'}<ReadinessCard {data} />
      {:else if section.id === 'alerts'}<AlertsCard {data} />
      {:else if section.id === 'progress'}<ProgressCard {data} />
      {:else if section.id === 'crags'}<CragsCard {data} />
      {:else if section.id === 'today'}<TodayCard {data} />
      {:else if section.id === 'timer'}<TimerCard />
      {:else if section.id === 'metrics'}<MetricsCard {data} />
      {:else if section.id === 'fatigue'}<FatigueCard {data} />
      {:else if section.id === 'thisWeek'}<ThisWeekCard {data} />
      {:else if section.id === 'weekRecap'}<WeekRecapCard {data} />
      {:else if section.id === 'trainingBlock'}<TrainingBlockCard {data} />
      {:else if section.id === 'competition'}<NextGoalCard {data} />
      {:else if section.id === 'recentActivity'}<RecentActivityCard />
      {:else if section.id === 'weather'}<WeatherCard />
      {/if}
      </div>
    {/if}
  {/each}
</div>

{#if showQuickLog}
  <QuickLogSheet initialKind={quickLogStart} onClose={() => { showQuickLog = false; quickLogStart = null; }} />
{/if}
