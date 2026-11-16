<script lang="ts">
  /**
   * Done vs Missed: what became of the planned sessions in the window. Per column a bar of done / skipped / missed
   * sessions (upcoming ones left out), and below it - in a pane of its own, not on a second axis - how much of the
   * planned work was done ("% of the plan", the same measure Rolling Load and Home use). Then the window's totals and
   * where the misses fall: by weekday and by session. The counting rules are in `lib/analytics/adherence.ts`.
   */
  import type { ChartData } from './chartTypes';
  import type { AdherenceRow, OutcomeCounts } from '../../lib/analytics/adherence';
  import { doneShare } from '../../lib/analytics/adherence';
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import ChartEmpty from './ChartEmpty.svelte';
  import ChartTable from './ChartTable.svelte';

  let {
    chartData,
    axisStep,
    counts,
    totals,
    byWeekday,
    byKind,
  }: {
    chartData: ChartData;
    axisStep: number;
    /** Per column of `chartData.weeks`, in the same order. */
    counts: OutcomeCounts[];
    totals: OutcomeCounts;
    byWeekday: AdherenceRow[];
    byKind: AdherenceRow[];
  } = $props();

  const due = (c: OutcomeCounts) => c.done + c.skipped + c.missed;
  const maxDue = $derived(Math.max(1, ...counts.map(due)));
  const share = $derived(doneShare(totals));
  const anyDue = $derived(due(totals) > 0);
  const pct = (v: number | undefined) => (v === undefined ? '–' : `${Math.round(v * 100)}%`);
  /** The plan line: % of the plan per column, capped at 100% for drawing (more than planned still reads as full). */
  const planPoints = $derived(
    chartData.weeks
      .map((w, i) => (w.planProgress === undefined || counts[i] === undefined || due(counts[i]) === 0 ? null : { i, v: Math.min(1, w.planProgress) }))
      .filter((p): p is { i: number; v: number } => p !== null),
  );
  const n = $derived(chartData.weeks.length);
  const xOf = (i: number) => ((i + 0.5) / n) * 100;

  const picker = new ColumnPicker(() => chartData.weeks.length);
  $effect(() => picker.listen());
  const selected = $derived(picker.selected !== null ? { week: chartData.weeks[picker.selected], c: counts[picker.selected] } : null);
  const maxDayMissed = $derived(Math.max(1, ...byWeekday.map((d) => d.done + d.missed)));
</script>

<div id="section-adherence" class="scroll-mt-4 card space-y-3">
  <div class="min-w-0">
    <h3 class="text-section uppercase text-content-muted">Done vs Missed</h3>
    <p class="text-caption text-content-subtle mt-0.5">
      {#if anyDue}<span class="text-content tabular-nums">{pct(share)}</span> of planned sessions done · {totals.done} done, {totals.missed} missed, {totals.skipped} skipped{:else}Planned sessions: done, skipped or missed{/if}
    </p>
  </div>

  <div class="flex flex-wrap gap-3 text-caption text-content-muted">
    <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-status-good"></span>Done</span>
    <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-status-neutral"></span>Skipped</span>
    <span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-status-risk"></span>Missed</span>
  </div>

  <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted" aria-live="polite">
    {#if selected && selected.c}
      <span>{selected.week.label}</span>
      {#if due(selected.c) === 0}
        <span class="text-content-subtle"> · nothing planned that was due</span>
      {:else}
        <span class="text-content-subtle"> · {selected.c.done} done, {selected.c.missed} missed, {selected.c.skipped} skipped · {pct(selected.week.planProgress)} of the plan</span>
      {/if}
    {:else}
      <span class="text-content-subtle" class:invisible={!anyDue}>Tap a column for its numbers</span>
    {/if}
  </div>

  <div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={picker.el}
      class="h-28 relative flex items-end gap-px cursor-crosshair select-none"
      role="application"
      tabindex="0"
      aria-label="Sessions done, skipped and missed by column. Left and right arrow keys move between columns; a table of the numbers follows."
      onkeydown={picker.key}
      onpointerdown={picker.down}
      onpointermove={picker.move}
      onpointerleave={picker.leave}
      onpointerup={picker.tap}
    >
      {#each counts as c, i (chartData.weeks[i]?.id ?? i)}
        {@const total = due(c)}
        {@const dim = picker.selected !== null && picker.selected !== i}
        <div class="flex-1 h-full flex justify-center items-end">
          <div class="w-[62%] max-w-[16px] flex flex-col-reverse gap-[1.5px] transition-[height,opacity] duration-300 {dim ? 'opacity-40' : ''}" style="height: {(total / maxDue) * 100}%">
            {#if c.done}<div class="bg-status-good w-full rounded-[2px] min-h-[2px]" style="height: {(c.done / total) * 100}%"></div>{/if}
            {#if c.skipped}<div class="bg-status-neutral w-full rounded-[2px] min-h-[2px]" style="height: {(c.skipped / total) * 100}%"></div>{/if}
            {#if c.missed}<div class="bg-status-risk w-full rounded-[2px] min-h-[2px]" style="height: {(c.missed / total) * 100}%"></div>{/if}
          </div>
        </div>
      {/each}
      {#if !anyDue}<ChartEmpty>No planned sessions were due in this window</ChartEmpty>{/if}
    </div>
    <div class="border-t border-border-strong/60 mt-1"></div>

    <!-- % of the plan, a pane of its own (0-100%), so no second axis shares the bars. -->
    <div class="mt-2">
      <p class="text-caption text-content-subtle">% of the planned work done</p>
      <div class="relative h-12 mt-1">
        <div class="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden="true"></div>
        <span class="absolute right-0 -top-0.5 -translate-y-full text-caption text-content-subtle tabular-nums" aria-hidden="true">100%</span>
        <svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {#if planPoints.length > 1}
            <polyline
              points={planPoints.map((p) => `${xOf(p.i)},${100 - p.v * 100}`).join(' ')}
              fill="none"
              stroke="var(--color-primary)"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
              stroke-linejoin="round"
            />
          {/if}
        </svg>
        {#each planPoints as p (p.i)}
          <span class="absolute w-1.5 h-1.5 rounded-full bg-primary -translate-x-1/2 translate-y-1/2" style="left: {xOf(p.i)}%; bottom: {p.v * 100}%"></span>
        {/each}
      </div>
    </div>

    <div class="flex gap-px mt-1">
      {#each chartData.weeks as week, i (week.id)}
        <div class="flex-1 flex justify-center">
          {#if showsLabel(i, chartData.weeks.length, axisStep)}
            <span class="text-caption leading-tight tabular-nums {week.isCurrent ? 'text-primary' : 'text-content-subtle'}">{week.label}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if anyDue}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
      <div>
        <p class="text-label text-content mb-1.5">By weekday</p>
        <ul class="space-y-1">
          {#each byWeekday as d (d.key)}
            {@const total = d.done + d.missed}
            <li class="flex items-center gap-2 text-caption">
              <span class="w-8 shrink-0 text-content-muted">{d.label}</span>
              <span class="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden flex" aria-hidden="true">
                <span class="bg-status-good h-full" style="width: {(d.done / maxDayMissed) * 100}%"></span>
                <span class="bg-status-risk h-full" style="width: {(d.missed / maxDayMissed) * 100}%"></span>
              </span>
              <span class="w-20 shrink-0 text-right tabular-nums text-content-subtle">{total ? `${d.missed} missed` : '–'}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div>
        <p class="text-label text-content mb-1.5">Missed most</p>
        {#if byKind.length === 0}
          <p class="text-caption text-content-subtle">Nothing missed in this window.</p>
        {:else}
          <ul class="space-y-1">
            {#each byKind as k (k.key)}
              <li class="flex items-center justify-between gap-2 text-caption">
                <span class="min-w-0 truncate text-content-muted">{k.label}</span>
                <span class="shrink-0 tabular-nums text-content-subtle">missed {k.missed} of {k.done + k.missed}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
    <p class="text-caption text-content-subtle">Skipped sessions (every exercise marked skipped) don't count against you. Sessions still ahead are left out.</p>
  {/if}

  <ChartTable
    caption="Planned sessions done, skipped and missed per column"
    columns={['Column', 'Done', 'Skipped', 'Missed', '% done', '% of the plan']}
    rows={counts.map((c, i) => [chartData.weeks[i]?.label ?? '', c.done, c.skipped, c.missed, pct(doneShare(c)), pct(chartData.weeks[i]?.planProgress)])}
  />
</div>
