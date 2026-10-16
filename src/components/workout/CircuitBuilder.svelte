<script lang="ts">
  /**
   * Builds (or adjusts) a circuit before it goes into a session or a plan. Deliberately plainer than the exercise form:
   * a circuit has rounds; each exercise has ONE amount - reps or seconds - and is done once per round, so there are no sets
   * here. The two rests are named for what they are. A saved circuit arrives as a copy to adjust; nothing is saved
   * unless "Save to my circuits" is on. Used from the live session and from the workout editor (`CircuitPickerSheet` first).
   */
  import { untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { circuitAsWorkout } from '../../lib/exercise/circuits';
  import { groupMinutes } from '../../lib/exercise/groups';
  import { formatMinutes } from '../../lib/session/formatSession';
  import { amountOf, blankCircuit, circuitLine, draftFromSaved, slotForType, slotWithAmount, tracksWeight, weightOf, withWeight } from '../../lib/exercise/circuitDraft';
  import { displayWeight, formatWeight, toKg } from '../../lib/units';
  import type { Circuit, ExerciseSlot, ExerciseTypeDef, ExerciseValues, ParameterBlock } from '../../lib/types';
  import Toggle from '../ui/Toggle.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import ExerciseForm from './ExerciseForm.svelte';

  let { initial, startName = '', confirmLabel = 'Add to session', onAdd, onClose }: {
    /** A saved circuit to adjust, or null for a new one. */
    initial: Circuit | null;
    startName?: string;
    confirmLabel?: string;
    onAdd: (circuit: Circuit, save: 'none' | 'new' | 'update') => void | Promise<void>;
    onClose: () => void;
  } = $props();

  const fromSaved = untrack(() => !!initial && trainingState.circuits.some((c) => c.id === initial.id));
  let draft = $state<Circuit>(untrack(() => (initial ? draftFromSaved(initial) : { ...blankCircuit(generateId()), name: startName })));
  let saveIt = $state(false);
  let adding = $state(false);
  let picking = $state(false);
  let detail = $state<ExerciseSlot | null>(null);
  /** Exercises whose weight field was opened by hand (the others show it when the exercise has one or tracks it). */
  let weightOpen = $state<string[]>([]);
  const unit = $derived(trainingState.units.weight);
  const shownWeight = (kg: number) => formatWeight(kg, unit);

  const nameOf = (slot: ExerciseSlot) => slotTypeName(slot, trainingState.exerciseTypes);
  const minutes = $derived(groupMinutes(circuitAsWorkout($state.snapshot(draft) as Circuit), 'planned').get('circuit'));
  const line = $derived(circuitLine(draft, nameOf, shownWeight));
  const seconds = (raw: string): number | undefined => {
    const n = Math.round(Number(raw));
    return raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
  };

  function addType(id: string) {
    const type = trainingState.exerciseTypes.find((t) => t.id === id);
    picking = false;
    if (type) draft.exercises = [...draft.exercises, slotForType(type, generateId())];
  }
  const setSlot = (id: string, fn: (s: ExerciseSlot) => ExerciseSlot) => (draft.exercises = draft.exercises.map((s) => (s.id === id ? fn(s) : s)));
  function move(index: number, by: -1 | 1) {
    const next = [...draft.exercises];
    const [slot] = next.splice(index, 1);
    next.splice(index + by, 0, slot);
    draft.exercises = next;
  }
  const setAmount = (slot: ExerciseSlot, a: ReturnType<typeof amountOf>, patch: { kind?: typeof a.kind; n?: number; on?: number; off?: number }) =>
    setSlot(slot.id, (s) => slotWithAmount(s, patch.kind ?? a.kind, patch.n ?? a.n, patch.on ?? a.on, patch.off ?? a.off));
  const setWeight = (slot: ExerciseSlot, raw: string) => {
    const n = Number(raw);
    setSlot(slot.id, (s) => ({ ...s, prescribed: withWeight(s.prescribed, raw.trim() === '' || !(n > 0) ? undefined : Math.round(toKg(n, unit) * 100) / 100) }));
  };
  const remove = (id: string) => (draft.exercises = draft.exercises.filter((s) => s.id !== id));

  function saveDetail(data: { typeId: string; categoryId?: string; activeParameters: ParameterBlock[]; values: ExerciseValues }) {
    const id = detail?.id;
    if (id) setSlot(id, (s) => ({ ...s, typeId: data.typeId, categoryId: data.categoryId, activeParameters: data.activeParameters, prescribed: data.values }));
    detail = null;
  }

  async function add() {
    if (draft.exercises.length === 0 || adding) return;
    adding = true;
    const circuit = { ...($state.snapshot(draft) as Circuit), name: draft.name.trim() || 'Circuit' };
    await onAdd(circuit, saveIt ? (fromSaved ? 'update' : 'new') : 'none');
  }

  backWhile(() => detail === null && !picking, () => onClose());
  backWhile(() => detail !== null, () => (detail = null));
</script>

<div class="fixed inset-0 z-[125] safe-y bg-app-bg flex flex-col" role="dialog" aria-modal="true" aria-label={fromSaved ? `Adjust ${draft.name}` : 'New circuit'}>
  <header class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 pt-4 pb-3 flex items-center gap-3">
      <button onclick={onClose} class="btn-icon -ml-2 shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-2xl" /></button>
      <div class="min-w-0 flex-1">
        <p class="text-caption uppercase text-primary">{fromSaved ? 'Saved circuit' : 'New circuit'}</p>
        <p class="text-caption text-content-subtle">{fromSaved ? 'Change what you like before it is added.' : 'Rounds, and each exercise\'s reps or seconds.'}</p>
      </div>
    </div>
  </header>

  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full px-4 py-4 pb-8 space-y-4">
      <section class="rounded-card bg-surface-elevated/50 p-3 space-y-3">
        <label class="block">
          <span class="text-caption text-content-subtle">Name</span>
          <input bind:value={draft.name} placeholder="e.g. Pull + core" class="field mt-1" aria-label="Circuit name" />
        </label>
        <div>
          <p class="text-caption text-content-subtle mb-1">Rounds</p>
          <div class="flex items-center bg-surface-elevated/50 border border-border-strong rounded-control w-fit">
            <button onclick={() => (draft.rounds = Math.max(1, draft.rounds - 1))} class="btn-quiet min-w-11 text-content-subtle hover:text-content" aria-label="One round fewer"><Icon icon="ic:baseline-remove" class="text-xl" /></button>
            <span class="w-12 text-center text-body font-bold text-content tabular-nums">{draft.rounds}</span>
            <button onclick={() => (draft.rounds += 1)} class="btn-quiet min-w-11 text-content-subtle hover:text-content" aria-label="One more round"><Icon icon="ic:baseline-add" class="text-xl" /></button>
          </div>
          <p class="text-caption text-content-subtle mt-1">Every round goes through all the exercises below, in order.</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block min-w-0">
            <span class="block text-caption text-content-subtle mb-1">Rest between exercises (s)</span>
            <input type="number" min="0" step="5" inputmode="numeric" placeholder="0" value={draft.transition ?? ''} oninput={(e) => (draft.transition = seconds(e.currentTarget.value))} class="field px-2.5 font-bold tabular-nums" />
          </label>
          <label class="block min-w-0">
            <span class="block text-caption text-content-subtle mb-1">Rest between rounds (s)</span>
            <input type="number" min="0" step="15" inputmode="numeric" placeholder={draft.transition ? String(draft.transition) : '0'} value={draft.roundRest ?? ''} oninput={(e) => (draft.roundRest = seconds(e.currentTarget.value))} class="field px-2.5 font-bold tabular-nums" />
          </label>
        </div>
      </section>

      <section class="space-y-2" aria-label="Exercises">
        {#each draft.exercises as slot, index (slot.id)}
          {@const a = amountOf(slot.prescribed)}
          <div class="rounded-card bg-surface-elevated/50 p-3 space-y-2.5">
            <div class="flex items-center gap-1">
              <p class="min-w-0 flex-1 text-body font-bold text-content truncate">{nameOf(slot)}</p>
              <button onclick={() => move(index, -1)} disabled={index === 0} class="btn-icon disabled:opacity-30" aria-label="Move up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
              <button onclick={() => move(index, 1)} disabled={index === draft.exercises.length - 1} class="btn-icon disabled:opacity-30" aria-label="Move down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
              <button onclick={() => remove(slot.id)} class="btn-icon -mr-1 hover:text-danger" aria-label="Remove {nameOf(slot)}"><Icon icon="ic:baseline-close" class="text-xl" /></button>
            </div>
            <div class="seg w-fit" role="group" aria-label="Unit">
              <button type="button" aria-pressed={a.kind === 'reps'} onclick={() => setAmount(slot, a, { kind: 'reps', n: a.kind === 'time' ? 8 : a.n })} class="seg-item {a.kind === 'reps' ? 'seg-on' : 'hover:text-content'}">reps</button>
              <button type="button" aria-pressed={a.kind === 'time'} onclick={() => setAmount(slot, a, { kind: 'time', n: a.kind === 'time' ? a.n : 30 })} class="seg-item {a.kind === 'time' ? 'seg-on' : 'hover:text-content'}">seconds</button>
              <button type="button" aria-pressed={a.kind === 'hang'} onclick={() => setAmount(slot, a, { kind: 'hang', n: a.kind === 'time' ? 6 : a.n, on: a.kind === 'time' ? 7 : undefined })} class="seg-item {a.kind === 'hang' ? 'seg-on' : 'hover:text-content'}" title="Reps of a hold, each with its own on and off time - a hangboard repeater">repeats</button>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              {#if a.kind === 'hang'}
                <input type="number" min="1" inputmode="numeric" value={a.n} aria-label="Reps of {nameOf(slot)}" oninput={(e) => { const n = Number(e.currentTarget.value); if (n >= 1) setAmount(slot, a, { n }); }} class="field w-16 px-2 text-center font-bold tabular-nums" />
                <span class="text-caption text-content-subtle">×</span>
                <input type="number" min="1" inputmode="numeric" value={a.on} aria-label="Seconds on" oninput={(e) => { const n = Number(e.currentTarget.value); if (n >= 1) setAmount(slot, a, { on: n }); }} class="field w-16 px-2 text-center font-bold tabular-nums" />
                <span class="text-caption text-content-subtle">s on</span>
                <input type="number" min="0" inputmode="numeric" value={a.off} aria-label="Seconds off" oninput={(e) => { const n = Number(e.currentTarget.value); if (n >= 0) setAmount(slot, a, { off: n }); }} class="field w-16 px-2 text-center font-bold tabular-nums" />
                <span class="text-caption text-content-subtle">s off</span>
              {:else}
                <input type="number" min="1" inputmode="numeric" value={a.n} aria-label="{a.kind === 'time' ? 'Seconds' : 'Reps'} of {nameOf(slot)}" oninput={(e) => { const n = Number(e.currentTarget.value); if (n >= 1) setAmount(slot, a, { n }); }} class="field w-24 px-2.5 text-center font-bold tabular-nums" />
                <span class="text-caption text-content-subtle">{a.kind === 'time' ? 'seconds' : 'reps'}</span>
              {/if}
              <button onclick={() => (detail = slot)} class="btn-quiet ml-auto px-2 text-caption font-bold text-content-subtle hover:text-content" title="Notes, its own rest after it, a timer, hold type">More</button>
            </div>
            {#if tracksWeight(slot) || weightOpen.includes(slot.id)}
              {@const kg = weightOf(slot.prescribed)}
              <label class="flex items-center gap-2">
                <span class="text-caption text-content-subtle">Added weight</span>
                <input type="number" min="0" step="0.5" inputmode="decimal" placeholder="0" value={kg === undefined ? '' : Math.round(displayWeight(kg, unit) * 10) / 10} oninput={(e) => setWeight(slot, e.currentTarget.value)} aria-label="Added weight of {nameOf(slot)} in {unit}" class="field w-20 px-2 text-center font-bold tabular-nums" />
                <span class="text-caption text-content-subtle">{unit} <span class="text-content-faint">(each round)</span></span>
              </label>
            {:else}
              <button onclick={() => (weightOpen = [...weightOpen, slot.id])} class="text-caption font-bold text-content-subtle hover:text-primary">+ Added weight</button>
            {/if}
          </div>
        {/each}
        <button onclick={() => (picking = true)} class="w-full min-h-11 py-2.5 border border-dashed border-border-strong rounded-card text-label font-bold text-content-muted hover:text-primary transition-colors flex items-center justify-center gap-1.5">
          <Icon icon="ic:baseline-plus" class="text-base" /> Add exercise
        </button>
      </section>

      {#if draft.exercises.length > 0}
        <p class="text-caption text-content-muted px-1" aria-live="polite">{line}{minutes ? ` · about ${formatMinutes(Math.ceil(minutes))}` : ''}</p>
      {/if}
    </div>
  </div>

  <footer class="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
    <div class="max-w-lg mx-auto w-full px-4 py-2 space-y-1">
      <Toggle checked={saveIt} onChange={(v) => (saveIt = v)} label={fromSaved ? `Update "${initial?.name}" too` : 'Save to my circuits'} hint={fromSaved ? 'Off: only this copy changes' : 'So you can add it again with one tap'} />
      <button onclick={add} disabled={draft.exercises.length === 0 || adding} class="btn btn-primary w-full gap-1.5">
        <Icon icon="ic:baseline-check" class="text-base" /> {confirmLabel}
      </button>
      {#if draft.exercises.length === 0}<p class="text-caption text-content-subtle text-center">Add at least one exercise.</p>{/if}
    </div>
  </footer>
</div>

{#if picking}
  <ExercisePicker types={trainingState.exerciseTypes} selectedId="" onPick={addType} onCreated={() => {}} onClose={() => (picking = false)} />
{/if}

{#if detail}
  <div class="fixed inset-0 z-[140] safe-y bg-app-bg overflow-y-auto no-scrollbar">
    <div class="max-w-lg mx-auto w-full p-4 space-y-4 pb-12">
      <button onclick={() => (detail = null)} class="btn btn-ghost -ml-2 gap-2"><Icon icon="ic:baseline-arrow-back" class="text-base" /> Back to circuit</button>
      <ExerciseForm initialSlot={detail} mode="prescribed" inGroup onSave={saveDetail} />
    </div>
  </div>
{/if}
