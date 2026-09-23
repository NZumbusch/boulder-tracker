<script lang="ts">
  /**
   * Planned-vs-actual adherence panel - the payoff for
   * the `prescribed`/`logged` split.
   */
  import type { WeeklyAdherence } from '../../lib/analytics/loadAnalytics';
  import Icon from "@iconify/svelte";

  let { results, weekLabels }: { results: WeeklyAdherence[]; weekLabels: Record<string, string> } = $props();
</script>

<div class="bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Plan Adherence</h3>
      <p class="text-caption text-content-subtle mt-0.5">Logged vs prescribed, per week</p>
    </div>
    <Icon icon="ic:baseline-fact-check" class="text-base text-content-subtle" />
  </div>

  <div class="space-y-1.5">
    {#each results as r}
      <div class="flex items-center gap-2.5 py-1">
        <span class="text-caption text-content-subtle/70 w-10 flex-shrink-0 tabular-nums">{weekLabels[r.weekId] ?? r.weekId}</span>
        <div class="flex-1 h-1 bg-surface-elevated rounded-full overflow-hidden">
          <div class="h-full bg-success rounded-full transition-[width] duration-500" style="width: {Math.round(r.completionRate * 100)}%"></div>
        </div>
        <span class="text-caption text-content w-9 text-right flex-shrink-0 tabular-nums">{Math.round(r.completionRate * 100)}%</span>
        <span class="text-caption w-16 text-right flex-shrink-0 tabular-nums {r.loadVariance < 0 ? 'text-danger' : 'text-content-subtle'}">{r.loadVariance >= 0 ? '+' : ''}{Math.round(r.loadVariance)}</span>
      </div>
    {:else}
      <p class="text-caption text-content-subtle italic text-center py-4">No completed sessions yet</p>
    {/each}
  </div>
</div>
