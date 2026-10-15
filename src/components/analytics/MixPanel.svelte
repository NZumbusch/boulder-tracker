<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Training Mix: minutes per analytics category - the whole window as one
   * share bar on top (where the time actually went), then each column
   * stacked below it.
   *
   * Display options sit inline rather than in a dropdown: share vs minutes,
   * and done-only vs including what is still planned. The legend is the
   * category filter. Tap or hover a column for its breakdown.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import type { ChartData } from './chartTypes';
  import ChartEmpty from './ChartEmpty.svelte';
  import ChartTable from './ChartTable.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { formatMinutes } from '../../lib/session/formatSession';

  // `tips` is accepted for a uniform panel API; this chart reads out through its column picker instead.
  let { chartData, axisStep }: { chartData: ChartData; axisStep: number; tips?: ChartTips } = $props();

  const categories = $derived(trainingState.analyticsCategories.filter((c) => !c.archived));
  let showRelative = $state(true);
  let includePlanned = $state(false);
  let hiddenCategoryIds = $state<Set<string>>(new Set());
  const visibleCategories = $derived(categories.filter((c) => !hiddenCategoryIds.has(c.id)));

  function toggleCategory(id: string) {
    const next = new Set(hiddenCategoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    hiddenCategoryIds = next;
  }

  const minutesOf = (week: ChartData['weeks'][number], name: string) =>
    (includePlanned ? week.categories[name] : week.completedCategories[name]) || 0;

  /** Per column: each visible category's minutes, and their total. */
  const columns = $derived(chartData.weeks.map((week) => {
    const parts = visibleCategories.map((c) => ({ cat: c, minutes: minutesOf(week, c.name) })).filter((p) => p.minutes > 0);
    return { week, parts, total: parts.reduce((a, p) => a + p.minutes, 0) };
  }));
  const maxTotal = $derived(Math.max(1, ...columns.map((c) => c.total)));

  /** The whole window, per category (all categories, so hidden ones keep their chip and share). */
  const windowShares = $derived.by(() => {
    const totals = categories.map((c) => ({ cat: c, minutes: chartData.weeks.reduce((a, w) => a + minutesOf(w, c.name), 0) }));
    const visibleTotal = totals.filter((t) => !hiddenCategoryIds.has(t.cat.id)).reduce((a, t) => a + t.minutes, 0);
    return totals.map((t) => ({ ...t, share: visibleTotal > 0 && !hiddenCategoryIds.has(t.cat.id) ? t.minutes / visibleTotal : 0 }));
  });
  const windowTotal = $derived(windowShares.reduce((a, t) => a + (hiddenCategoryIds.has(t.cat.id) ? 0 : t.minutes), 0));

  const picker = new ColumnPicker(() => chartData.weeks.length);
  $effect(() => picker.listen());
  const selected = $derived(picker.selected !== null ? columns[picker.selected] : null);

  const hours = formatMinutes;
</script>

<div id="section-mix" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Training Mix <InfoButton term="mix" /></h3>
      <p class="text-caption text-content-subtle mt-0.5">{windowTotal > 0 ? `${hours(windowTotal)} in this window` : 'Time by category'}</p>
    </div>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Segmented label="Show shares or minutes" options={[{ value: 'share', label: 'Share' }, { value: 'minutes', label: 'Minutes' }]} value={showRelative ? 'share' : 'minutes'} onChange={(v) => (showRelative = v === 'share')} />
    <Segmented label="Which sessions" options={[{ value: 'done', label: 'Done' }, { value: 'planned', label: '+ Planned' }]} value={includePlanned ? 'planned' : 'done'} onChange={(v) => (includePlanned = v === 'planned')} />
  </div>
  <p class="text-caption text-content-subtle -mt-1">{showRelative ? 'Each column is 100%, split by category' : 'Column height is the time spent'} · {includePlanned ? 'sessions done and still planned' : 'sessions done only'}</p>

  <!-- The window at a glance: one bar, where the time went (an empty
       track in an empty window, so nothing below it moves). -->
  <div class="flex h-2.5 rounded-full overflow-hidden gap-[2px] bg-surface-elevated/60" aria-hidden="true">
      {#each windowShares as t (t.cat.id)}
        {#if t.share > 0}
          <div class="{t.cat.color} h-full" style="width: {t.share * 100}%"></div>
        {/if}
      {/each}
  </div>

  <!-- Legend is the filter; share of the window beside each. Categories
       with no time in the window are left out - unless that's all of
       them, when every chip shows, so an empty window keeps the legend's
       height and the page doesn't jump while paging. -->
  <div class="flex flex-wrap gap-1.5">
    {#each windowShares as t (t.cat.id)}
      {#if t.minutes > 0 || windowTotal === 0}
        <button
          onclick={() => toggleCategory(t.cat.id)}
          aria-pressed={!hiddenCategoryIds.has(t.cat.id)}
          class="chip transition-opacity {hiddenCategoryIds.has(t.cat.id) || windowTotal === 0 ? 'opacity-40 line-through' : ''}"
        >
          <span class="w-2 h-2 rounded-full {t.cat.color}"></span>
          <span class="text-content-muted">{t.cat.name}</span>
          {#if t.share > 0}<span class="text-content tabular-nums">{Math.round(t.share * 100)}%</span>{/if}
        </button>
      {/if}
    {/each}
  </div>

  <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted" aria-live="polite">
    {#if selected}
      <span>{selected.week.label}</span>
      {#if selected.total === 0}
        <span class="text-content-subtle"> · nothing logged</span>
      {:else}
        <span class="text-content-subtle"> · {hours(selected.total)}</span>
        {#each [...selected.parts].sort((a, b) => b.minutes - a.minutes).slice(0, 3) as p (p.cat.id)}
          <span class="ml-2 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full {p.cat.color}"></span>{p.cat.name} {Math.round((p.minutes / selected.total) * 100)}%</span>
        {/each}
      {/if}
    {:else}
      <span class="text-content-subtle" class:invisible={windowTotal === 0}>Tap a column for its breakdown</span>
    {/if}
  </div>

  <div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={picker.el}
      class="h-36 relative flex items-end gap-px cursor-crosshair select-none"
      role="application"
      tabindex="0"
      aria-label="Training mix by column. Left and right arrow keys move between columns; a table of the numbers follows."
      onkeydown={picker.key}
      onpointerdown={picker.down}
      onpointermove={picker.move}
      onpointerleave={picker.leave}
      onpointerup={picker.tap}
    >
      {#each columns as col, i (col.week.id)}
        {@const height = showRelative ? (col.total > 0 ? 100 : 0) : (col.total / maxTotal) * 100}
        {@const dim = picker.selected !== null && picker.selected !== i}
        <div class="flex-1 h-full flex justify-center items-end">
          <div
            class="w-[62%] max-w-[16px] flex flex-col-reverse gap-[1.5px] transition-[height,opacity] duration-300 {dim ? 'opacity-40' : ''}"
            style="height: {height}%"
          >
            {#each col.parts as p (p.cat.id)}
              <div class="{p.cat.color} w-full rounded-[2px] min-h-[2px]" style="height: {(p.minutes / col.total) * 100}%"></div>
            {/each}
          </div>
        </div>
      {/each}
      {#if windowTotal === 0}<ChartEmpty>{includePlanned ? 'Nothing done or planned in this window' : 'Nothing done in this window'}</ChartEmpty>{/if}
    </div>
    <div class="border-t border-border-strong/60 mt-1"></div>
    <div class="flex gap-px">
      {#each chartData.weeks as week, i (week.id)}
        <div class="flex-1 flex justify-center">
          {#if showsLabel(i, chartData.weeks.length, axisStep)}
            <span class="text-caption leading-tight tabular-nums {week.isCurrent ? 'text-primary' : 'text-content-subtle'}">{week.label}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <ChartTable
    caption="Training mix, minutes per category"
    columns={['Column', ...visibleCategories.map((c) => c.name)]}
    rows={columns.map((col) => [col.week.label, ...visibleCategories.map((c) => formatMinutes(minutesOf(col.week, c.name)))])}
  />
</div>
