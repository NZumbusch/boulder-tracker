<script lang="ts">
  /** The readiness hero: score ring, status and advice, and a tap-to-open breakdown of what cost points. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import { MAX_FATIGUE_PENALTY, MAX_ACWR_PENALTY, MAX_SLEEP_PENALTY, MAX_HRV_PENALTY, MAX_PAIN_PENALTY, type ReadinessStatus } from '../../../lib/analytics/readiness';
  import Icon from '@iconify/svelte';
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { motionMs } from '../../../lib/motion';

  let { data }: { data: HomeData } = $props();
  const readiness = $derived(data.readiness);
  const STATUS_COLOR: Record<ReadinessStatus, string> = {
    good: 'text-status-good',
    caution: 'text-status-caution',
    risk: 'text-status-risk',
    neutral: 'text-status-neutral',
  };
  const STATUS_BAR: Record<ReadinessStatus, string> = {
    good: 'bg-status-good',
    caution: 'bg-status-caution',
    risk: 'bg-status-risk',
    neutral: 'bg-status-neutral',
  };
  // Bold hero treatment: a status-tinted gradient + border in this app's
  // status tokens. Full literal Tailwind class strings, not
  // built via template interpolation - Tailwind's JIT can't see classes
  // assembled at runtime, only ones it can find as complete strings.
  const STATUS_HERO_BG: Record<ReadinessStatus, string> = {
    good: 'bg-gradient-to-br from-status-good/15 via-surface to-surface border-status-good/30',
    caution: 'bg-gradient-to-br from-status-caution/15 via-surface to-surface border-status-caution/30',
    risk: 'bg-gradient-to-br from-status-risk/15 via-surface to-surface border-status-risk/30',
    neutral: 'bg-surface/50 border-border',
  };
  // Referenced from inline `style` (not a Tailwind class), so this one is
  // safe to build dynamically - `color-mix()` needs a real custom-property
  // reference, and `--theme-status-*` are already hex per-theme (never
  // channel triples), matching the `color-mix` fix `AcwrPanel.svelte`
  // already established (not an invalid `rgba(var(...))`).
  const STATUS_VAR: Record<ReadinessStatus, string> = {
    good: 'var(--theme-status-good)',
    caution: 'var(--theme-status-caution)',
    risk: 'var(--theme-status-risk)',
    neutral: 'var(--theme-status-neutral)',
  };
  const STATUS_ICON: Record<ReadinessStatus, string> = {
    good: 'ic:baseline-local-fire-department',
    caution: 'ic:baseline-info',
    risk: 'ic:baseline-warning-amber',
    neutral: 'ic:baseline-help-outline',
  };
  // Tap-to-open breakdown: one row per input, its bar scaled to that
  // input's own maximum so "half of what sleep can cost" reads as half.
  let showBreakdown = $state(false);
  const BREAKDOWN_ROWS = $derived([
    { label: 'Fatigue', penalty: readiness.penalties.fatigue, max: MAX_FATIGUE_PENALTY, used: readiness.inputsUsed.fatigue },
    { label: 'Load', penalty: readiness.penalties.acwr, max: MAX_ACWR_PENALTY, used: readiness.inputsUsed.acwr },
    { label: 'Sleep', penalty: readiness.penalties.sleep, max: MAX_SLEEP_PENALTY, used: readiness.inputsUsed.sleep },
    { label: 'HRV', penalty: readiness.penalties.hrv, max: MAX_HRV_PENALTY, used: readiness.inputsUsed.hrv },
    // Only with an open issue - no pain isn't "no data".
    ...(readiness.inputsUsed.pain ? [{ label: 'Pain', penalty: readiness.penalties.pain, max: MAX_PAIN_PENALTY, used: true }] : []),
  ]);
  /**
   * Each row's colour is its own verdict - how much of what that input can
   * cost it is costing - not the overall status. A big sleep penalty on an
   * otherwise good day used to be painted green along with everything else.
   */
  function rowStatus(penalty: number, max: number, used: boolean): ReadinessStatus {
    if (!used) return 'neutral';
    const share = max > 0 ? penalty / max : 0;
    return share < 1 / 3 ? 'good' : share < 2 / 3 ? 'caution' : 'risk';
  }
  const RING_RADIUS = 44;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // Opening Home draws the ring in from empty and counts the number up;
  // a later change (sleep logged, a session rated) glides from the old
  // score to the new one. Instant with reduced motion.
  // A plain frame loop rather than svelte/motion's Tween: that only runs
  // where Svelte's build flags say "browser", and it stood still here.
  let displayed = $state(0);
  $effect(() => {
    const target = readiness.score ?? 0;
    const from = untrack(() => displayed);
    const duration = motionMs(900);
    if (duration === 0 || from === target) {
      displayed = target;
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      displayed = from + (target - from) * cubicOut(t);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });
  const ringOffset = $derived(RING_CIRCUMFERENCE * (1 - displayed / 100));
  const canBreakDown = $derived(trainingState.homeDetails['readiness.breakdown'] && readiness.score !== undefined);
</script>

<div
  class="relative overflow-hidden rounded-card border p-5 transition-colors {STATUS_HERO_BG[readiness.status]}"
  style="box-shadow: 0 14px 40px -18px color-mix(in srgb, {STATUS_VAR[readiness.status]} 45%, transparent), var(--shadow-card);"
>
 <div class="flex items-center gap-5">
  <button
    class="relative w-28 h-28 shrink-0 rounded-full {canBreakDown ? 'cursor-pointer' : 'cursor-default'}"
    onclick={() => { if (canBreakDown) showBreakdown = !showBreakdown; }}
    disabled={!canBreakDown}
    aria-expanded={canBreakDown ? showBreakdown : undefined}
    aria-label={canBreakDown ? (showBreakdown ? 'Hide score breakdown' : 'Show score breakdown') : `Readiness ${readiness.score !== undefined ? Math.round(readiness.score) : 'unavailable'}`}
  >
    <svg viewBox="0 0 100 100" class="w-28 h-28 -rotate-90">
      <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="var(--theme-border)" stroke-width="7" />
      {#if readiness.score !== undefined}
        <circle
          cx="50" cy="50" r={RING_RADIUS} fill="none" stroke-width="7" stroke-linecap="round"
          class={STATUS_COLOR[readiness.status]}
          stroke="currentColor"
          stroke-dasharray={RING_CIRCUMFERENCE}
          stroke-dashoffset={ringOffset}
        />
      {/if}
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      <!-- The ring is a fixed size, so three digits ("100") are held to what fits inside it, whatever the text size. --><span class="text-display text-content tabular-nums leading-none" style={readiness.score !== undefined && Math.round(displayed) >= 100 ? 'font-size: min(var(--typescale-display), 2.1rem)' : undefined}>{readiness.score !== undefined ? Math.round(displayed) : '—'}</span>
    </div>
    <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface border-2 border-app-bg shadow-card flex items-center justify-center {STATUS_COLOR[readiness.status]}">
      <Icon icon={STATUS_ICON[readiness.status]} class="text-base" />
    </div>
  </button>
  <div class="min-w-0 space-y-1.5">
    <span class="text-section uppercase {STATUS_COLOR[readiness.status]}">{readiness.status}</span>
    <p class="text-body text-content leading-snug">{readiness.advice}</p>
    <!-- Stays put when the breakdown opens: hiding it made the card jump. -->
    {#if trainingState.homeDetails['readiness.confidence']}
      <p class="text-caption text-content-subtle flex items-start gap-1">
        <Icon icon="ic:baseline-insights" class="text-content-subtle text-sm mt-0.5 shrink-0" />
        <span>{readiness.confidence}</span>
      </p>
    {/if}
  </div>
 </div>
  {#if canBreakDown && showBreakdown}
    <div class="mt-4 pt-3 border-t border-border/60 space-y-2" transition:slide={{ duration: motionMs(260), easing: cubicOut }}>
      {#each BREAKDOWN_ROWS as row}
        <div class="flex items-center gap-3">
          <span class="w-14 text-label text-content-subtle shrink-0">{row.label}</span>
          <div class="flex-1 h-1.5 bg-surface-elevated rounded-control overflow-hidden border border-border-strong/30">
            <div class="h-full rounded-control origin-left {STATUS_BAR[rowStatus(row.penalty, row.max, row.used)]} breakdown-bar" style="width: {Math.min(100, (row.penalty / row.max) * 100)}%"></div>
          </div>
          <span class="w-12 text-right text-label tabular-nums shrink-0 {!row.used ? 'text-content-subtle' : rowStatus(row.penalty, row.max, row.used) === 'good' ? 'text-content' : STATUS_COLOR[rowStatus(row.penalty, row.max, row.used)]}">
            {row.used ? (Math.round(row.penalty) > 0 ? `−${Math.round(row.penalty)}` : '0') : 'no data'}
          </span>
        </div>
      {/each}
      <p class="text-caption text-content-subtle">Points taken off 100. Each bar is coloured by how much of its maximum it costs.</p>
    </div>
  {/if}
</div>

<style>
  /* The breakdown's bars grow in as it slides open. */
  .breakdown-bar {
    animation: grow 420ms cubic-bezier(0.33, 1, 0.68, 1) both;
  }
  @keyframes grow {
    from { transform: scaleX(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .breakdown-bar { animation: none; }
  }
</style>
