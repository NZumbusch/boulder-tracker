<script lang="ts">
  /**
   * Changing a single exercise's timing while it runs (or before it starts):
   * a handful of numbers, whichever the exercise has. Nothing is applied
   * until Apply; the plan itself is never touched - this is for this run
   * (and, if wanted, a preset).
   */
  import Icon from '@iconify/svelte';
  import type { ExerciseValues } from '../../lib/types';
  import { untrack } from 'svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';

  let {
    variant,
    values,
    leadIn,
    baseValues,
    onApply,
    onSavePreset,
    onClose,
  }: {
    variant: 'timed' | 'counted' | 'pacer' | 'circuit';
    values: ExerciseValues;
    leadIn: number;
    /** The numbers the run began from - "Back to the plan" returns to them. */
    baseValues?: ExerciseValues;
    onApply: (values: ExerciseValues, leadIn: number) => void;
    onSavePreset?: (values: ExerciseValues, leadIn: number) => void;
    onClose: () => void;
  } = $props();

  backWhile(() => true, () => onClose());

  type Field = { key: string; label: string; unit?: string; min: number; step: number; read: (v: ExerciseValues) => number | undefined; write: (v: ExerciseValues, n: number) => ExerciseValues };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const FIELDS: Record<string, Field[]> = {
    timed: [
      { key: 'sets', label: 'Sets', min: 1, step: 1, read: (v) => num(v.sets), write: (v, n) => ({ ...v, sets: n }) },
      { key: 'reps', label: 'Reps', min: 1, step: 1, read: (v) => num(v.reps), write: (v, n) => ({ ...v, reps: n }) },
      { key: 'timeOn', label: 'On', unit: 's', min: 1, step: 1, read: (v) => num(v.timeOn), write: (v, n) => ({ ...v, timeOn: n }) },
      { key: 'timeOff', label: 'Off', unit: 's', min: 0, step: 1, read: (v) => num(v.timeOff), write: (v, n) => ({ ...v, timeOff: n }) },
      { key: 'rest', label: 'Between sets', unit: 's', min: 0, step: 5, read: (v) => num(v.timeBetweenSets), write: (v, n) => ({ ...v, timeBetweenSets: n }) },
    ],
    counted: [
      { key: 'sets', label: 'Sets', min: 1, step: 1, read: (v) => num(v.sets), write: (v, n) => ({ ...v, sets: n }) },
      { key: 'reps', label: 'Reps', min: 1, step: 1, read: (v) => num(v.reps), write: (v, n) => ({ ...v, reps: n }) },
      { key: 'rest', label: 'Rest', unit: 's', min: 0, step: 5, read: (v) => num(v.timeBetweenSets), write: (v, n) => ({ ...v, timeBetweenSets: n }) },
    ],
    pacer: [
      { key: 'cadence', label: 'Minutes each', unit: 'min', min: 0.5, step: 0.5, read: (v) => num(v.cadence), write: (v, n) => ({ ...v, cadence: n }) },
      { key: 'sets', label: 'Problems', min: 1, step: 1, read: (v) => num(v.sets), write: (v, n) => ({ ...v, sets: n }) },
    ],
  };
  const fields = $derived(FIELDS[variant] ?? []);

  let draft = $state<ExerciseValues>(untrack(() => untrackedCopy(values)));
  let lead = $state(untrack(() => leadIn));
  function untrackedCopy(v: ExerciseValues): ExerciseValues { return JSON.parse(JSON.stringify(v)); }

  function set(f: Field, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    draft = f.write(draft, Math.max(f.min, n));
  }
  /** Whether two sets of numbers differ in any field the sheet edits. */
  const differ = (x: ExerciseValues, y: ExerciseValues) => fields.some((f) => (f.read(x) ?? null) !== (f.read(y) ?? null));
  const changed = $derived(differ(draft, values) || lead !== leadIn);
  const differsFromBase = $derived(!!baseValues && differ(draft, baseValues));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="absolute inset-0 z-10 bg-black/50 flex items-end" onclick={onClose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="w-full max-h-[85%] overflow-y-auto no-scrollbar bg-surface rounded-t-card border-t border-border-strong p-5 pb-8 space-y-4 animate-in slide-in-from-bottom-10" onclick={(e) => e.stopPropagation()}>
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-title text-content">Adjust</h3>
      <button onclick={onClose} class="p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
    </div>
    <p class="text-caption text-content-subtle">Applies from where the timer is now. The plan itself isn't changed.</p>
    <div class="grid grid-cols-3 gap-2">
      {#each fields as f (f.key)}
        <label class="space-y-1 min-w-0">
          <span class="text-caption text-content-subtle truncate block">{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
          <input type="number" inputmode="decimal" min={f.min} step={f.step} value={f.read(draft) ?? ''} oninput={(e) => set(f, e.currentTarget.value)}
            class="w-full px-2.5 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums" />
        </label>
      {/each}
      <label class="space-y-1 min-w-0">
        <span class="text-caption text-content-subtle truncate block">Get ready (s)</span>
        <input type="number" inputmode="numeric" min="0" step="1" value={lead} oninput={(e) => { const n = Number(e.currentTarget.value); if (Number.isFinite(n)) lead = Math.max(0, Math.round(n)); }}
          class="w-full px-2.5 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums" />
      </label>
    </div>
    <div class="space-y-2">
      <button onclick={() => onApply(draft, lead)} disabled={!changed} class="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold disabled:opacity-40 transition-all active:scale-[0.98]">Apply</button>
      {#if differsFromBase}
        <button onclick={() => { draft = untrackedCopy(baseValues!); }} class="w-full py-2 text-label font-bold text-content-muted hover:text-content transition-colors">Back to the plan's numbers</button>
      {/if}
      {#if onSavePreset}
        <button onclick={() => onSavePreset(draft, lead)} class="w-full py-2 text-label font-bold text-content-muted hover:text-content transition-colors flex items-center justify-center gap-1.5"><Icon icon="ic:baseline-bookmark-add" class="text-base" /> Apply and save as a preset</button>
      {/if}
    </div>
  </div>
</div>
