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

  const TONE: Record<InsightTone, { dot: string; label: string }> = {
    risk: { dot: 'bg-status-risk', label: 'Needs attention' },
    caution: { dot: 'bg-status-caution', label: 'Worth a look' },
    good: { dot: 'bg-status-good', label: 'Going well' },
    info: { dot: 'bg-content-subtle/50', label: 'For information' },
  };
</script>

{#if items.length > 0 || emptyText}
  <div class="card space-y-1" data-tour="analytics-insights">
    <div class="px-1 pb-1 flex items-center justify-between gap-3">
      <h3 class="text-section uppercase text-content-muted">{title}</h3>
      {#if askGroup && items.length > 0}
        <button onclick={() => askAboutInsights(askGroup)} class="shrink-0 p-1.5 -mr-1 rounded-control text-content-subtle hover:text-primary hover:bg-surface-elevated transition-colors" aria-label="Ask the AI about {title}" title="Ask the AI about this">
          <Icon icon="ic:baseline-auto-awesome" class="text-lg" />
        </button>
      {/if}
    </div>
    {#if items.length === 0}
      <p class="px-1 pb-2 text-caption text-content-subtle leading-relaxed">{emptyText}</p>
    {:else}
      <div class="divide-y divide-border">
        {#each items as insight (insight.id)}
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
        {/each}
      </div>
      {#if footnote}<p class="px-1 pt-2 text-caption text-content-subtle/80 leading-relaxed">{footnote}</p>{/if}
    {/if}
  </div>
{/if}
