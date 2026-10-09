<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { keyboardAware } from '../../lib/ui/keyboardAware';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
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
  import { slotTypeName, planNote, logNote } from '../../lib/exerciseSlot';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import { isCustomParam, customIdOf, paramLabel } from '../../lib/exercise/valueDefs';
  import TargetHint from './TargetHint.svelte';
  import type { LastTime } from '../../lib/exercise/lastTime';
  import { valuesLine } from '../../lib/session/slotDetails';
  import RangeSlider from '../common/RangeSlider.svelte';
  import SetRowsEditor from './SetRowsEditor.svelte';
  import { perSetKeysFor, setCount, setRows, withSetRows, hasPerSet, type SetRow } from '../../lib/exercise/setRows';
  import type { PerSetKey } from '../../lib/types';
  import Icon from '@iconify/svelte';

  let { slot, seed: seedOverride = null, lastTime = null, saveLabel = 'Save & continue', onSave, onCancel, onEditFull }: {
    slot: ExerciseSlot;
    /** What was logged the last time this exercise was done - one tap copies it in. */
    lastTime?: LastTime | null;
    /**
     * Values to prefill instead of the slot's own - the interval timer
     * hands over the sets/reps it actually counted. Null for the normal
     * path, where the target is the right starting point.
     */
    seed?: ExerciseValues | null;
    /** The save button's words, for a caller where "continue" isn't what comes next. */
    saveLabel?: string;
    onSave: (values: ExerciseValues) => void;
    onCancel: () => void;
    /** The way out to the full form; without it the sheet has no such link. */
    onEditFull?: () => void;
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

  // --- Per set: one row per set for the numbers that differ (the type decides which) ---
  const typeDef = $derived(trainingState.exerciseTypes.find((t) => t.id === slot.typeId));
  const perSetKeys = $derived<PerSetKey[]>(perSetKeysFor(activeParams, typeDef?.perSetParameters));
  const perSetFields = $derived(fields.filter((f) => perSetKeys.includes(f.key as PerSetKey)));
  /** Rows are open: each set has its own numbers. Opens by itself when what was done already differs per set. */
  let perSetOpen = $state(false);
  /** The sets as the rows editor last reported them (stored units). */
  let rowsValue = $state<SetRow[]>([]);
  /** Bumped when the rows are (re)started, so the editor mounts fresh. */
  let rowsKey = $state(0);
  /** The sets as they stand: the rows when open, else the plain fields repeated `sets` times. */
  function currentRows(): SetRow[] {
    const n = Math.max(1, Math.round(numberOrUndefined('sets') ?? setCount(seed)));
    const plain: SetRow = {};
    for (const k of perSetKeys) { const v = numberOrUndefined(k); if (v !== undefined) plain[k] = k === 'weight' ? Math.round(toKg(v, trainingState.units.weight) * 100) / 100 : v; }
    return Array.from({ length: n }, () => ({ ...plain }));
  }
  function openPerSet() {
    rowsValue = hasPerSet(seed) ? setRows(seed, perSetKeys) : currentRows();
    rowsKey++;
    perSetOpen = true;
  }

  /** The athlete's own value types this exercise tracks, typed as text per def id ("" = not set). */
  const customFields = $derived(
    activeParams.filter(isCustomParam).flatMap((p) => {
      const def = trainingState.valueDefs.find((d) => d.id === customIdOf(p));
      return def ? [def] : [];
    }),
  );
  let customDraft = $state<Record<string, string>>({});

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
    customDraft = Object.fromEntries(Object.entries(values.custom ?? {}).map(([k, x]) => [k, String(x)]));
    // The plan note is shown above the field, never copied into it.
    // A seed built from the plan (a finished timer or circuit) carries the plan's note along: that is not how it went.
    const seeded = (values.notes ?? '').trim();
    notes = seedOverride ? (seeded && seeded !== planNote(slot) ? seeded : '') : logNote(slot);
    difficulty = typeof values.difficulty === 'number' ? values.difficulty : undefined;
    // Already different per set (a set timer, a circuit, last time's log): show them as they are.
    if (perSetKeys.length > 0 && hasPerSet(values)) {
      rowsValue = setRows(values, perSetKeys);
      rowsKey++;
      perSetOpen = true;
    } else perSetOpen = false;
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
      if (perSetOpen && perSetKeys.includes(field.key as PerSetKey)) continue; // the rows hold these
      const raw = rawValue(field.key);
      if (raw === '') {
        if (!Array.isArray(values[field.key])) delete values[field.key]; // a per-set list this sheet can't show stays
      } else {
        const n = Number(raw);
        // Weight is typed in the chosen unit and stored in kg.
        if (Number.isFinite(n)) (values[field.key] as number) = field.key === 'weight' ? Math.round(toKg(n, trainingState.units.weight) * 100) / 100 : n;
      }
    }
    const custom: Record<string, number | string> = { ...(seed.custom ?? {}) };
    for (const def of customFields) {
      const raw = (customDraft[def.id] ?? '').trim();
      const num = Number(raw);
      if (raw === '' || (def.kind === 'number' && !Number.isFinite(num))) delete custom[def.id];
      else custom[def.id] = def.kind === 'number' ? num : raw;
    }
    if (Object.keys(custom).length) values.custom = custom;
    else delete values.custom;
    values.notes = notes.trim() || undefined;
    if (tracksDifficulty && difficulty !== undefined) values.difficulty = difficulty;
    if (perSetOpen) return withSetRows(values, rowsValue, perSetKeys);
    return values;
  }

  function handleSave() {
    onSave(collect());
  }

  /** One tap for the common case: it went exactly as prescribed. */
  function handleAsPrescribed() {
    const values = { ...(slot.prescribed ?? seed) };
    delete values.notes;
    onSave(values);
  }

  function numberOrUndefined(key: string): number | undefined {
    const raw = rawValue(key);
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * −/+ beside the numbers changed most mid-workout, so a one-off
   * adjustment needs no keyboard. Weight moves by 2.5 kg (5 lb).
   */
  const STEPS: Partial<Record<keyof ExerciseValues, number>> = { sets: 1, reps: 1, duration: 5 };
  function stepOf(key: keyof ExerciseValues): number | undefined {
    if (key === 'weight') return trainingState.units.weight === 'lb' ? 5 : 2.5;
    return STEPS[key];
  }
  function bump(key: keyof ExerciseValues, dir: 1 | -1) {
    const step = stepOf(key)!;
    const current = numberOrUndefined(key as string) ?? 0;
    const next = Math.max(0, Math.round((current + dir * step) * 100) / 100);
    draft[key as string] = String(next);
  }

  /** Fills the fields with what was logged last time (the fields this sheet shows, and difficulty). */
  function useLastTime() {
    if (!lastTime) return;
    const next = { ...draft };
    for (const field of fields) {
      const value = lastTime.values[field.key];
      if (typeof value === 'number') next[field.key] = String(field.key === 'weight' ? shownWeight(value) : value);
    }
    draft = next;
    const lastCustom = lastTime.values.custom;
    if (lastCustom) customDraft = { ...customDraft, ...Object.fromEntries(customFields.filter((d) => lastCustom[d.id] !== undefined).map((d) => [d.id, String(lastCustom[d.id])])) };
    if (tracksDifficulty && typeof lastTime.values.difficulty === 'number') difficulty = lastTime.values.difficulty;
  }
  const lastLine = $derived(lastTime ? valuesLine(lastTime.values) : '');

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onCancel());
</script>

<div
  class="fixed inset-0 pb-safe z-[120] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
>
  <div class="group bg-surface w-full max-w-lg short:max-w-2xl rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[88vh] short:max-h-[96vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onCancel()} use:keyboardAware>
    <div class="sticky top-0 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 short:py-2 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">What you did</p>
        <h3 class="text-title text-content truncate">{slotTypeName(slot, trainingState.exerciseTypes)}</h3>
      </div>
      <button onclick={onCancel} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Cancel">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="p-5 short:py-3 space-y-4 short:space-y-3">
      {#if lastTime && lastLine}
        <button type="button" onclick={useLastTime} class="w-full flex items-center gap-2 px-3 py-2 rounded-control bg-surface-elevated/40 border border-border-strong/40 text-left hover:border-primary/40 transition-colors">
          <Icon icon="ic:baseline-history" class="text-base text-content-subtle shrink-0" />
          <span class="min-w-0 flex-1 text-caption text-content-subtle truncate">
            Last time <span class="tabular-nums">{new Date(lastTime.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>: <span class="text-content font-bold">{lastLine}</span>
          </span>
          <span class="shrink-0 text-caption font-bold text-primary">Use</span>
        </button>
      {/if}
      {#if fields.length === 0 && customFields.length === 0}
        <p class="text-caption text-content-subtle italic">
          This exercise tracks no numeric values &mdash; log it as done, or open the full editor to change what it tracks.
        </p>
      {:else}
        <div class="grid grid-cols-2 short:grid-cols-3 gap-3">
          {#each fields.filter((f) => !(perSetOpen && (perSetKeys.includes(f.key as PerSetKey) || f.key === 'sets'))) as field (field.key)}
            <label class="space-y-1.5 min-w-0">
              <span class="flex items-baseline justify-between gap-2">
                <span class="text-label text-content-subtle truncate">{paramLabel(field.param, trainingState.valueDefs)}</span>
                <TargetHint
                  prescribed={field.key === 'weight' && typeof target.weight === 'number' ? shownWeight(target.weight) : target[field.key] as number | undefined}
                  current={numberOrUndefined(field.key)}
                  unit={field.key === 'weight' ? trainingState.units.weight : field.unit}
                />
              </span>
              <span class="flex items-stretch gap-1 max-w-[12rem]">
                {#if stepOf(field.key)}
                  <button type="button" onclick={() => bump(field.key, -1)} class="shrink-0 w-10 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted hover:text-content active:scale-95 transition-all grid place-items-center" aria-label="Less {paramLabel(field.param, trainingState.valueDefs)}">
                    <Icon icon="ic:baseline-remove" class="text-lg" />
                  </button>
                {/if}
                <input
                  type="number"
                  inputmode="decimal"
                  step={field.step ?? 1}
                  value={draft[field.key] ?? ''}
                  oninput={(e) => draft[field.key] = e.currentTarget.value}
                  placeholder="—"
                  class="w-full min-w-0 px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums {stepOf(field.key) ? 'text-center px-1' : ''}"
                />
                {#if stepOf(field.key)}
                  <button type="button" onclick={() => bump(field.key, 1)} class="shrink-0 w-10 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted hover:text-content active:scale-95 transition-all grid place-items-center" aria-label="More {paramLabel(field.param, trainingState.valueDefs)}">
                    <Icon icon="ic:baseline-add" class="text-lg" />
                  </button>
                {/if}
              </span>
            </label>
          {/each}
        </div>
      {/if}
      {#if perSetKeys.length > 0}
        {#if !perSetOpen}
          <button type="button" onclick={openPerSet} class="w-full flex items-center justify-center gap-1.5 py-2 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors">
            <Icon icon="ic:baseline-format-list-numbered" class="text-base" /> Per set
            <span class="font-normal text-caption">({perSetFields.map((f) => paramLabel(f.param, trainingState.valueDefs)).join(', ')} set by set)</span>
          </button>
        {:else}
          {#key rowsKey}
            <SetRowsEditor keys={perSetFields.map((f) => f.key as PerSetKey)} rows={rowsValue} onchange={(r) => (rowsValue = r)} />
          {/key}
        {/if}
      {/if}
      {#if customFields.length > 0}
        <div class="grid grid-cols-2 gap-3">
          {#each customFields as def (def.id)}
            <label class="space-y-1.5 min-w-0">
              <span class="flex items-baseline justify-between gap-2">
                <span class="text-label text-content-subtle truncate">{def.name}</span>
                {#if def.kind === 'number'}
                  <TargetHint prescribed={typeof target.custom?.[def.id] === 'number' ? (target.custom[def.id] as number) : undefined} current={customDraft[def.id] === undefined || customDraft[def.id] === '' ? undefined : Number(customDraft[def.id])} unit={def.unit ?? ''} />
                {/if}
              </span>
              {#if def.kind === 'number'}
                <span class="flex items-stretch gap-2 max-w-[12rem]">
                  <input type="number" inputmode="decimal" step="any" value={customDraft[def.id] ?? ''} oninput={(e) => customDraft[def.id] = e.currentTarget.value} placeholder="—" class="w-full min-w-0 px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors tabular-nums" />
                  {#if def.unit}<span class="self-center text-caption text-content-subtle shrink-0">{def.unit}</span>{/if}
                </span>
              {:else}
                <select value={customDraft[def.id] ?? ''} onchange={(e) => customDraft[def.id] = e.currentTarget.value} class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none appearance-none cursor-pointer">
                  <option value="">—</option>
                  {#each def.options ?? [] as option}<option value={option}>{option}</option>{/each}
                </select>
              {/if}
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
          <RangeSlider value={difficulty ?? 5} label={PARAMETER_LABELS.difficulty} onchange={(v) => difficulty = v} />
        </div>
      {/if}

      <label class="space-y-1.5 block">
        <span class="text-label text-content-subtle">How it went</span>
        {#if planNote(slot)}<span class="block text-caption text-content-subtle italic whitespace-pre-wrap break-words">Plan: {planNote(slot)}</span>{/if}
        <textarea
          bind:value={notes}
          rows="2"
          placeholder="How did it feel? Anything worth remembering?"
          class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 transition-colors resize-none placeholder:text-content-subtle"
        ></textarea>
      </label>
    </div>

    <div class="sticky group-data-[typing]:static bottom-0 bg-surface/95 backdrop-blur-sm border-t border-border px-5 py-4 short:py-2 space-y-3 short:space-y-0 short:flex short:items-center short:gap-3">
      <div class="flex gap-2 short:flex-1">
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
          {saveLabel}
        </button>
      </div>
      {#if onEditFull}
        <button
          onclick={onEditFull}
          class="w-full short:w-auto short:shrink-0 whitespace-nowrap text-label text-content-subtle hover:text-primary transition-colors flex items-center justify-center gap-1.5"
        >
          Edit full details
          <Icon icon="ic:baseline-arrow-forward" class="text-sm" />
        </button>
      {/if}
    </div>
  </div>
</div>
