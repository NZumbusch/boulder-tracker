<script lang="ts">
  /**
   * Pain timeline: every pain log in the window as a dot on its body part's
   * row, sized and coloured by severity, over the daily load - so a niggle
   * can be read against what training came before it. A ring marks a log
   * whose week (or the week before) had a load spike or a high-risk ACWR
   * (`correlatePainWithLoadSpikes`).
   */
  import { showsLabel, sparseLabelStep } from '../../lib/analytics/chartWindow';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import type { PainRow } from '../../lib/analytics/timeline';
  // Hover is mouse-only (see HeatmapPanel for why).
  import { isTapPointer, isKeyboardActivation } from '../../lib/analytics/chartTips.svelte';

  let { firstDay, lastDay, rows, spikeIds, loadByDay }: {
    firstDay: number;
    lastDay: number;
    rows: PainRow[];
    /** Pain log ids with a load spike nearby. */
    spikeIds: Set<string>;
    loadByDay: Map<number, number>;
  } = $props();

  const dayCount = $derived(Math.max(lastDay - firstDay + 1, 1));
  const xOf = (day: number) => ((day - firstDay + 0.5) / dayCount) * 100;
  const days = $derived(Array.from({ length: dayCount }, (_, i) => firstDay + i));
  const maxLoad = $derived(Math.max(1, ...days.map((d) => loadByDay.get(d) ?? 0)));
  const axisStep = $derived(sparseLabelStep(dayCount, 4));

  function severityColor(s: number): string {
    if (s >= 7) return 'var(--color-status-risk)';
    if (s >= 4) return 'var(--color-status-caution)';
    return 'var(--color-status-neutral)';
  }

  let selected = $state<{ row: string; id: string } | null>(null);
  const selectedInfo = $derived.by(() => {
    if (!selected) return null;
    const row = rows.find((r) => r.bodyPart === selected!.row);
    const point = row?.points.find((p) => p.id === selected!.id);
    if (!row || !point) return null;
    return {
      date: new Date(`${dayIndexToIso(point.day)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      bodyPart: row.bodyPart,
      severity: point.severity,
      notes: point.notes,
      spike: spikeIds.has(point.id),
    };
  });
  const fmtDay = (day: number) => new Date(`${dayIndexToIso(day)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<div id="section-pain" class="scroll-mt-4 bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div>
    <h3 class="text-section uppercase text-content-muted">Pain</h3>
    <p class="text-caption text-content-subtle mt-0.5">By body part over daily load · ringed: load spike that week or the one before</p>
  </div>

  {#if rows.length === 0}
    <p class="text-caption text-content-subtle italic text-center py-4">No pain logged in this window</p>
  {:else}
    <div class="space-y-1">
      {#each rows as row (row.bodyPart)}
        <div class="flex items-center gap-2">
          <div class="w-20 shrink-0 text-caption text-content-muted truncate" title={row.bodyPart}>{row.bodyPart}</div>
          <div class="flex-1 min-w-0 h-6 relative">
            <div class="absolute inset-x-0 top-1/2 border-t border-border"></div>
            {#each row.points as p (p.id)}
              {@const size = 6 + p.severity}
              <button
                type="button"
                onpointerup={(e) => { if (isTapPointer(e)) selected = selected?.id === p.id ? null : { row: row.bodyPart, id: p.id }; }}
                onclick={(e) => { if (isKeyboardActivation(e)) selected = selected?.id === p.id ? null : { row: row.bodyPart, id: p.id }; }}
                onpointerenter={(e) => { if (!isTapPointer(e)) selected = { row: row.bodyPart, id: p.id }; }}
                aria-label="{row.bodyPart}, severity {p.severity}"
                class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full {spikeIds.has(p.id) ? 'ring-2 ring-status-risk/60 ring-offset-1 ring-offset-surface' : ''} {selected?.id === p.id ? 'outline outline-1 outline-content' : ''}"
                style="left: {xOf(p.day)}%; width: {size}px; height: {size}px; background: {severityColor(p.severity)};"
              ></button>
            {/each}
          </div>
        </div>
      {/each}

      <div class="flex items-end gap-2 pt-1">
        <div class="w-20 shrink-0 text-caption text-content-subtle">Load</div>
        <div class="flex-1 min-w-0">
          <svg class="w-full h-8 block" preserveAspectRatio="none" viewBox="0 0 100 100">
            {#each days as day}
              {@const l = loadByDay.get(day) ?? 0}
              {#if l > 0}
                <rect x={xOf(day) - 35 / dayCount} width={70 / dayCount} y={100 - (l / maxLoad) * 100} height={(l / maxLoad) * 100} fill="var(--color-content-subtle)" fill-opacity="0.3" />
              {/if}
            {/each}
          </svg>
          <div class="border-t border-border-strong/60"></div>
          <div class="relative h-4">
            {#each days as day, i}
              {#if showsLabel(i, days.length, axisStep)}
                <span
                  class="absolute top-0 text-caption leading-tight text-content-subtle/70 whitespace-nowrap"
                  style="left: {xOf(day)}%; transform: translateX({i === 0 ? '0' : i === days.length - 1 ? '-100%' : '-50%'});"
                >{fmtDay(day)}</span>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    </div>

    <p class="text-caption text-content-muted min-h-[1.25rem]">
      {#if selectedInfo}
        <span class="text-content-subtle">{selectedInfo.date}</span> · {selectedInfo.bodyPart} · {selectedInfo.severity}/10{selectedInfo.notes ? ` · ${selectedInfo.notes}` : ''}{selectedInfo.spike ? ' · load spike nearby' : ''}
      {:else}
        <span class="text-content-subtle/70">Tap a dot for details</span>
      {/if}
    </p>
  {/if}
</div>
