<script lang="ts">
  /**
   * A thin strip of the phase on each day, one segment per run of days with
   * the same phase (a phase that starts or ends mid-week shows where). With
   * `names`, the phase's name sits under where it starts. With `onPick`,
   * a run can be tapped - the first day of it comes back, to open the Block
   * manager there. Presentational.
   */
  import { stripRuns, type PhaseMark } from '../../lib/planning/phaseStrip';

  let { days, marks, names = false, onPick }: { days: number[]; marks: Map<number, PhaseMark>; names?: boolean; onPick?: (firstDay: number) => void } = $props();
  const runs = $derived(stripRuns(days, marks));
</script>

<div class="flex gap-px">
  {#each runs as run, i (i)}
    <svelte:element
      this={onPick ? 'button' : 'div'}
      class="min-w-0 text-left {onPick ? 'tap' : ''}"
      style="flex: {run.count} 1 0"
      onclick={onPick ? () => onPick(run.from) : undefined}
      aria-label={onPick ? (run.mark ? `Edit the ${run.mark.name} phase` : 'No phase - start one') : undefined}
      aria-hidden={onPick ? undefined : true}
    >
      <span class="block h-1 rounded-full {run.mark?.color ?? 'bg-transparent'}"></span>
      {#if names}<span class="block truncate text-[9px] leading-tight text-content-subtle mt-0.5">{run.mark?.name ?? ''}</span>{/if}
    </svelte:element>
  {/each}
</div>
