<script lang="ts">
  import UpdateCard from '../update/UpdateCard.svelte';
  import PainCheckInCard from './home/PainCheckInCard.svelte';
  import { updater } from '../../lib/update/updater.svelte';
  /**
   * Home: a header (date, phase and block week, quick log, settings) and
   * the cards, in the order and with the visibility set in Settings. Each
   * card is its own component under `home/`; the values more than one card
   * reads live in `HomeData`, computed once here and passed down.
   */
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { HomeData } from './home/homeData.svelte';
  import QuickLogSheet from './QuickLogSheet.svelte';
  import ReadinessCard from './home/ReadinessCard.svelte';
  import AlertsCard from './home/AlertsCard.svelte';
  import ProgressCard from './home/ProgressCard.svelte';
  import CragsCard from './home/CragsCard.svelte';
  import TodayCard from './home/TodayCard.svelte';
  import MetricsCard from './home/MetricsCard.svelte';
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
    toast.show(failed ? `Sync failed${driveSync.error ? `: ${driveSync.error}` : ''}` : ran.length ? `Up to date - ${ran.join(', ')}` : 'Weather refreshed');
  }

  let showQuickLog = $state(false);

  // A launcher shortcut / the widget asked for the quick log (see lib/navigation/deepLink).
  // "metrics" is MetricsCard's to handle - unless that card is hidden, then there's nothing to open.
  $effect(() => {
    const request = trainingState.uiStore.homeRequest;
    if (request === 'quickLog') {
      showQuickLog = true;
      trainingState.uiStore.homeRequest = null;
    } else if (request === 'metrics' && !trainingState.homeSections.some((s) => s.id === 'metrics' && s.visible)) {
      trainingState.uiStore.homeRequest = null;
    }
  });
</script>

<div class="w-full max-w-lg space-y-4 animate-in fade-in duration-200 pb-24">
  <PullToRefresh onRefresh={pullRefresh} label={driveSync.connected ? 'Pull to sync' : 'Pull to refresh'} />
  <div class="flex items-center justify-between px-1">
    <div>
      <p class="text-caption text-content-subtle">{data.todayLabel}</p>
      <h2 class="text-title text-content flex items-center gap-2 flex-wrap">
        <span>{data.currentPhaseName ?? 'Home'}</span>
        {#if data.blockWeekPosition}
          <span class="w-1 h-1 bg-surface-elevated-hover rounded-full flex-shrink-0"></span>
          <span class="text-content-subtle font-normal">Week {data.blockWeekPosition.week} of {data.blockWeekPosition.of}</span>
        {/if}
      </h2>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      {#if trainingState.quickLogActions.some((a) => a.visible)}
      <button
          onclick={() => showQuickLog = true}
          class="p-2 rounded-control text-primary hover:bg-surface-elevated transition-colors"
          aria-label="Quick log: pain, bodyweight, send or benchmark"
          data-tour="home-quicklog"
          title="Quick log"
        >
          <Icon icon="ic:baseline-plus" class="text-xl" />
        </button>
      {/if}
      <button
        onclick={() => trainingState.navigate('settings')}
        class="p-2 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors"
        aria-label="Settings"
      >
        <Icon icon="ic:baseline-settings" class="text-lg" />
      </button>
    </div>
  </div>

  <!-- Each section in `trainingState.homeSections`' order, skipping hidden
       ones. The header above isn't part of this list - always shown, first. -->
  {#if updater.showBanner}<UpdateCard compact />{/if}
  <PainCheckInCard />

  {#each trainingState.homeSections as section (section.id)}
    {#if section.visible}
      <div data-tour="home-{section.id}" class="empty:hidden">
      {#if section.id === 'readiness'}<ReadinessCard {data} />
      {:else if section.id === 'alerts'}<AlertsCard {data} />
      {:else if section.id === 'progress'}<ProgressCard {data} />
      {:else if section.id === 'crags'}<CragsCard {data} />
      {:else if section.id === 'today'}<TodayCard {data} />
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
  <QuickLogSheet onClose={() => showQuickLog = false} />
{/if}
