<script lang="ts">
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
  import NextGoalCard from './home/NextGoalCard.svelte';
  import RecentActivityCard from './home/RecentActivityCard.svelte';
  import WeatherCard from './home/WeatherCard.svelte';
  import Icon from "@iconify/svelte";

  const data = new HomeData();

  // Weather is fetched once per mount, not on every `refresh()` (a network
  // call on every save would be excessive for conditions that change over
  // hours). No-ops per location if it isn't set.
  onMount(() => {
    trainingState.refreshWeather();
  });

  let showQuickLog = $state(false);
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in duration-200 pb-24">
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
          class="p-2 bg-primary/10 rounded-control border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
          aria-label="Quick log: pain, bodyweight, send or benchmark"
          title="Quick log"
        >
          <Icon icon="ic:baseline-plus" class="text-lg" />
        </button>
      {/if}
      <button
        onclick={() => trainingState.navigate('settings')}
        class="p-2 bg-surface-elevated/50 rounded-control border border-border-strong/50 text-content-subtle hover:text-content transition-colors"
        aria-label="Settings"
      >
        <Icon icon="ic:baseline-settings" class="text-lg" />
      </button>
    </div>
  </div>

  <!-- Each section in `trainingState.homeSections`' order, skipping hidden
       ones. The header above isn't part of this list - always shown, first. -->
  {#each trainingState.homeSections as section (section.id)}
    {#if section.visible}
      {#if section.id === 'readiness'}<ReadinessCard {data} />
      {:else if section.id === 'alerts'}<AlertsCard {data} />
      {:else if section.id === 'progress'}<ProgressCard {data} />
      {:else if section.id === 'crags'}<CragsCard {data} />
      {:else if section.id === 'today'}<TodayCard {data} />
      {:else if section.id === 'metrics'}<MetricsCard {data} />
      {:else if section.id === 'fatigue'}<FatigueCard {data} />
      {:else if section.id === 'thisWeek'}<ThisWeekCard {data} />
      {:else if section.id === 'trainingBlock'}<TrainingBlockCard {data} />
      {:else if section.id === 'competition'}<NextGoalCard {data} />
      {:else if section.id === 'recentActivity'}<RecentActivityCard />
      {:else if section.id === 'weather'}<WeatherCard />
      {/if}
    {/if}
  {/each}
</div>

{#if showQuickLog}
  <QuickLogSheet onClose={() => showQuickLog = false} />
{/if}
