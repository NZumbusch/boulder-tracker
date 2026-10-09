<script lang="ts">
  /**
   * One row per set for the numbers that differ set to set (weight, reps, hang
   * time, angle...). Shared by the log sheet and the exercise form. Rows are
   * in stored units (weight in kg); the boxes show the chosen weight unit.
   * A number typed into a set carries on to the later sets that still had
   * the same one, so one entry fills the rest.
   */
  import Icon from '@iconify/svelte';
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
    draft = draft.filter((_, j) => j !== i);
    emit();
  }
</script>

<div class="space-y-2">
  <p class="text-label text-content-subtle">Set by set <span class="text-caption">&mdash; a number typed in a set carries on to the later sets that had the same one</span></p>
  {#each draft as row, i (i)}
    <div class="rounded-control border border-border bg-surface-elevated/30 p-2 space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-caption font-bold text-content-muted">Set {i + 1}</span>
        {#if draft.length > 1}
          <button type="button" onclick={() => remove(i)} class="p-1 text-content-subtle hover:text-danger transition-colors" aria-label="Remove set {i + 1}"><Icon icon="ic:baseline-close" class="text-sm" /></button>
        {/if}
      </div>
      <div class="grid grid-cols-2 gap-2">
        {#each keys as k (k)}
          <label class="min-w-0 block">
            <span class="block text-caption text-content-subtle truncate mb-0.5">{label(k)}{isWeight(k) ? ` (${trainingState.units.weight})` : UNITS[k] ? ` (${UNITS[k]})` : ''}</span>
            <span class="flex items-stretch gap-1">
              {#if stepped(k)}
                <button type="button" onclick={() => bump(i, k, -1)} class="shrink-0 w-8 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted grid place-items-center active:scale-95" aria-label="Less {label(k)}"><Icon icon="ic:baseline-remove" class="text-base" /></button>
              {/if}
              <input type="number" inputmode="decimal" step="any" value={row[k] ?? ''} oninput={(e) => edit(i, k, e.currentTarget.value)} placeholder="—" class="w-full min-w-0 px-2 py-2 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 tabular-nums {stepped(k) ? 'text-center' : ''}" />
              {#if stepped(k)}
                <button type="button" onclick={() => bump(i, k, 1)} class="shrink-0 w-8 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted grid place-items-center active:scale-95" aria-label="More {label(k)}"><Icon icon="ic:baseline-add" class="text-base" /></button>
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </div>
  {/each}
  <button type="button" onclick={add} class="w-full py-2 rounded-control border border-dashed border-border-strong text-label font-bold text-content-subtle hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"><Icon icon="ic:baseline-add" class="text-base" /> Add a set</button>
</div>
