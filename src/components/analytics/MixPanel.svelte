<script lang="ts">
  /** Training Mix: each week's minutes per analytics category, stacked, with display options. */
  import { trainingState } from '../../lib/state.svelte';
  import { ChartTips, isTapPointer, isKeyboardActivation } from '../../lib/analytics/chartTips.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import type { ChartData } from './chartTypes';
  import Icon from "@iconify/svelte";

  let { chartData, axisStep, tips }: { chartData: ChartData; axisStep: number; tips: ChartTips } = $props();

  const categories = $derived(trainingState.analyticsCategories);
  let showRelative = $state(true);
  let showSettings = $state(false);
  let includePlanned = $state(true);
  let hiddenCategoryIds = $state<Set<string>>(new Set());
  const visibleCategories = $derived(categories.filter(c => !hiddenCategoryIds.has(c.id)));
  const maxVisibleDuration = $derived(Math.max(...chartData.weeks.map(w => visibleCategories.reduce((acc, cat) => acc + ((includePlanned ? w.categories[cat.name] : w.completedCategories[cat.name]) || 0), 0)), 1));
</script>

<div id="section-mix" class="scroll-mt-4 bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card relative z-30">
  <!-- No z-index here. The card is `relative z-30`, which makes it a
       stacking context, so everything inside it is ranked against
       everything else inside it - and a z-50 on this row put the title
       and the Options button *above* the chart's tooltips, which is
       what made them look transparent. The Options dropdown does not
       need it: its own wrapper below is `relative z-50` and lifts the
       panel on its own. -->
  <div class="flex items-start justify-between gap-3 relative">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted">Training Mix</h3>
      <p class="text-caption text-content-subtle mt-0.5">Breakdown by category</p>
    </div>

    <div class="shrink-0">
      <div class="relative z-50">
        <button
          onclick={() => showSettings = !showSettings}
          class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated border border-border-strong/50 rounded-control transition-colors text-caption text-content-muted hover:text-content"
          aria-label="Graph settings"
        >
          <Icon icon="ic:baseline-tune" class="text-sm" />
          Options
        </button>

        {#if showSettings}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => showSettings = false}></div>
          <!-- Anchored right: the trigger now sits at the card's right
               edge, so a left-anchored panel would hang off-screen. -->
          <div class="absolute top-full right-0 mt-2 w-56 bg-surface border border-border-strong rounded-card shadow-card z-50 p-3 space-y-4 animate-in fade-in zoom-in-95 origin-top-right">

            <div class="space-y-2">
              <h4 class="text-section uppercase text-content-subtle mb-2 px-1">Display Mode</h4>
              <label class="flex items-center justify-between cursor-pointer group px-1">
                <span class="text-label text-content-muted">Relative (%)</span>
                <div class="relative inline-flex items-center">
                  <input type="checkbox" bind:checked={showRelative} class="sr-only peer" />
                  <div class="w-8 h-4 bg-surface-elevated-hover rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary-hover"></div>
                </div>
              </label>
              <label class="flex items-center justify-between cursor-pointer group px-1">
                <span class="text-label text-content-muted">Include Planned</span>
                <div class="relative inline-flex items-center">
                  <input type="checkbox" bind:checked={includePlanned} class="sr-only peer" />
                  <div class="w-8 h-4 bg-surface-elevated-hover rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-success-hover"></div>
                </div>
              </label>
            </div>

            <div class="border-t border-border pt-3">
              <h4 class="text-section uppercase text-content-subtle mb-2 px-1">Visible Categories</h4>
              <div class="space-y-1">
                {#each categories as cat}
                  <label class="flex items-center gap-3 p-1.5 hover:bg-surface-elevated rounded-control cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={!hiddenCategoryIds.has(cat.id)}
                      onchange={(e) => {
                        if (e.currentTarget.checked) {
                          hiddenCategoryIds.delete(cat.id);
                        } else {
                          hiddenCategoryIds.add(cat.id);
                        }
                        hiddenCategoryIds = new Set(hiddenCategoryIds);
                      }}
                      class="w-3.5 h-3.5 bg-surface-elevated border-border-strong rounded text-primary focus:ring-primary/50 focus:ring-offset-surface"
                    />
                    <div class="w-2.5 h-2.5 rounded-full {cat.color}"></div>
                    <span class="text-label text-content">{cat.name}</span>
                  </label>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="space-y-2">
    <div class="h-40 flex items-end justify-between gap-px relative">
      {#each chartData.weeks as week, wi}
        {@const visibleTotalDuration = visibleCategories.reduce((acc, cat) => acc + ((includePlanned ? week.categories[cat.name] : week.completedCategories[cat.name]) || 0), 0)}
        {@const weekHeightPercent = showRelative ? (visibleTotalDuration > 0 ? 100 : 0) : (visibleTotalDuration / maxVisibleDuration) * 100}
        {@const activeCat = visibleCategories.find((c) => tips.isOpen(`mix-${wi}-${c.id}`))}
        <div class="flex-1 flex flex-col items-center group relative h-full justify-end">
          <!-- Segments carry the category colours, so the bar itself
               stays flat: no shadow, no per-segment borders, hairline
               1px separators only. -->
          <div class="w-[62%] max-w-[16px] flex flex-col-reverse rounded-[2px] overflow-hidden justify-end transition-[height] duration-500"
               style="height: {weekHeightPercent}%">
            {#each visibleCategories as cat}
              {@const catDuration = (includePlanned ? week.categories[cat.name] : week.completedCategories[cat.name]) || 0}
              {#if catDuration > 0 && visibleTotalDuration > 0}
                <button
                  type="button"
                  data-tip-trigger
                  onpointerup={(e) => { if (isTapPointer(e)) tips.toggle(`mix-${wi}-${cat.id}`); }}
                  onclick={(e) => { if (isKeyboardActivation(e)) tips.toggle(`mix-${wi}-${cat.id}`); }}
                  onpointerenter={(e) => { if (!isTapPointer(e)) tips.open(`mix-${wi}-${cat.id}`); }}
                  onpointerleave={(e) => { if (!isTapPointer(e)) tips.closeIf(`mix-${wi}-${cat.id}`); }}
                  aria-label="{cat.name}, {Math.round(catDuration)} minutes in {week.label}"
                  class="{cat.color} w-full relative block"
                  style="height: {(catDuration / visibleTotalDuration) * 100}%"
                ></button>
              {/if}
            {/each}
          </div>

          <!-- The tooltip lives out here, not inside the segment that
               triggers it: the bar clips its children (`overflow-hidden`,
               which is what rounds the stack's corners), so a tooltip
               rendered inside a segment was cut off the moment it grew
               past it - which is always. Sitting in the week column
               instead, it is anchored just above the bar's top and is
               clipped by nothing. Hover therefore has to be driven in
               JS too, since `:hover` on the segment can no longer reach
               it. Edge columns anchor to their side so a wide label
               doesn't run off the chart. -->
          {#if activeCat}
            {@const activeDuration = (includePlanned ? week.categories[activeCat.name] : week.completedCategories[activeCat.name]) || 0}
            <div
              class="absolute px-2 py-1 bg-surface-elevated text-caption text-content rounded-control pointer-events-none z-40 whitespace-nowrap shadow-card border border-border
                {wi <= 1 ? 'left-0' : wi >= chartData.weeks.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'}"
              style="bottom: calc({weekHeightPercent}% + 0.5rem);"
            >
              {activeCat.name}: {Math.round(activeDuration)} min
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="border-t border-border-strong/60"></div>
    <div class="flex justify-between gap-px">
      {#each chartData.weeks as week, i}
        <div class="flex-1 flex justify-center">
          {#if showsLabel(i, chartData.weeks.length, axisStep)}
            <span class="text-caption leading-tight tabular-nums {week.isCurrent ? 'text-primary' : 'text-content-subtle/70'}">{week.label}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex flex-wrap gap-x-3 gap-y-1.5 pt-1 relative z-10">
    {#each visibleCategories as cat}
      <div class="flex items-center gap-1.5">
        <div class="w-2 h-2 rounded-[2px] {cat.color}"></div>
        <span class="text-caption text-content-subtle">{cat.name}</span>
      </div>
    {/each}
  </div>
</div>
