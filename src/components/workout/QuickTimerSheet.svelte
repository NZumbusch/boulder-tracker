<script lang="ts">
  /**
   * The Timer sheet: a timer made up on the spot, or one of the saved
   * ones. Five kinds - intervals (a repeater), sets (counted, with rests),
   * a pacer (a problem every N minutes), a countdown and a stopwatch -
   * each a few numbers. Starting opens the runner, ready but not running.
   * Last-used numbers are remembered per kind.
   */
  import { untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { showUndo } from '../../lib/toast.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { closeQuickTimerSheet, startQuickRun } from '../../lib/timer/quickTimer.svelte';
  import { cleanPresetValues, describePreset, type PresetVariant } from '../../lib/timer/presets';
  import type { ExerciseValues } from '../../lib/types';

  type Kind = 'intervals' | 'sets' | 'pacer' | 'countdown' | 'stopwatch';
  const KINDS: { id: Kind; label: string }[] = [
    { id: 'intervals', label: 'Intervals' },
    { id: 'sets', label: 'Sets' },
    { id: 'pacer', label: 'Pacer' },
    { id: 'countdown', label: 'Countdown' },
    { id: 'stopwatch', label: 'Stopwatch' },
  ];
  const DEFAULTS: Record<Kind, Record<string, number>> = {
    intervals: { sets: 5, reps: 6, on: 7, off: 3, rest: 180 },
    sets: { sets: 4, reps: 8, rest: 120 },
    pacer: { minutes: 5, problems: 12 },
    countdown: { min: 1, sec: 0 },
    stopwatch: {},
  };
  const KEY = 'boulder_tracker_quick_timer';
  function load(): { kind: Kind; fields: Record<Kind, Record<string, number>> } {
    const fields = JSON.parse(JSON.stringify(DEFAULTS)) as Record<Kind, Record<string, number>>;
    let kind: Kind = 'intervals';
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && KINDS.some((k) => k.id === saved.kind)) kind = saved.kind;
      for (const k of KINDS) for (const [name, v] of Object.entries(saved?.fields?.[k.id] ?? {})) if (typeof v === 'number' && name in fields[k.id]) fields[k.id][name] = v;
    } catch { /* first use, or storage unavailable */ }
    return { kind, fields };
  }
  const start = untrack(load);
  let kind = $state<Kind>(start.kind);
  let fields = $state(start.fields);
  const f = $derived(fields[kind]);

  /** The numbers behind the form, as the run reads them. */
  function valuesFor(k: Kind): { values: ExerciseValues; variant: PresetVariant; title: string; leadIn: number } {
    const v = fields[k];
    const lead = trainingState.tunable('timer.leadIn');
    switch (k) {
      case 'intervals': return { variant: 'timed', title: 'Intervals', leadIn: lead, values: { sets: v.sets, reps: v.reps, timeOn: v.on, timeOff: v.off, timeBetweenSets: v.rest } };
      case 'sets': return { variant: 'counted', title: 'Sets', leadIn: 0, values: { sets: v.sets, reps: v.reps, timeBetweenSets: v.rest } };
      case 'pacer': return { variant: 'pacer', title: 'Pacer', leadIn: Math.min(lead, 5), values: { cadence: v.minutes, sets: v.problems } };
      case 'countdown': return { variant: 'timed', title: 'Countdown', leadIn: 0, values: { sets: 1, reps: 1, timeOn: Math.max(1, v.min * 60 + v.sec) } };
      case 'stopwatch': return { variant: 'counted', title: 'Stopwatch', leadIn: 0, values: { sets: 1 } };
    }
  }

  function go() {
    try { localStorage.setItem(KEY, JSON.stringify({ kind, fields: $state.snapshot(fields) })); } catch { /* not remembered */ }
    const r = valuesFor(kind);
    startQuickRun({ title: r.title, variant: r.variant, values: cleanForRun(r.values), leadIn: r.leadIn });
  }
  /** The numbers within the limits the engine and presets share. */
  const cleanForRun = (v: ExerciseValues): ExerciseValues => ({ ...cleanPresetValues(v) });

  const presets = $derived(trainingState.timerPresets);
  function startPreset(id: string) {
    const p = presets.find((x) => x.id === id);
    if (p) startQuickRun({ title: p.name, variant: p.variant, values: p.values, leadIn: p.leadIn });
  }
  let managing = $state(false);

  /** A preset is removed at once, with an Undo that puts it back. */
  function removePreset(id: string) {
    const gone = presets.find((x) => x.id === id);
    if (!gone) return;
    trainingState.deleteTimerPreset(id);
    showUndo(`"${gone.name}" deleted`, () => trainingState.saveTimerPreset($state.snapshot(gone) as typeof gone));
  }

  /** Said out loud when a typed number was raised to its minimum, rather than changing it silently. */
  let notice = $state('');
  function setField(name: string, raw: string, min: number, label: string) {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    notice = n < min ? `${label} is at least ${min}.` : '';
    fields[kind][name] = Math.max(min, n);
  }
  const INPUTS: Record<Kind, { name: string; label: string; unit?: string; min: number; step: number }[]> = {
    intervals: [
      { name: 'sets', label: 'Sets', min: 1, step: 1 }, { name: 'reps', label: 'Reps', min: 1, step: 1 }, { name: 'on', label: 'On', unit: 's', min: 1, step: 1 },
      { name: 'off', label: 'Off', unit: 's', min: 0, step: 1 }, { name: 'rest', label: 'Between sets', unit: 's', min: 0, step: 5 },
    ],
    sets: [{ name: 'sets', label: 'Sets', min: 1, step: 1 }, { name: 'reps', label: 'Reps', min: 1, step: 1 }, { name: 'rest', label: 'Rest', unit: 's', min: 0, step: 5 }],
    pacer: [{ name: 'minutes', label: 'Minutes each', unit: 'min', min: 0.5, step: 0.5 }, { name: 'problems', label: 'Problems', min: 1, step: 1 }],
    countdown: [{ name: 'min', label: 'Minutes', min: 0, step: 1 }, { name: 'sec', label: 'Seconds', min: 0, step: 5 }],
    stopwatch: [],
  };
  const HINT: Record<Kind, string> = {
    intervals: 'Hang, rest, hang … then a longer rest between sets.',
    sets: 'Do a set at your own pace, tap Done, rest on the clock.',
    pacer: 'A cue every few minutes - a new problem each time. Pause, skip ahead or change it while it runs.',
    countdown: 'One timer, counted down.',
    stopwatch: 'Counts up until you tap Done.',
  };
</script>

<Sheet title="Timer" level="nested" onClose={closeQuickTimerSheet}>
  {#if presets.length > 0}
    <div class="space-y-1.5">
      <div class="flex items-center justify-between px-1">
        <p class="text-caption uppercase text-content-subtle">Saved</p>
        <button onclick={() => (managing = !managing)} class="btn-quiet px-3 -mr-3 text-label font-bold text-primary">{managing ? 'Done' : 'Edit'}</button>
      </div>
      <div class="divide-y divide-border">
        {#each presets as p (p.id)}
          <div class="flex items-center gap-2 py-1">
            <button onclick={() => startPreset(p.id)} class="min-w-0 flex-1 min-h-11 flex flex-col justify-center text-left" aria-label="Start {p.name}">
              <span class="block text-body text-content truncate">{p.name}</span>
              <span class="block text-caption text-content-subtle truncate">{describePreset(p)}</span>
            </button>
            {#if managing}
              <button onclick={() => removePreset(p.id)} class="btn-icon hover:text-danger" aria-label="Delete {p.name}"><Icon icon="ic:baseline-delete-outline" class="text-xl" /></button>
            {:else}
              <button onclick={() => startPreset(p.id)} class="btn-icon text-primary" aria-label="Start {p.name}"><Icon icon="ic:baseline-play-circle" class="text-2xl" /></button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Kind of timer">
    {#each KINDS as k (k.id)}
      <button role="tab" aria-selected={kind === k.id} onclick={() => { kind = k.id; notice = ''; }}
        class="px-3 min-h-11 rounded-full text-label font-bold border transition-colors {kind === k.id ? 'bg-primary text-on-primary border-transparent' : 'border-border-strong text-content-muted hover:text-content'}">{k.label}</button>
    {/each}
  </div>
  <p class="text-caption text-content-subtle">{HINT[kind]}</p>

  {#if INPUTS[kind].length > 0}
    <div class="grid grid-cols-3 gap-2">
      {#each INPUTS[kind] as input (input.name)}
        <label class="space-y-1 min-w-0">
          <span class="text-caption text-content-subtle truncate block">{input.label}{input.unit ? ` (${input.unit})` : ''}</span>
          <input type="number" inputmode={input.step < 1 ? 'decimal' : 'numeric'} enterkeyhint="done" min={input.min} step={input.step} value={f[input.name]} oninput={(e) => setField(input.name, e.currentTarget.value, input.min, input.label)}
            class="field px-2.5 tabular-nums" />
        </label>
      {/each}
    </div>
    {#if notice}<p class="text-caption text-warning" role="status">{notice}</p>{/if}
  {/if}

  {#snippet footer()}
    <button onclick={go} class="btn btn-primary flex-1 py-4">
      <Icon icon="ic:baseline-play-arrow" class="text-xl" /> Open timer
    </button>
  {/snippet}
</Sheet>
