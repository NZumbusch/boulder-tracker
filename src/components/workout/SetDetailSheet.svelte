<script lang="ts">
  /**
   * One set's own numbers - weight, hang time, board angle... - opened from the
   * running circuit, behind a button so the run itself stays reps and a Done.
   * Starts from what the set would carry on from (the last entry, else the plan).
   */
  import Icon from '@iconify/svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { displayWeight, toKg } from '../../lib/units';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import type { PerSetKey } from '../../lib/types';
  import type { SetRow } from '../../lib/exercise/setRows';

  let { title, subtitle = '', keys, initial, onSave, onCancel }: {
    title: string;
    subtitle?: string;
    keys: PerSetKey[];
    initial: SetRow;
    onSave: (row: SetRow) => void;
    onCancel: () => void;
  } = $props();

  const UNITS: Partial<Record<PerSetKey, string>> = { timeOn: 's', bodyweightPercent: '%', maxWeightPercent: '%', boardAngle: '°', holdSize: 'mm', distance: 'km' };
  const isWeight = (k: PerSetKey) => k === 'weight';
  const label = (k: PerSetKey) => PARAMETER_LABELS[k as keyof typeof PARAMETER_LABELS] ?? k;
  const shown = (k: PerSetKey, n: number | undefined) => (n === undefined ? '' : String(isWeight(k) ? Math.round(displayWeight(n, trainingState.units.weight) * 10) / 10 : n));

  const GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 short:grid-cols-3', 4: 'grid-cols-2' };
  const cell = (i: number) => (keys.length % 2 === 1 && keys.length > 1 && i === keys.length - 1 ? 'col-span-2 short:col-span-1' : '');

  let draft = $state<Record<string, string>>(Object.fromEntries(untrackKeys().map((k) => [k, shown(k, initial[k])])));
  function untrackKeys() { return keys; }

  const step = (k: PerSetKey) => (isWeight(k) ? (trainingState.units.weight === 'lb' ? 5 : 2.5) : k === 'boardAngle' ? 5 : 1);
  function bump(k: PerSetKey, dir: 1 | -1) {
    const cur = Number(draft[k]);
    draft[k] = String(Math.max(0, Math.round(((Number.isFinite(cur) ? cur : 0) + dir * step(k)) * 100) / 100));
  }
  function save() {
    const row: SetRow = {};
    for (const k of keys) {
      const raw = (draft[k] ?? '').trim();
      const n = Number(raw);
      if (raw !== '' && Number.isFinite(n) && n >= 0) row[k] = isWeight(k) ? Math.round(toKg(n, trainingState.units.weight) * 100) / 100 : n;
    }
    onSave(row);
  }
  backWhile(() => true, () => onCancel());
</script>

<div class="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
  <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[88vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200">
    <div class="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">{subtitle}</p>
        <h3 class="text-title text-content truncate">{title}</h3>
      </div>
      <button onclick={onCancel} class="p-2 -mr-2 text-content-subtle hover:text-content" aria-label="Cancel"><Icon icon="ic:baseline-close" class="text-xl" /></button>
    </div>
    <div class="p-5 grid {GRID[Math.min(keys.length, 4)] ?? 'grid-cols-2'} gap-3">
      {#each keys as k, ki (k)}
        <label class="space-y-1.5 min-w-0 {cell(ki)}">
          <span class="block text-label text-content-subtle truncate">{label(k)}{isWeight(k) ? ` (${trainingState.units.weight})` : UNITS[k] ? ` (${UNITS[k]})` : ''}</span>
          <span class="flex items-stretch gap-1 max-w-[12rem]">
            <button type="button" onclick={() => bump(k, -1)} class="shrink-0 w-10 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted active:scale-95 grid place-items-center" aria-label="Less {label(k)}"><Icon icon="ic:baseline-remove" class="text-lg" /></button>
            <input type="number" inputmode="decimal" step="any" value={draft[k] ?? ''} oninput={(e) => (draft[k] = e.currentTarget.value)} placeholder="—" class="w-full min-w-0 px-1 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm text-center outline-none focus:border-primary/50 tabular-nums" />
            <button type="button" onclick={() => bump(k, 1)} class="shrink-0 w-10 rounded-control bg-surface-elevated/60 border border-border-strong/50 text-content-muted active:scale-95 grid place-items-center" aria-label="More {label(k)}"><Icon icon="ic:baseline-add" class="text-lg" /></button>
          </span>
        </label>
      {/each}
    </div>
    <div class="px-5 pb-5">
      <button onclick={save} class="w-full py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.98]">Save</button>
    </div>
  </div>
</div>
