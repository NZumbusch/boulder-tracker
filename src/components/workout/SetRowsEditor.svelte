<script lang="ts">
  /**
   * One row per set for the numbers that differ set to set (weight, reps, hang
   * time, angle...). Shared by the log sheet and the exercise form. Rows are
   * in stored units (weight in kg); the boxes show the chosen weight unit.
   * A number typed into a set carries on to the later sets that still had
   * the same one, so one entry fills the rest.
   */
  import Icon from '@iconify/svelte';
  import { showUndo } from '../../lib/toast.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { displayWeight, toKg } from '../../lib/units';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import type { PerSetKey } from '../../lib/types';
  import type { SetRow } from '../../lib/exercise/setRows';

  let { keys, rows, onchange }: {
    keys: PerSetKey[];
    /** The sets to start from. Only read once; changes come back through `onchange`. */
    rows: SetRow[];
    onchange: (rows: SetRow[]) => void;
  } = $props();

  const UNITS: Partial<Record<PerSetKey, string>> = { timeOn: 's', bodyweightPercent: '%', maxWeightPercent: '%', boardAngle: '°', holdSize: 'mm', distance: 'km' };
  const isWeight = (k: PerSetKey) => k === 'weight';
  const label = (k: PerSetKey) => PARAMETER_LABELS[k as keyof typeof PARAMETER_LABELS] ?? k;
  const shown = (k: PerSetKey, n: number | undefined) => (n === undefined ? '' : String(isWeight(k) ? Math.round(displayWeight(n, trainingState.units.weight) * 10) / 10 : n));
  const stepOf = (k: PerSetKey) => (isWeight(k) ? (trainingState.units.weight === 'lb' ? 5 : 2.5) : k === 'boardAngle' ? 5 : 1);
  const stepped = (k: PerSetKey) => k === 'reps' || k === 'weight';

  /** A field with steppers needs its card's width (two 44 px buttons beside the box), so those cards use one column. */
  const stackFields = $derived(keys.some(stepped));
  /** One field fills the row; two sit side by side; an odd one out spans the width; landscape spreads up to three. */
  const GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 short:grid-cols-3', 4: 'grid-cols-2' };
  const cell = (_i: number) => ''; // an odd one out keeps its place in the column grid, same width as the rest

  let draft = $state<Record<string, string>[]>(
    // svelte-ignore state_referenced_locally
    rows.map((r) => Object.fromEntries(keys.map((k) => [k, shown(k, r[k])]))),
  );

  function emit() {
    onchange(draft.map((d) => {
      const row: SetRow = {};
      for (const k of keys) {
        const raw = (d[k] ?? '').trim();
        const n = Number(raw);
        if (raw !== '' && Number.isFinite(n) && n >= 0) row[k] = isWeight(k) ? Math.round(toKg(n, trainingState.units.weight) * 100) / 100 : n;
      }
      return row;
    }));
  }
  function edit(i: number, k: PerSetKey, value: string) {
    const before = draft[i]?.[k] ?? '';
    for (let j = i + 1; j < draft.length; j++) {
      if ((draft[j][k] ?? '') === before) draft[j][k] = value;
      else break;
    }
    draft[i][k] = value;
    emit();
  }
  function bump(i: number, k: PerSetKey, dir: 1 | -1) {
    const cur = Number(draft[i][k]);
    edit(i, k, String(Math.max(0, Math.round(((Number.isFinite(cur) ? cur : 0) + dir * stepOf(k)) * 100) / 100)));
  }
  function add() {
    draft = [...draft, { ...(draft[draft.length - 1] ?? Object.fromEntries(keys.map((k) => [k, '']))) }];
    emit();
  }
  function remove(i: number) {
    if (draft.length <= 1) return;
    const gone = $state.snapshot(draft[i]) as Record<string, string>;
    draft = draft.filter((_, j) => j !== i);
    emit();
    showUndo(`Set ${i + 1} removed`, () => {
      const next = [...draft];
      next.splice(Math.min(i, next.length), 0, gone);
      draft = next;
      emit();
    });
  }
</script>

<div class="space-y-2">
  <p class="text-label text-content-subtle">Set by set</p>
  <p class="text-caption text-content-subtle">A number typed in a set carries on to the later sets that had the same one.</p>
  {#if keys.length === 1}
    <!-- One number per set: a plain list, the set name beside its box. -->
    {@const k = keys[0]}
    <div class="rounded-control border border-border divide-y divide-border bg-surface-elevated/30">
      {#each draft as row, i (i)}
        <div class="flex items-center gap-2 px-2.5 py-1">
          <span class="w-11 shrink-0 text-caption font-bold text-content-muted">Set {i + 1}</span>
          <span class="flex-1 min-w-0 max-w-[14rem] flex items-stretch gap-1">
            {#if stepped(k)}
              <button type="button" onclick={() => bump(i, k, -1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted grid place-items-center active:scale-95" aria-label="Less {label(k)}, set {i + 1}"><Icon icon="ic:baseline-remove" class="text-lg" /></button>
            {/if}
            <input type="number" inputmode="decimal" step="any" value={row[k] ?? ''} oninput={(e) => edit(i, k, e.currentTarget.value)} placeholder="—" aria-label="{label(k)}, set {i + 1}" enterkeyhint="next" class="field min-w-0 px-2 tabular-nums {stepped(k) ? 'text-center' : ''}" />
            {#if stepped(k)}
              <button type="button" onclick={() => bump(i, k, 1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted grid place-items-center active:scale-95" aria-label="More {label(k)}, set {i + 1}"><Icon icon="ic:baseline-add" class="text-lg" /></button>
            {/if}
          </span>
          <span class="shrink-0 w-8 text-caption text-content-subtle">{isWeight(k) ? trainingState.units.weight : UNITS[k] ?? ''}</span>
          {#if draft.length > 1}
            <button type="button" onclick={() => remove(i)} class="btn-icon shrink-0 hover:text-danger" aria-label="Remove set {i + 1}"><Icon icon="ic:baseline-close" class="text-xl" /></button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <!-- Several numbers per set: a card per set (two side by side in landscape). -->
    <div class="grid grid-cols-1 short:grid-cols-2 gap-2">
      {#each draft as row, i (i)}
        <div class="rounded-control border border-border bg-surface-elevated/30 p-2 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-caption font-bold text-content-muted">Set {i + 1}</span>
            {#if draft.length > 1}
              <button type="button" onclick={() => remove(i)} class="btn-icon -my-2 -mr-2 hover:text-danger" aria-label="Remove set {i + 1}"><Icon icon="ic:baseline-close" class="text-xl" /></button>
            {/if}
          </div>
          <div class="grid {stackFields ? 'grid-cols-1 short:grid-cols-2' : (GRID[Math.min(keys.length, 4)] ?? 'grid-cols-2')} gap-2">
            {#each keys as k, ki (k)}
              <label class="min-w-0 block {cell(ki)}">
                <span class="block text-caption text-content-subtle truncate mb-0.5">{label(k)}{isWeight(k) ? ` (${trainingState.units.weight})` : UNITS[k] ? ` (${UNITS[k]})` : ''}</span>
                <span class="flex items-stretch gap-1">
                  {#if stepped(k)}
                    <button type="button" onclick={() => bump(i, k, -1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted grid place-items-center active:scale-95" aria-label="Less {label(k)}, set {i + 1}"><Icon icon="ic:baseline-remove" class="text-lg" /></button>
                  {/if}
                  <input type="number" inputmode="decimal" step="any" value={row[k] ?? ''} oninput={(e) => edit(i, k, e.currentTarget.value)} placeholder="—" aria-label="{label(k)}, set {i + 1}" enterkeyhint="next" class="field min-w-0 px-2 tabular-nums {stepped(k) ? 'text-center' : ''}" />
                  {#if stepped(k)}
                    <button type="button" onclick={() => bump(i, k, 1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted grid place-items-center active:scale-95" aria-label="More {label(k)}, set {i + 1}"><Icon icon="ic:baseline-add" class="text-lg" /></button>
                  {/if}
                </span>
              </label>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" onclick={add} class="btn btn-secondary w-full text-content-muted"><Icon icon="ic:baseline-add" class="text-lg" /> Add a set</button>
</div>
