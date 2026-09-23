<script lang="ts">
  import { RATING_AXES } from '../../lib/constants';
  /**
   * Analytics' Fatigue panel (UI_PLAN.md §4.6/§5.4, Stage 5). Home already
   * shows fatigue "as of now" (its own bars) - per §2's "Home = now,
   * Analytics = history, no duplicated panels" rule, this panel instead
   * samples the same shared `computeFatigueDecay` model at each displayed
   * week's end date (mirroring the sampling pattern `calculateRollingAcwrSeries`
   * already established in Stage 2), so it shows a genuine trend rather
   * than repeating Home's single snapshot.
   */
  import Icon from "@iconify/svelte";

  export interface FatigueWeekSample {
    weekId: string;
    fingers?: number;
    arms?: number;
    core?: number;
    systemic?: number;
  }
  export interface FatigueCoverage {
    total: number;
    fingers: number;
    arms: number;
    core: number;
    systemic: number;
  }

  let { samples, weekLabels, coverage }: {
    samples: FatigueWeekSample[];
    weekLabels: Record<string, string>;
    coverage: FatigueCoverage;
  } = $props();


  // Values are on a fixed 1-10 RPE-like scale (same as FatigueModal's
  // sliders), so the y-axis is a fixed 0-10 range, not a per-axis min/max -
  // this keeps the four rows visually comparable to each other.
  function toPoints(values: (number | undefined)[]): ({ x: number; y: number } | null)[] {
    const n = values.length;
    return values.map((v, i) => v === undefined ? null : { x: (i / Math.max(n - 1, 1)) * 100, y: 100 - (v / 10) * 100 });
  }

  /** Splits a point series into connected runs, breaking at gaps (undefined values) - same approach AcwrPanel/the merged Rolling Load chart use for `!sufficient`/undefined ACWR weeks. */
  function toSegments(points: ({ x: number; y: number } | null)[]): { x: number; y: number }[][] {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p === null) {
        if (current.length > 1) segments.push(current);
        current = [];
      } else {
        current.push(p);
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  }

  function latestValue(values: (number | undefined)[]): number | undefined {
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== undefined) return values[i];
    }
    return undefined;
  }
</script>

<div class="bg-surface/50 border border-border rounded-card p-4 space-y-3 shadow-card">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-section uppercase text-content-muted">Fatigue</h3>
      <p class="text-caption text-content-subtle mt-0.5">Decayed load per axis (0&ndash;10), across the window</p>
    </div>
    <Icon icon="ic:baseline-bolt" class="text-base text-content-subtle" />
  </div>

  <div class="space-y-3">
    {#each RATING_AXES as axis}
      {@const values = samples.map((s) => s[axis.key])}
      {@const points = toPoints(values)}
      {@const segments = toSegments(points)}
      {@const current = latestValue(values)}
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-caption text-content-subtle">{axis.label}</span>
          <span class="text-caption text-content tabular-nums">{current !== undefined ? current.toFixed(1) : '—'}</span>
        </div>
        <!-- One sparkline per axis on a shared fixed 0-10 scale, with a
             hairline baseline so the four rows read as one small-multiple
             set rather than four unrelated squiggles.
             Tall enough to read: at 28px a 0-10 range gave each RPE point
             under 3px, so every line looked like the same flat squiggle.
             64px plus a midline at 5 makes the shape and the half-scale
             crossing legible without turning four rows into a full page. -->
        <div class="h-16 relative border-b border-border/60">
          <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50 pointer-events-none"></div>
          <svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {#each segments as seg}
              <path
                d="M {seg.map((p) => `${p.x} ${p.y}`).join(' L ')}"
                fill="none"
                stroke="var(--color-primary)"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </svg>
        </div>
      </div>
    {/each}

    {#if coverage.total > 0}
      <p class="text-caption text-content-subtle/70 pt-0.5">Arms rated on {coverage.arms} of {coverage.total} sessions in this window</p>
    {:else}
      <p class="text-caption text-content-subtle italic text-center py-2">No completed sessions in this window</p>
    {/if}
  </div>
</div>
