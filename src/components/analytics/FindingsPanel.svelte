<script lang="ts">
  /**
   * Findings: what the numbers say, in plain words - one short list at the top of an Analytics tab, so a finding sits
   * right above the chart it points at. Each names the numbers it rests on and opens the chart (or the ACWR breakdown)
   * behind it. The rules and thresholds live in `lib/analytics/insights.ts`; this only shows a list it is given.
   */
  import Icon from '@iconify/svelte';
  import { askAboutInsights } from '../../lib/ai/askAbout.svelte';
  import type { Insight, InsightGroup, InsightLink, InsightTone } from '../../lib/analytics/insights';

  let {
    title,
    items,
    onOpen,
    askGroup,
    emptyText,
    footnote,
  }: {
    title: string;
    items: Insight[];
    onOpen: (link: InsightLink) => void;
    /** Shows an "ask the AI about this" button for this group of findings. */
    askGroup?: InsightGroup;
    /** Said when there are none; without it the card is left out. */
    emptyText?: string;
    /** A small line under the list. */
    footnote?: string;
  } = $props();

  // A shape as well as a colour, so a tone is not told by colour alone: warning, circled !, check, info.
  const TONE: Record<InsightTone, { icon: string; cls: string; label: string }> = {
    risk: { icon: 'ic:baseline-warning', cls: 'text-status-risk', label: 'Needs attention' },
    caution: { icon: 'ic:baseline-error-outline', cls: 'text-status-caution', label: 'Worth a look' },
    good: { icon: 'ic:baseline-check-circle', cls: 'text-status-good', label: 'Going well' },
    info: { icon: 'ic:baseline-info', cls: 'text-content-subtle', label: 'For information' },
  };

  /** Where a finding's chevron goes, in words: the card it opens, or what it opens. */
  const CARD: Record<string, string> = {
    'section-load': 'Rolling load',
    'section-mix': 'Training mix',
    'section-strain': 'Monotony & strain',
    'section-fingerLoad': 'Finger load',
    'section-recoveryTrend': 'Recovery trends',
    'section-fatigue': 'Fatigue',
    'section-pain': 'Pain',
    'section-outdoor': 'Outdoor ascents',
    'section-benchmarks': 'Test progress',
    'section-benchmarkOverview': 'All tests',
    'section-heatmap': 'Training days',
    'section-exercises': 'Exercises',
  };
  function target(link: InsightLink): string {
    if (link.kind === 'panel') return CARD[link.section] ?? 'the chart';
    if (link.kind === 'acwr') return 'What the ratio is made of';
    if (link.kind === 'plan') return 'The plan';
    if (link.kind === 'block') return 'The block review';
    if (link.kind === 'taper') return 'The taper plan';
    return 'The exercise';
  }
</script>

{#if items.length > 0 || emptyText}
  <div class="card space-y-1" data-tour="analytics-insights">
    <div class="px-1 pb-1 flex items-center justify-between gap-3">
      <h3 class="text-section uppercase text-content-muted">{title}</h3>
      {#if askGroup && items.length > 0}
        <button onclick={() => askAboutInsights(askGroup)} class="btn-quiet shrink-0 gap-1.5 px-3 -mr-1 text-label text-primary hover:bg-surface-elevated/60" aria-label="Ask the AI about {title}">
          <Icon icon="ic:baseline-auto-awesome" class="text-lg" />Ask AI
        </button>
      {/if}
    </div>
    {#if items.length === 0}
      <p class="px-1 pb-2 text-caption text-content-subtle leading-relaxed">{emptyText}</p>
    {:else}
      <div class="divide-y divide-border">
        {#each items as insight (insight.id)}
          {#snippet body()}
            <span class="mt-0.5 shrink-0 {TONE[insight.tone].cls}" role="img" aria-label={TONE[insight.tone].label}><Icon icon={TONE[insight.tone].icon} class="text-lg" /></span>
            <span class="min-w-0 flex-1 text-left">
              <span class="block text-body font-semibold text-content">{insight.title}</span>
              {#if insight.detail}<span class="block text-caption text-content-subtle leading-relaxed">{insight.detail}</span>{/if}
              {#if insight.link}<span class="block text-caption text-primary mt-0.5">{target(insight.link)}</span>{/if}
            </span>
          {/snippet}
          {#if insight.link}
            {@const link = insight.link}
            <button type="button" onclick={() => onOpen(link)} class="w-full flex items-start gap-3 py-3 min-h-11 text-left">
              {@render body()}
              <Icon icon="ic:baseline-chevron-right" class="text-xl text-content-subtle shrink-0 mt-[0.5px]" />
            </button>
          {:else}
            <div class="flex items-start gap-3 py-3">{@render body()}<span class="w-5 shrink-0" aria-hidden="true"></span></div>
          {/if}
        {/each}
      </div>
      {#if footnote}<p class="px-1 pt-2 text-caption text-content-subtle leading-relaxed">{footnote}</p>{/if}
    {/if}
  </div>
{/if}
