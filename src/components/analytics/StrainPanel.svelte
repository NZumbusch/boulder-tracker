<script lang="ts">
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
      <h3 class="text-section uppercase text-content-muted">Monotony & Strain</h3>
      <p class="text-caption text-content-subtle mt-0.5">Too few easy days shows as monotony above {MONOTONY_WARNING}{monthly ? ' · mean week per month' : ''}</p>
    </div>
    {#if latest?.monotony !== undefined}
      <div class="text-right shrink-0">
        <p class="text-body font-semibold tabular-nums {latest.monotony >= MONOTONY_WARNING ? 'text-status-caution' : 'text-content'}">{latest.monotony.toFixed(1)}</p>
        <p class="text-caption text-content-subtle">latest monotony</p>
      </div>
    {/if}
  </div>

  <div class="text-caption tabular-nums min-h-[1.25rem] text-content-muted">
    {#if selected}
      {selected.label}
      <span class="text-content-subtle"> · strain</span> <span class="text-content">{Math.round(selected.strain ?? 0)}</span>
      <span class="text-content-subtle"> · monotony</span> <span class="text-content">{selected.monotony?.toFixed(2) ?? '–'}</span>
      <span class="text-content-subtle"> · load</span> <span class="text-content">{Math.round(selected.load)}</span>
    {:else}
      <span class="text-content-subtle/70">Tap a column for its values</span>
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
      <div class="absolute inset-x-0 border-t border-dashed border-status-caution/50 pointer-events-none" style="top: {monoY(MONOTONY_WARNING)}%"></div>
      {#each columns as c, i (c.id)}
        <div class="flex-1 h-full flex justify-center items-end">
          <div
            class="w-[62%] max-w-[16px] rounded-[2px] transition-opacity {(c.monotony ?? 0) >= MONOTONY_WARNING ? 'bg-status-caution/70' : c.isCurrent ? 'bg-tertiary' : 'bg-tertiary/45'} {picker.selected !== null && picker.selected !== i ? 'opacity-40' : ''}"
            style="height: {((c.strain ?? 0) / maxStrain) * 100}%"
          ></div>
        </div>
      {/each}
      <svg class="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={line} fill="none" stroke="var(--color-content-muted)" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
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

  <div class="flex items-center gap-x-4 gap-y-1 flex-wrap">
    <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-[2px] bg-tertiary"></div><span class="text-caption text-content-subtle">Strain</span></div>
    <div class="flex items-center gap-1.5"><div class="w-3.5 h-0 border-t border-content-muted"></div><span class="text-caption text-content-subtle">Monotony</span></div>
    <div class="flex items-center gap-1.5"><div class="w-3.5 h-0 border-t border-dashed border-status-caution"></div><span class="text-caption text-content-subtle">Warning ({MONOTONY_WARNING})</span></div>
  </div>
</div>
