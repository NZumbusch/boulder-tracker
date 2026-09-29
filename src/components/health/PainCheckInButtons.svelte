<script lang="ts">
  /** The one-tap check-in on a pain issue: Gone / Better / Same / Worse. Home's card, the post-session sheet and the issue page all use it. */
  import type { PainTrend } from '../../lib/types';
  import { TREND_LABELS, TREND_ICONS } from '../../lib/pain/issues';
  import Icon from '@iconify/svelte';

  let { onPick, chosen = null, disabled = false }: {
    onPick: (trend: PainTrend) => void;
    /** Marks an answer already given (the post-session sheet collects them before saving). */
    chosen?: PainTrend | null;
    disabled?: boolean;
  } = $props();

  const ORDER: PainTrend[] = ['gone', 'better', 'same', 'worse'];
  const TONE: Record<PainTrend, string> = {
    gone: 'text-success border-success/40 bg-success/10',
    better: 'text-success border-success/30',
    same: 'text-content-muted border-border-strong',
    worse: 'text-danger border-danger/30',
  };
</script>

<div class="grid grid-cols-4 gap-1.5">
  {#each ORDER as trend}
    <button
      type="button"
      {disabled}
      onclick={() => onPick(trend)}
      class="py-2 rounded-control border text-label font-bold flex flex-col items-center gap-0.5 transition-all active:scale-95 disabled:opacity-40 {chosen === trend ? 'ring-2 ring-primary/60 ' : ''}{TONE[trend]}"
      aria-pressed={chosen === trend}
    >
      <Icon icon={TREND_ICONS[trend]} class="text-lg" />
      {TREND_LABELS[trend]}
    </button>
  {/each}
</div>
