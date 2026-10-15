<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Monotony & strain (Foster): strain as bars, monotony as a line with
   * Foster's warning level. High load is fine; high load with no easy days
   * (monotony above ~2) is the combination linked to illness and
   * overreaching. Maths in `lib/analytics/proMetrics.ts`.
   */
  import type { ChartTips } from '../../lib/analytics/chartTips.svelte';
  import { ColumnPicker } from '../../lib/analytics/columnPicker.svelte';
  import { showsLabel } from '../../lib/analytics/chartWindow';
  import { MONOTONY_WARNING, type WeekStrain } from '../../lib/analytics/proMetrics';
  import ChartEmpty from './ChartEmpty.svelte';
  import ChartTable from './ChartTable.svelte';
  import Icon from '@iconify/svelte';

  let { columns, axisStep, monthly }: {
    columns: (WeekStrain & { id: string; label: string; isCurrent: boolean })[];
    axisStep: number;
    /** Accepted for a uniform panel API; this chart reads out through its column picker. */
    tips?: ChartTips;
    /** Month columns show the mean week of the month. */
    monthly: boolean;
  } = $props();

  const maxStrain = $derived(Math.max(1, ...columns.map((c) => c.strain ?? 0)) * 1.1);
  const maxMonotony = $derived(Math.max(MONOTONY_WARNING * 1.5, ...columns.map((c) => c.monotony ?? 0)) * 1.1);
  const monoY = (m: number) => 100 - (m / maxMonotony) * 100;
  const line = $derived.by(() => {
    const runs: string[] = [];
    let run: string[] = [];
    columns.forEach((c, i) => {
      if (c.monotony === undefined) {
        if (run.length > 1) runs.push(`M ${run.join(' L ')}`);
        run = [];
        return;
      }
      run.push(`${((i + 0.5) / columns.length) * 100},${monoY(c.monotony)}`);
    });
    if (run.length > 1) runs.push(`M ${run.join(' L ')}`);
    return runs.join(' ');
  });
  // A week between two gaps has no neighbour to draw a line to - it gets a
  // dot, or it would vanish (after a break, often the newest week).
  const lonePoints = $derived(
    columns
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c.monotony !== undefined && columns[i - 1]?.monotony === undefined && columns[i + 1]?.monotony === undefined)
      .map(({ c, i }) => `M ${((i + 0.5) / columns.length) * 100},${monoY(c.monotony!)} h 0`)
      .join(' '),
  );
  const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(v)));
  const latest = $derived([...columns].reverse().find((c) => c.monotony !== undefined));

  // Tap (or hover) a column: its values print in the readout line, which
  // never gets clipped at the screen edge the way a floating tooltip did.
  const picker = new ColumnPicker(() => columns.length);
  $effect(() => picker.listen());
  const selected = $derived(picker.selected !== null ? columns[picker.selected] : null);
</script>

<div id="section-strain" class="scroll-mt-4 card space-y-3">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h3 class="text-section uppercase text-content-muted flex items-center gap-1.5">Monotony & Strain <InfoButton term="monotony" /></h3>
      <p class="text-caption text-content-subtle mt-0.5">Monotony is how alike your days are; strain is a week's load times it. Monotony above {MONOTONY_WARNING} means too few easy days{monthly ? ' · mean week per month' : ''}.</p>
    </div>
    <div class="text-right shrink-0">
      <p class="text-body font-semibold tabular-nums {(latest?.monotony ?? 0) >= MONOTONY_WARNING ? 'text-status-caution' : latest ? 'text-content' : 'text-content-subtle'}">{latest?.monotony?.toFixed(1) ?? '–'}</p>
      <p class="text-caption text-content-subtle">latest monotony</p>
    </div>
  </div>

  <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted" aria-live="polite">
    {#if selected}
      {selected.label}
      <span class="text-content-subtle"> · strain</span> <span class="text-content">{Math.round(selected.strain ?? 0)}</span>
      <span class="text-content-subtle"> · monotony</span> <span class="text-content">{selected.monotony?.toFixed(2) ?? '–'}</span>
      <span class="text-content-subtle"> · load</span> <span class="text-content">{Math.round(selected.load)}</span>
    {:else}
      <span class="text-content-subtle" class:invisible={!columns.some((c) => c.load > 0)}>Tap a column for its values</span>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={picker.el}
    class="relative pr-9 cursor-crosshair select-none"
    role="application"
    tabindex="0"
    aria-label="Strain and monotony by column. Left and right arrow keys move between columns; a table of the numbers follows."
    onkeydown={picker.key}
    onpointerdown={picker.down}
    onpointermove={picker.move}
    onpointerleave={picker.leave}
    onpointerup={picker.tap}
  >
    <p class="text-caption text-content-subtle pb-1">Strain</p>
    <div class="h-20 relative flex items-end gap-px">
      <span class="absolute right-0 top-0 translate-x-full pl-1 text-caption leading-none text-content-subtle tabular-nums pointer-events-none">{compact(maxStrain / 1.1)}</span>
      {#each columns as c, i (c.id)}
        <div class="flex-1 h-full flex justify-center items-end">
          <div
            class="w-[62%] max-w-[16px] rounded-[2px] relative transition-opacity {c.isCurrent ? 'bg-series-2' : 'bg-series-2/55'} {picker.selected !== null && picker.selected !== i ? 'opacity-40' : ''}"
            style="height: {((c.strain ?? 0) / maxStrain) * 100}%"
          >
            {#if (c.monotony ?? 0) >= MONOTONY_WARNING}
              <Icon icon="ic:baseline-warning" class="absolute -top-4 left-1/2 -translate-x-1/2 text-status-caution text-sm" />
            {/if}
          </div>
        </div>
      {/each}
      {#if !columns.some((c) => c.load > 0)}<ChartEmpty>No training logged in this window</ChartEmpty>{/if}
    </div>
    <div class="border-t border-border-strong/60 mt-1"></div>

    <p class="text-caption text-content-subtle pt-2 pb-1">Monotony</p>
    <div class="h-16 relative">
      <div class="absolute inset-x-0 border-t border-dashed border-status-caution/60 pointer-events-none" style="top: {monoY(MONOTONY_WARNING)}%"></div>
      <span class="absolute right-0 translate-x-full -translate-y-1/2 pl-1 text-caption leading-none text-status-caution tabular-nums pointer-events-none" style="top: {monoY(MONOTONY_WARNING)}%">{MONOTONY_WARNING.toFixed(1)}</span>
      <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={line} fill="none" stroke="var(--color-content-muted)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <path d={lonePoints} fill="none" stroke="var(--color-content-muted)" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
    <div class="border-t border-border-strong/60 mt-1"></div>

    <div class="flex gap-px mt-1">
      {#each columns as c, i (c.id)}
        <div class="flex-1 flex justify-center">
          {#if showsLabel(i, columns.length, axisStep)}
            <span class="text-caption leading-tight tabular-nums {c.isCurrent ? 'text-primary' : 'text-content-subtle'}">{c.label}</span>
          {/if}
        </div>
      {/each}
    </div>
    {#if picker.selected !== null}
      <div class="absolute inset-y-0 border-l border-content-subtle/40 pointer-events-none" style="left: calc((100% - 2.25rem) * {(picker.selected + 0.5) / Math.max(columns.length, 1)})"></div>
    {/if}
  </div>

  <div class="flex items-center gap-x-4 gap-y-1 flex-wrap">
    <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-[2px] bg-series-2"></div><span class="text-caption text-content-subtle">Strain</span></div>
    <div class="flex items-center gap-1.5"><div class="w-3.5 h-0 border-t border-content-muted"></div><span class="text-caption text-content-subtle">Monotony</span></div>
    <div class="flex items-center gap-1.5"><div class="w-3.5 h-0 border-t border-dashed border-status-caution"></div><span class="text-caption text-content-subtle">Warning level ({MONOTONY_WARNING})</span></div>
    <div class="flex items-center gap-1.5"><Icon icon="ic:baseline-warning" class="text-sm text-status-caution" /><span class="text-caption text-content-subtle">Monotony over it</span></div>
  </div>

  <ChartTable
    caption="Strain and monotony by column"
    columns={['Column', 'Strain', 'Monotony', 'Load']}
    rows={columns.map((c) => [c.label, Math.round(c.strain ?? 0), c.monotony?.toFixed(2) ?? '–', Math.round(c.load)])}
  />
</div>
