<script lang="ts">
  /**
   * Insights: what the numbers say right now, in plain words, grouped under
   * the four questions Analytics is opened for. Each finding names the
   * numbers it rests on and opens the chart (or the ACWR breakdown) behind
   * it. Rules and thresholds live in `lib/analytics/insights.ts`.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { askAboutInsights } from '../../lib/ai/askAbout.svelte';
  import { buildInsights, INSIGHT_GROUPS, type Insight, type InsightLink, type InsightTone } from '../../lib/analytics/insights';

  let { onOpen }: { onOpen: (link: InsightLink) => void } = $props();

  const insights = $derived(buildInsights(trainingState.insightInputs()));
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
      <div class="px-1 pb-1 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-section uppercase text-content-muted">{group.label}</h3>
          <p class="text-caption text-content-subtle">{group.question}</p>
        </div>
        <button onclick={() => askAboutInsights(group.id)} class="shrink-0 p-1.5 -mr-1 rounded-control text-content-subtle hover:text-primary hover:bg-surface-elevated transition-colors" aria-label="Ask the AI about {group.label}" title="Ask the AI about this">
          <Icon icon="ic:baseline-auto-awesome" class="text-lg" />
        </button>
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
      <p class="text-caption text-content-subtle leading-relaxed">Log a few sessions, ratings and a test result, and findings about your load, progress and plan show up here.</p>
    </div>
  {/each}
  {#if groups.length > 0}
    <p class="text-caption text-content-subtle px-2 leading-relaxed">Each finding is a fixed rule over your own numbers; tap one to see the chart behind it. Thresholds are under Settings → Training model.</p>
  {/if}
</div>

{#snippet row(insight: Insight)}
  {#snippet body()}
    <span class="mt-[6.5px] w-2 h-2 rounded-full shrink-0 {TONE[insight.tone].dot}" role="img" aria-label={TONE[insight.tone].label}></span>
    <span class="min-w-0 flex-1 text-left">
      <span class="block text-body font-semibold text-content">{insight.title}</span>
      {#if insight.detail}<span class="block text-caption text-content-subtle leading-relaxed">{insight.detail}</span>{/if}
    </span>
  {/snippet}
  {#if insight.link}
    {@const link = insight.link}
    <button type="button" onclick={() => onOpen(link)} class="w-full flex items-start gap-3 py-3 text-left">
      {@render body()}
      <Icon icon="ic:baseline-chevron-right" class="text-xl text-content-subtle shrink-0 mt-[0.5px]" />
    </button>
  {:else}
    <div class="flex items-start gap-3 py-3">{@render body()}<span class="w-5 shrink-0" aria-hidden="true"></span></div>
  {/if}
{/snippet}
