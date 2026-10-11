<script lang="ts">
  /**
   * Insights: what the numbers say right now, in plain words, grouped under
   * the four questions Analytics is opened for. Each finding names the
   * numbers it rests on and opens the chart (or the ACWR breakdown) behind
   * it. Rules and thresholds live in `lib/analytics/insights.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { buildInsights, INSIGHT_GROUPS, type Insight, type InsightLink, type InsightTone } from '../../lib/analytics/insights';
  import { DEFAULT_FATIGUE_MODEL } from '../../lib/analytics/readiness';

  let { onOpen }: { onOpen: (link: InsightLink) => void } = $props();

  const insights = $derived(buildInsights({
    asOf: trainingState.today,
    workouts: trainingState.workouts,
    workoutsForWeek: (weekId) => trainingState.getWorkoutsForWeek(weekId),
    exerciseTypes: trainingState.exerciseTypes,
    analyticsCategories: trainingState.analyticsCategories,
    benchmarks: trainingState.benchmarks,
    benchmarkTypes: trainingState.benchmarkTypes,
    valueDefs: trainingState.valueDefs,
    weightUnit: trainingState.units.weight,
    dailyMetrics: trainingState.dailyMetrics,
    ascents: trainingState.outdoorAscents,
    config: {
      acwrZones: trainingState.acwrZones,
      fatigueModel: trainingState.fatigueModel ?? DEFAULT_FATIGUE_MODEL,
      staleDays: trainingState.tunable('insights.staleDays'),
      adherenceLow: trainingState.tunable('insights.adherenceLow'),
      hrvDip: trainingState.tunable('readiness.hrvDip'),
      sleepLow: trainingState.tunable('readiness.sleepLow'),
    },
  }));
  const groups = $derived(INSIGHT_GROUPS.map((g) => ({ ...g, items: insights.filter((i) => i.group === g.id) })).filter((g) => g.items.length > 0));

  const TONE: Record<InsightTone, { dot: string; label: string }> = {
    risk: { dot: 'bg-status-risk', label: 'Needs attention' },
    caution: { dot: 'bg-status-caution', label: 'Worth a look' },
    good: { dot: 'bg-status-good', label: 'Going well' },
    info: { dot: 'bg-content-subtle/50', label: 'For information' },
  };
</script>

<div class="space-y-4" data-tour="analytics-insights">
  {#each groups as group (group.id)}
    <div class="card space-y-1">
      <div class="px-1 pb-1">
        <h3 class="text-section uppercase text-content-muted">{group.label}</h3>
        <p class="text-caption text-content-subtle">{group.question}</p>
      </div>
      <div class="divide-y divide-border">
        {#each group.items as insight (insight.id)}
          {@render row(insight)}
        {/each}
      </div>
    </div>
  {:else}
    <div class="card text-center py-8 px-6 space-y-1">
      <p class="text-body text-content">Nothing to report yet</p>
      <p class="text-caption text-content-subtle leading-relaxed">Log a few sessions, ratings and a benchmark, and findings about your load, progress and plan show up here.</p>
    </div>
  {/each}
  {#if groups.length > 0}
    <p class="text-caption text-content-subtle px-2 leading-relaxed">Each finding is a fixed rule over your own numbers; tap one to see the chart behind it. Thresholds are under Settings → Training model.</p>
  {/if}
</div>

{#snippet row(insight: Insight)}
  {#snippet body()}
    <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 {TONE[insight.tone].dot}" role="img" aria-label={TONE[insight.tone].label}></span>
    <span class="min-w-0 flex-1 text-left">
      <span class="block text-body font-semibold text-content">{insight.title}</span>
      {#if insight.detail}<span class="block text-caption text-content-subtle leading-relaxed">{insight.detail}</span>{/if}
    </span>
  {/snippet}
  {#if insight.link}
    {@const link = insight.link}
    <button type="button" onclick={() => onOpen(link)} class="w-full flex items-start gap-3 py-3 text-left">
      {@render body()}
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle shrink-0 mt-0.5" />
    </button>
  {:else}
    <div class="flex items-start gap-3 py-3">{@render body()}</div>
  {/if}
{/snippet}
