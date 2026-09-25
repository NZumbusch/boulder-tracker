<script lang="ts">
  /**
   * Finger load: completed load from finger-intensive categories per
   * column, with its share of total load and a flag on sharp increases -
   * tendons and pulleys adapt more slowly than muscle, so this is the
   * ramp worth watching separately. Which categories count is the
   * athlete's call (guessed from category names until then).
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import { RAMP_RATE_SPIKE_THRESHOLD } from '../../lib/analytics/loadAnalytics';
  import { fingerCategoryIds } from '../../lib/analytics/proMetrics';
  import Icon from '@iconify/svelte';
  import ChartEmpty from './ChartEmpty.svelte';

  let { columns, axisStep }: {
    columns: { id: string; label: string; isCurrent: boolean; finger: number; total: number }[];
    axisStep: number;
    /** Accepted for a uniform panel API; this chart reads out through its column picker. */
    tips?: ChartTips;
  } = $props();

  const picker = new ColumnPicker(() => columns.length);
  $effect(() => picker.listen());

  let choosing = $state(false);
  const categories = $derived(trainingState.analyticsCategories.filter((c) => !c.archived));
  const chosen = $derived(fingerCategoryIds(trainingState.analyticsCategories, trainingState.fingerCategoryIds));
  function toggle(id: string) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    trainingState.setFingerCategoryIds([...next]);
  }

  const maxLoad = $derived(Math.max(1, ...columns.map((c) => c.finger)) * 1.15);
  const withRamp = $derived(columns.map((c, i) => {
    const prev = i > 0 ? columns[i - 1].finger : 0;
    const ramp = prev > 0 ? (c.finger - prev) / prev : 0;
    return { ...c, ramp, spike: ramp > RAMP_RATE_SPIKE_THRESHOLD, share: c.total > 0 ? c.finger / c.total : undefined };
  }));
  const windowShare = $derived.by(() => {
    const f = columns.reduce((a, c) => a + c.finger, 0);
    const t = columns.reduce((a, c) => a + c.total, 0);
    return t > 0 ? Math.round((f / t) * 100) : undefined;
  });
  const hasAny = $derived(columns.some((c) => c.finger > 0));
  const selected = $derived(picker.selected !== null ? withRamp[picker.selected] : null);
</script>

<div id="section-fingerLoad" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="text-section uppercase text-content-muted">Finger Load</h3>
      <p class="text-caption text-content-subtle mt-0.5">
        {windowShare !== undefined ? `${windowShare}% of this window's load` : 'Load from finger-intensive exercises'}
      </p>
    </div>
    <button
      onclick={() => (choosing = !choosing)}
      class="flex items-center gap-1 px-2 py-1 rounded-control border border-border text-caption text-content-subtle hover:text-content transition-colors shrink-0"
      aria-expanded={choosing}
    >
      <Icon icon="ic:baseline-tune" class="text-sm" /> Categories
    </button>
  </div>

  {#if choosing}
    <div class="p-3 rounded-control bg-surface-elevated/40 space-y-2">
      <p class="text-caption text-content-subtle">Which categories load your fingers?{trainingState.fingerCategoryIds === null ? ' (Guessed from the names so far.)' : ''}</p>
      <div class="flex flex-wrap gap-1.5">
        {#each categories as c (c.id)}
          <button
            onclick={() => toggle(c.id)}
            aria-pressed={chosen.has(c.id)}
            class="px-2 py-0.5 rounded-control border text-caption transition-colors {chosen.has(c.id) ? 'border-primary bg-primary/15 text-content' : 'border-border text-content-subtle'}"
          >
            {c.name}
          </button>
        {/each}
      </div>
      {#if trainingState.fingerCategoryIds !== null}
        <button onclick={() => trainingState.setFingerCategoryIds(null)} class="text-caption text-primary">Back to the automatic guess</button>
      {/if}
    </div>
  {/if}

    <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted">
      {#if selected}
        {selected.label}
        <span class="text-content-subtle"> · </span><span class="text-content">{Math.round(selected.finger)}</span> finger load
        {#if selected.share !== undefined}<span class="text-content-subtle"> · {Math.round(selected.share * 100)}% of total</span>{/if}
        {#if selected.ramp}<span class="{selected.spike ? 'text-status-risk' : 'text-content-subtle'}"> · {selected.ramp > 0 ? '+' : ''}{Math.round(selected.ramp * 100)}% vs before</span>{/if}
      {:else}
        <span class="text-content-subtle/70" class:invisible={!hasAny}>Tap a column for its values · ⚠ = more than {Math.round(RAMP_RATE_SPIKE_THRESHOLD * 100)}% up on the column before</span>
      {/if}
    </div>

    <div class="h-32 flex flex-col gap-2">
      <div
        bind:this={picker.el}
        class="flex-1 relative flex items-end gap-px cursor-crosshair select-none"
        role="presentation"
        onpointerdown={picker.down}
        onpointermove={picker.move}
        onpointerleave={picker.leave}
        onpointerup={picker.tap}
      >
        {#each withRamp as c, i (c.id)}
          <div class="flex-1 h-full flex justify-center items-end">
            <div
              class="w-[62%] max-w-[16px] rounded-[2px] relative transition-opacity {c.isCurrent ? 'bg-warning' : 'bg-warning/45'} {picker.selected !== null && picker.selected !== i ? 'opacity-40' : ''}"
              style="height: {(c.finger / maxLoad) * 100}%"
            >
              {#if c.spike}
                <Icon icon="ic:baseline-warning" class="absolute -top-4 left-1/2 -translate-x-1/2 text-status-risk text-xs" />
              {/if}
            </div>
          </div>
        {/each}
        {#if !hasAny}<ChartEmpty>No finger-category exercises logged in this window</ChartEmpty>{/if}
      </div>
      <div class="border-t border-border-strong/60"></div>
      <div class="flex gap-px">
        {#each columns as c, i (c.id)}
          <div class="flex-1 flex justify-center">
            {#if showsLabel(i, columns.length, axisStep)}
              <span class="text-caption leading-tight tabular-nums {c.isCurrent ? 'text-primary' : 'text-content-subtle/70'}">{c.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
</div>
