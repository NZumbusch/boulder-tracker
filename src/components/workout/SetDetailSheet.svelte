<script lang="ts">
  /**
   * One set's own numbers - weight, hang time, board angle... - opened from the
   * running circuit, behind a button so the run itself stays reps and a Done.
   * Starts from what the set would carry on from (the last entry, else the plan).
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
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

  const GRID: Record<number, string> = { 1: 'grid-cols-2', 2: 'grid-cols-2', 3: 'grid-cols-2 short:grid-cols-3', 4: 'grid-cols-2' };
  const cell = (_i: number) => ''; // an odd one out keeps its place in the column grid, same width as the rest

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
</script>

<Sheet {title} subtitle={subtitle || undefined} level="nested" onClose={onCancel}>
  <div class="grid {GRID[Math.min(keys.length, 4)] ?? 'grid-cols-2'} gap-3">
    {#each keys as k, ki (k)}
      <label class="space-y-1.5 min-w-0 {cell(ki)}">
        <span class="block text-label text-content-subtle truncate">{label(k)}{isWeight(k) ? ` (${trainingState.units.weight})` : UNITS[k] ? ` (${UNITS[k]})` : ''}</span>
        <span class="flex items-stretch gap-1">
          <button type="button" onclick={() => bump(k, -1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted active:scale-95 grid place-items-center" aria-label="Less {label(k)}"><Icon icon="ic:baseline-remove" class="text-lg" /></button>
          <input type="number" inputmode="decimal" enterkeyhint="done" step="any" value={draft[k] ?? ''} oninput={(e) => (draft[k] = e.currentTarget.value)} placeholder="—" class="field min-w-0 px-1 text-center tabular-nums" />
          <button type="button" onclick={() => bump(k, 1)} class="shrink-0 w-11 min-h-11 rounded-control bg-surface-elevated/60 text-content-muted active:scale-95 grid place-items-center" aria-label="More {label(k)}"><Icon icon="ic:baseline-add" class="text-lg" /></button>
        </span>
      </label>
    {/each}
  </div>
  {#snippet footer()}
    <button onclick={save} class="btn btn-primary flex-1">Save</button>
    <button onclick={onCancel} class="btn btn-ghost">Cancel</button>
  {/snippet}
</Sheet>
