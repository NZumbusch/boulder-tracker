<script lang="ts">
  /** Findings dismissed with "Hide this finding", and the way to bring them back (one by one, or all). */
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { Insight, InsightTone } from '../../lib/analytics/insights';

  let { hidden, onClose }: { hidden: Insight[]; onClose: () => void } = $props();

  const TONE: Record<InsightTone, { icon: string; cls: string; label: string }> = {
    risk: { icon: 'ic:baseline-warning', cls: 'text-status-risk', label: 'Needs attention' },
    caution: { icon: 'ic:baseline-error-outline', cls: 'text-status-caution', label: 'Worth a look' },
    good: { icon: 'ic:baseline-check-circle', cls: 'text-status-good', label: 'Going well' },
    info: { icon: 'ic:baseline-info', cls: 'text-content-subtle', label: 'For information' },
  };
  /** Hidden ids whose rule is quiet today: they stay hidden if it fires again. */
  const dormant = $derived(Math.max(0, trainingState.hiddenFindings.length - hidden.length));
  function showAll() {
    trainingState.setFindingHidden(null, false);
    onClose();
  }
</script>

<Sheet title="Hidden findings" subtitle="Hidden from Analytics until you show them again" {onClose}>
  <div class="divide-y divide-border">
    {#each hidden as insight (insight.id)}
      <div class="flex items-start gap-3 py-2.5">
        <span class="mt-1 shrink-0 {TONE[insight.tone].cls}" role="img" aria-label={TONE[insight.tone].label}><Icon icon={TONE[insight.tone].icon} class="text-lg" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-body font-semibold text-content">{insight.title}</span>
          {#if insight.detail}<span class="block text-caption text-content-subtle leading-relaxed">{insight.detail}</span>{/if}
        </span>
        <button type="button" onclick={() => { trainingState.setFindingHidden(insight.id, false); if (hidden.length === 1) onClose(); }} class="btn btn-secondary shrink-0" aria-label="Show again: {insight.title}">Show</button>
      </div>
    {:else}
      <p class="py-3 text-caption text-content-subtle">None of the findings you hid is showing up right now.</p>
    {/each}
  </div>
  {#if dormant > 0}
    <p class="pt-2 text-caption text-content-subtle">{dormant === 1 ? '1 more hidden finding is quiet at the moment' : `${dormant} more hidden findings are quiet at the moment`} and stays hidden if it comes back.</p>
  {/if}
  {#snippet footer()}
    <button type="button" onclick={showAll} class="btn btn-primary flex-1">Show all again</button>
  {/snippet}
</Sheet>
