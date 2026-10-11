<script lang="ts">
  /**
   * The editable header of a circuit/superset: its name, rounds and the two
   * rests, plus - for members that have a set rest of their own - what they
   * actually get inside the group, so a superset can be tuned by eye.
   * Used by the workout editor (and by the circuit library, later).
   */
  import type { Snippet } from 'svelte';
  import type { ExerciseGroup } from '../../lib/types';
  import type { RestComparison } from '../../lib/exercise/groups';
  import { formatSeconds } from '../../lib/exercise/groups';
  import { formatMinutes } from '../../lib/session/formatSession';
  import Icon from '@iconify/svelte';

  let {
    group,
    minutes,
    comparisons = [],
    dropouts = [],
    nameOf,
    onchange,
    onUngroup,
    actions,
    namePlaceholder = 'Circuit',
  }: {
    group: ExerciseGroup;
    minutes?: number;
    comparisons?: RestComparison[];
    /** Members that take part in fewer rounds than the group has (their sets). */
    dropouts?: { slotId: string; rounds: number }[];
    /** A member's display name by slot id, for the rest comparison. */
    nameOf: (slotId: string) => string;
    onchange: (group: ExerciseGroup) => void;
    /** Extra buttons beside the name (Save as circuit). */
    actions?: Snippet;
    namePlaceholder?: string;
    /** Leave out where a group can't be dissolved (the circuit library). */
    onUngroup?: () => void;
  } = $props();

  const set = (patch: Partial<ExerciseGroup>) => onchange({ ...group, ...patch });

  /** Seconds from a field: blank means "none". */
  function seconds(raw: string): number | undefined {
    const n = Math.round(Number(raw));
    return raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
  }
</script>

<div class="px-1.5 pt-1 space-y-2.5">
  <div class="flex items-center gap-2">
    <Icon icon="ic:baseline-repeat" class="text-lg text-content-subtle shrink-0" />
    <input
      value={group.name ?? ''}
      oninput={(e) => set({ name: e.currentTarget.value || undefined })}
      placeholder={namePlaceholder}
      class="min-w-0 flex-1 bg-transparent text-body font-bold text-content outline-none border-b border-dashed border-border-strong focus:border-primary/60 pb-0.5 transition-colors"
    />
    {#if minutes}<span class="text-caption text-content-subtle tabular-nums shrink-0">~{formatMinutes(Math.ceil(minutes))}</span>{/if}
    {@render actions?.()}
    {#if onUngroup}
      <button onclick={onUngroup} class="shrink-0 px-2 py-1 text-caption font-bold text-content-subtle hover:text-content transition-colors" title="Turn back into separate exercises">
        Ungroup
      </button>
    {/if}
  </div>

  <div class="grid grid-cols-3 gap-2">
    <div class="min-w-0">
      <p class="text-caption text-content-subtle mb-1">Rounds</p>
      <div class="flex items-center bg-surface-elevated/50 border border-border-strong rounded-control">
        <button onclick={() => set({ rounds: Math.max(1, group.rounds - 1) })} class="px-2 py-1.5 text-content-subtle hover:text-content" aria-label="One round fewer">
          <Icon icon="ic:baseline-remove" class="text-base" />
        </button>
        <span class="flex-1 text-center text-label font-bold text-content tabular-nums">{group.rounds}</span>
        <button onclick={() => set({ rounds: group.rounds + 1 })} class="px-2 py-1.5 text-content-subtle hover:text-content" aria-label="One more round">
          <Icon icon="ic:baseline-add" class="text-base" />
        </button>
      </div>
    </div>
    <label class="min-w-0 block">
      <span class="block text-caption text-content-subtle mb-1">Switch (s)</span>
      <input
        type="number" min="0" step="5" inputmode="numeric" placeholder="0"
        value={group.transition ?? ''}
        onchange={(e) => set({ transition: seconds(e.currentTarget.value) })}
        class="w-full px-2.5 py-1.5 bg-surface-elevated/50 text-content text-label font-bold tabular-nums rounded-control border border-border-strong outline-none focus:border-primary/50"
      />
    </label>
    <label class="min-w-0 block">
      <span class="block text-caption text-content-subtle mb-1">Rest after round (s)</span>
      <input
        type="number" min="0" step="15" inputmode="numeric" placeholder={group.transition ? String(group.transition) : '0'}
        value={group.roundRest ?? ''}
        onchange={(e) => set({ roundRest: seconds(e.currentTarget.value) })}
        class="w-full px-2.5 py-1.5 bg-surface-elevated/50 text-content text-label font-bold tabular-nums rounded-control border border-border-strong outline-none focus:border-primary/50"
      />
    </label>
  </div>

  <p class="text-caption text-content-subtle">Switch is the pause between exercises; set an exercise's own rest in its details. Each exercise sets its own time or reps.</p>

  {#if dropouts.length > 0}
    <div class="space-y-0.5">
      {#each dropouts as d (d.slotId)}
        <p class="text-caption text-content-subtle">
          <span class="text-content-muted">{nameOf(d.slotId)}</span> stops after round {d.rounds} (its sets)
        </p>
      {/each}
    </div>
  {/if}
  {#if comparisons.length > 0}
    <div class="space-y-0.5">
      {#each comparisons as c (c.slotId)}
        <p class="text-caption text-content-subtle">
          <span class="text-content-muted">{nameOf(c.slotId)}</span> rests
          <span class="font-bold tabular-nums {c.gets < c.wanted * 0.9 ? 'text-warning' : 'text-content'}">{formatSeconds(c.gets)}</span>
          here · planned alone {formatSeconds(c.wanted)}
        </p>
      {/each}
    </div>
  {/if}
</div>
