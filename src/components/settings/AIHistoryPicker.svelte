<script lang="ts">
  /** The two AI history dropdowns - Settings (the default) and the AI Coach (this request). */
  import { AI_HISTORY_FULL_WEEK_OPTIONS, AI_HISTORY_SUMMARY_WEEK_OPTIONS, type AIHistoryWindow } from '../../lib/preferences/migrate';

  let { value, onchange }: { value: AIHistoryWindow; onchange: (next: AIHistoryWindow) => void } = $props();

  const weeks = (n: number) => `${n} week${n === 1 ? '' : 's'}`;
</script>

<div class="grid grid-cols-2 gap-2">
  <label class="space-y-1 min-w-0">
    <span class="text-caption text-content-subtle block">Sessions in full</span>
    <select
      value={value.fullWeeks}
      onchange={(e) => onchange({ ...value, fullWeeks: Number(e.currentTarget.value) })}
      class="w-full bg-surface-elevated text-content px-3 py-2 rounded-control border border-border-strong outline-none text-label"
    >
      {#each AI_HISTORY_FULL_WEEK_OPTIONS as n}<option value={n}>Last {weeks(n)}</option>{/each}
    </select>
  </label>
  <label class="space-y-1 min-w-0">
    <span class="text-caption text-content-subtle block">Weekly summaries</span>
    <select
      value={value.summaryWeeks}
      onchange={(e) => onchange({ ...value, summaryWeeks: Number(e.currentTarget.value) })}
      class="w-full bg-surface-elevated text-content px-3 py-2 rounded-control border border-border-strong outline-none text-label"
    >
      {#each AI_HISTORY_SUMMARY_WEEK_OPTIONS as n}<option value={n}>{n === 0 ? 'None' : `${weeks(n)} before`}</option>{/each}
    </select>
  </label>
</div>
