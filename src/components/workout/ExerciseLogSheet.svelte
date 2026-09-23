<script lang="ts">
  /**
   * "What did you actually do?" - the step between finishing an exercise
   * and moving to the next one.
   *
   * Deliberately *not* `ExerciseForm`: that form owns choosing a type and
   * which parameters it tracks, which is a planning decision, and hitting
   * a screen that size five times a session is the wrong weight for a
   * mid-workout interaction. This shows only the numeric fields the slot
   * already tracks, prefilled from the target, each with its prescribed
   * value beside it. The full form stays one tap away for the case this
   * can't express (changing the exercise type, adding a parameter).
   *
   * Editing `logged` only - the plan is never written here, per the
   * prescribed/logged split in `types.ts`.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { displayWeight, toKg } from '../../lib/units';
  import type { ExerciseSlot, ExerciseValues, ParameterBlock } from '../../lib/types';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import TargetHint from './TargetHint.svelte';
  import Icon from '@iconify/svelte';

  let { slot, seed: seedOverride = null, onSave, onCancel, onEditFull }: {
    slot: ExerciseSlot;
    /**
     * Values to prefill instead of the slot's own - the interval timer
     * hands over the sets/reps it actually counted. Null for the normal
     * path, where the target is the right starting point.
     */
    seed?: ExerciseValues | null;
    onSave: (values: ExerciseValues) => void;
    onCancel: () => void;
    onEditFull: () => void;
  } = $props();

  /**
   * The numeric parameters this sheet can edit inline, with the unit shown
   * beside the target. Everything else a slot might track (grades, styles,
   * board type, hold type) is a picker, not a number - those are left to
   * the full form rather than half-rendered here, and they rarely change
   * between planning a set and doing it.
   */
  const NUMERIC_FIELDS: { key: keyof ExerciseValues; param: ParameterBlock; unit: string; step?: number }[] = [
    { key: 'duration', param: 'duration', unit: 'm' },
    { key: 'sets', param: 'sets', unit: '' },
    { key: 'reps', param: 'reps', unit: '' },
    { key: 'weight', param: 'weight', unit: 'kg', step: 0.5 },
    { key: 'holdSize', param: 'holdSize', unit: 'mm' },
    { key: 'timeOn', param: 'timeOn', unit: 's' },
    { key: 'timeOff', param: 'timeOff', unit: 's' },
    { key: 'distance', param: 'distance', unit: 'km', step: 0.1 },
    { key: 'cadence', param: 'cadence', unit: '' },
    { key: 'movesPerRoute', param: 'movesPerRoute', unit: '' },
    { key: 'bodyweightPercent', param: 'bodyweightPercent', unit: '%' },
    { key: 'maxWeightPercent', param: 'maxWeightPercent', unit: '%' },
    { key: 'boardAngle', param: 'boardAngle', unit: '°' },
  ];

  const target = $derived(slot.prescribed ?? {});
  /** A stored kg weight in the chosen unit, one decimal. */
  const shownWeight = (kg: number) => Math.round(displayWeight(kg, trainingState.units.weight) * 10) / 10;
  /**
   * Seeded from the target so "I did what it said" needs no typing at all,
   * unless a caller hands over something better - a finished interval run
   * knows the sets and reps that were actually counted.
   */
  const seed = $derived(seedOverride ?? slot.logged ?? slot.prescribed ?? {});

  const activeParams = $derived<ParameterBlock[]>(
    slot.activeParameters
      ?? (trainingState.exerciseTypes.find((t) => t.id === slot.typeId)?.parameters ?? []),
  );

  const fields = $derived(NUMERIC_FIELDS.filter((f) => activeParams.includes(f.param)));

  // Local, string-keyed draft: an <input type="number"> bound to a number
  // can't represent "cleared", and blanking a field mid-edit would
  // otherwise snap it back to 0 under the cursor.
  //
  // Written through `oninput` rather than `bind:value` on purpose: Svelte
  // coerces a `bind:value` on a number input *to a number*, which would
  // put numbers in here and make the `.trim()` reads below throw. Reading
  // `currentTarget.value` always yields the raw string.
  let draft = $state<Record<string, string>>({});
  let notes = $state('');
  let difficulty = $state<number | undefined>(undefined);
  let seededFor = $state<string | null>(null);

  // Re-seed when the sheet opens for a different exercise, or when a
  // caller hands over a different set of values. Keyed rather than run on
  // every change, so typing into a field never re-reads the seed out from
  // under the draft.
  const seedKey = $derived(`${slot.id}:${seedOverride ? JSON.stringify(seedOverride) : ''}`);

  $effect(() => {
    if (seededFor === seedKey) return;
    seededFor = seedKey;
    const values = seed;
    const next: Record<string, string> = {};
    for (const field of NUMERIC_FIELDS) {
      const value = values[field.key];
      next[field.key] = typeof value === 'number' ? String(field.key === 'weight' ? shownWeight(value) : value) : '';
    }
    draft = next;
    notes = values.notes ?? '';
    difficulty = typeof values.difficulty === 'number' ? values.difficulty : undefined;
  });

  const tracksDifficulty = $derived(activeParams.includes('difficulty'));

  /** The draft's raw text for a field, normalised - never assumes a string is there. */
  function rawValue(key: string): string {
    const value = draft[key];
    return value === undefined || value === null ? '' : String(value).trim();
  }

  /** Merges the draft over the seed, so parameters this sheet doesn't show survive untouched. */
  function collect(): ExerciseValues {
    const values: ExerciseValues = { ...seed };
    for (const field of fields) {
      const raw = rawValue(field.key);
      if (raw === '') {
        delete values[field.key];
      } else {
        const n = Number(raw);
        // Weight is typed in the chosen unit and stored in kg.
        if (Number.isFinite(n)) (values[field.key] as number) = field.key === 'weight' ? Math.round(toKg(n, trainingState.units.weight) * 100) / 100 : n;
      }
    }
    values.notes = notes.trim() || undefined;
    if (tracksDifficulty && difficulty !== undefined) values.difficulty = difficulty;
    return values;
  }

  function handleSave() {
    onSave(collect());
  }

  /** One tap for the common case: it went exactly as prescribed. */
  function handleAsPrescribed() {
    onSave({ ...(slot.prescribed ?? seed) });
  }

  function numberOrUndefined(key: string): number | undefined {
    const raw = rawValue(key);
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
</script>

<div
  class="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
>
  <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[88vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200">
    <div class="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">What you did</p>
        <h3 class="text-title text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</h3>
      </div>
      <button onclick={onCancel} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Cancel">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="p-5 space-y-4">
      {#if fields.length === 0}
        <p class="text-caption text-content-subtle italic">
          This exercise tracks no numeric values &mdash; log it as done, or open the full editor to change what it tracks.
        </p>
      {:else}
        <div class="grid grid-cols-2 gap-3">
          {#each fields as field (field.key)}
            <label class="space-y-1.5 min-w-0">
              <span class="flex items-baseline justify-between gap-2">
                <span class="text-label text-content-subtle truncate">{PARAMETER_LABELS[field.param]}</span>
                <TargetHint
                  prescribed={field.key === 'weight' && typeof target.weight === 'number' ? shownWeight(target.weight) : target[field.key] as number | undefined}
                  current={numberOrUndefined(field.key)}
                  unit={field.key === 'weight' ? trainingState.units.weight : field.unit}
                />
              </span>
              <input
                type="number"
                inputmode="decimal"
                step={field.step ?? 1}
                value={draft[field.key] ?? ''}
                oninput={(e) => draft[field.key] = e.currentTarget.value}
                placeholder="—"
                class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums"
              />
            </label>
          {/each}
        </div>
      {/if}

      {#if tracksDifficulty}
        <div class="space-y-1.5">
          <span class="flex items-baseline justify-between gap-2">
            <span class="text-label text-content-subtle">{PARAMETER_LABELS.difficulty}</span>
            <span class="text-caption text-content-muted tabular-nums">{difficulty ?? '—'}</span>
          </span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={difficulty ?? 5}
            oninput={(e) => difficulty = Number(e.currentTarget.value)}
            class="w-full accent-[var(--color-primary)]"
          />
        </div>
      {/if}

      <label class="space-y-1.5 block">
        <span class="text-label text-content-subtle">Notes</span>
        <textarea
          bind:value={notes}
          rows="2"
          placeholder="How did it feel? Anything worth remembering?"
          class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors resize-none placeholder:text-content-subtle"
        ></textarea>
      </label>
    </div>

    <div class="sticky bottom-0 bg-surface/95 backdrop-blur-sm border-t border-border px-5 py-4 space-y-3">
      <div class="flex gap-2">
        {#if slot.prescribed}
          <button
            onclick={handleAsPrescribed}
            class="shrink-0 px-4 py-3 bg-surface-elevated/60 hover:bg-surface-elevated text-content-muted hover:text-content text-label font-bold rounded-control border border-border-strong/50 transition-all active:scale-[0.98]"
          >
            As prescribed
          </button>
        {/if}
        <button
          onclick={handleSave}
          class="flex-1 min-w-0 py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.98]"
        >
          Save &amp; continue
        </button>
      </div>
      <button
        onclick={onEditFull}
        class="w-full text-label text-content-subtle hover:text-primary transition-colors flex items-center justify-center gap-1.5"
      >
        Edit full details
        <Icon icon="ic:baseline-arrow-forward" class="text-sm" />
      </button>
    </div>
  </div>
</div>
