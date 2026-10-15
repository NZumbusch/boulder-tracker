<script lang="ts">
  /**
   * Changing a single exercise's timing while it runs (or before it starts):
   * a handful of numbers, whichever the exercise has. Nothing is applied
   * until Apply; the plan itself is never touched - this is for this run
   * (and, if wanted, a preset).
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import type { ExerciseValues } from '../../lib/types';
  import { untrack } from 'svelte';

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

  /** Said out loud when a typed number was raised to its minimum, rather than changing it silently. */
  let notice = $state('');
  function set(f: Field, raw: string) {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    notice = n < f.min ? `${f.label} is at least ${f.min}${f.unit ? ` ${f.unit}` : ''}.` : '';
    draft = f.write(draft, Math.max(f.min, n));
  }
  /** Whether two sets of numbers differ in any field the sheet edits. */
  const differ = (x: ExerciseValues, y: ExerciseValues) => fields.some((f) => (f.read(x) ?? null) !== (f.read(y) ?? null));
  const changed = $derived(differ(draft, values) || lead !== leadIn);
  const differsFromBase = $derived(!!baseValues && differ(draft, baseValues));
</script>

<Sheet title="Adjust" subtitle="Applies from where the timer is now. The plan itself isn't changed." level="nested" {onClose}>
  <div class="grid grid-cols-3 gap-2">
    {#each fields as f (f.key)}
      <label class="space-y-1 min-w-0">
        <span class="text-caption text-content-subtle truncate block">{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
        <input type="number" inputmode={f.step < 1 ? 'decimal' : 'numeric'} enterkeyhint="done" min={f.min} step={f.step} value={f.read(draft) ?? ''} oninput={(e) => set(f, e.currentTarget.value)} class="field px-2.5 tabular-nums" />
      </label>
    {/each}
    <label class="space-y-1 min-w-0">
      <span class="text-caption text-content-subtle truncate block">Get ready (s)</span>
      <input type="number" inputmode="numeric" enterkeyhint="done" min="0" step="1" value={lead} oninput={(e) => { const n = Number(e.currentTarget.value); if (e.currentTarget.value.trim() !== '' && Number.isFinite(n)) { lead = Math.max(0, Math.round(n)); notice = n < 0 ? 'Get ready is at least 0 s.' : ''; } }} class="field px-2.5 tabular-nums" />
    </label>
  </div>
  {#if notice}<p class="text-caption text-warning" role="status">{notice}</p>{/if}
  {#if differsFromBase}
    <button onclick={() => { draft = untrackedCopy(baseValues!); }} class="btn btn-ghost w-full">Back to the plan's numbers</button>
  {/if}
  {#if onSavePreset}
    <button onclick={() => onSavePreset(draft, lead)} class="btn btn-ghost w-full"><Icon icon="ic:baseline-bookmark-add" class="text-base" /> Apply and save as a preset</button>
  {/if}
  {#snippet footer()}
    <div class="flex-1 min-w-0">
      <button onclick={() => onApply(draft, lead)} disabled={!changed} class="btn btn-primary w-full">Apply</button>
      {#if !changed}<p class="text-caption text-content-subtle text-center mt-1">Change a number to apply it.</p>{/if}
    </div>
  {/snippet}
</Sheet>
