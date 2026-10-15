<script lang="ts">
  import InfoButton from '../common/InfoButton.svelte';
  /**
   * Settings -> Training setup -> Benchmarks: the periodic tests (max hang,
   * max pull-ups ...) and what each one records.
   *
   * A test lists its fields - value types (the registry under "Value types",
   * shared with exercises) as a *result* (what is measured) or a *condition*
   * (how it was done: edge depth, the added load on a rep test). Results are
   * compared like with like, so "Max Hang" is one test and the edge is just
   * a condition - no more "Max Hang 20mm" and "Max Hang 15mm". New tests
   * start from a preset.
   *
   * Removing is two steps: Archive hides the test from new logging and keeps
   * its history, Delete takes the test away (logged results stay, unlinked,
   * until Undo puts it back).
   */
  import { portal } from '../../lib/ui/portal';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { scopedUndo } from '../../lib/toast.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { trainingState } from '../../lib/state.svelte';
  import { usableFor } from '../../lib/exercise/valueDefs';
  import type { Benchmark, BenchmarkField, BenchmarkScore, BenchmarkTypeDef } from '../../lib/types';
  import { finalizeType, groupTypes, resolveFields, typeProblem, type ResolvedField } from '../../lib/benchmarks/model';
  import { BENCHMARK_PRESETS, missingBuiltIns } from '../../lib/benchmarks/presets';
  import { measureOfUnit } from '../../lib/benchmarks/upgrade';
  import { applyTidy, proposeTidy } from '../../lib/benchmarks/tidy';
  import { planWeighInMigration, weighInTypeIds, withoutWeighInSlots, withoutWeighInSlotsInAlternatives, withoutWeighInSlotsInTemplates } from '../../lib/benchmarks/bodyweight';
  import { BODYWEIGHT_METRIC_ID } from '../../lib/constants';
  import type { Workout } from '../../lib/types';
  import Icon from '@iconify/svelte';

  let { benchmarkTypes = $bindable() }: { benchmarkTypes: BenchmarkTypeDef[] } = $props();

  const defs = $derived(trainingState.valueDefs);
  const offered = $derived(defs.filter((d) => !d.archived && usableFor(d, 'benchmark')));

  // --- The list ---
  const active = $derived(benchmarkTypes.filter((t) => !t.archived));
  const archived = $derived(benchmarkTypes.filter((t) => t.archived && resultCount(t.id) > 0));
  /** Archived tests with nothing logged are clutter: tucked behind a toggle (they can still be restored from there). */
  const archivedEmpty = $derived(benchmarkTypes.filter((t) => t.archived && resultCount(t.id) === 0));
  let showEmptyArchived = $state(false);

  /**
   * The tidy-up and weigh-in cards can be hidden. What was hidden is remembered as the offer's
   * signature, so they come back only when there is something new to offer.
   */
  const DISMISS_KEY = 'tests.dismissedOffers';
  const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]'); } catch { return []; } };
  let dismissed = $state<string[]>(readDismissed());
  function dismiss(signature: string) {
    dismissed = [...dismissed, signature];
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed.slice(-20))); } catch { /* stays hidden for this visit */ }
  }
  const groups = $derived(groupTypes(active));
  const existingGroups = $derived([...new Set(benchmarkTypes.map((t) => t.group?.trim()).filter((g): g is string => !!g))]);

  function resultCount(id: string) { return trainingState.benchmarks.filter((b) => b.typeId === id).length; }

  /** What a test records, in a line: "Added weight (kg) · by edge depth", "Reps", "Time (s)". */
  function summary(type: BenchmarkTypeDef): string {
    const fields = resolveFields(type, defs);
    const unitOf = (f: ResolvedField) => (f.measure === 'weight' ? trainingState.units.weight : f.unit);
    // "Reps (reps)" says it twice.
    const named = (f: ResolvedField) => (unitOf(f) && unitOf(f).toLowerCase() !== f.label.toLowerCase() ? `${f.label} (${unitOf(f)})` : f.label);
    const results = fields.filter((f) => f.role === 'result').map(named).join(' + ');
    const by = fields.filter((f) => f.role === 'condition' && f.fixed === undefined).map((f) => f.label.toLowerCase());
    return [results, by.length ? `with ${by.join(' and ')}` : '', type.direction === 'lower' ? 'lower is better' : ''].filter(Boolean).join(' · ');
  }

  // --- The editor ---
  type Row = { valueId: string; role: 'result' | 'condition'; label: string; fixedText: string; basis: 'added' | 'total' };
  let editing = $state<{ type: BenchmarkTypeDef; rows: Row[]; isNew: boolean } | null>(null);
  let choosing = $state(false);
  backWhile(() => editing !== null, () => { editing = null; });
  backWhile(() => choosing, () => { choosing = false; });

  const rowOf = (f: BenchmarkField): Row => ({ valueId: f.valueId, role: f.role, label: f.label ?? '', fixedText: f.fixed === undefined ? '' : String(f.fixed), basis: f.basis ?? 'added' });

  function open(type: BenchmarkTypeDef, isNew: boolean) {
    const fields = type.fields ?? resolveFields(type, defs).map((f) => ({ valueId: f.valueId, role: f.role }));
    editing = { type: { ...type, fields: undefined }, rows: fields.map(rowOf), isNew };
    choosing = false;
  }
  function startFromPreset(id: string) {
    const preset = BENCHMARK_PRESETS.find((p) => p.id === id)!;
    open({ id: generateId(), ...preset.make() }, true);
  }
  /** Every test has fields after the 3.34 upgrade; one that somehow has none opens as a single result in its unit, and saving writes the field. */
  function startEdit(type: BenchmarkTypeDef) {
    if (type.fields?.length) return open(type, false);
    const key = measureOfUnit(type.unit)?.key ?? 'weight';
    open({ ...type, fields: [{ valueId: key, role: 'result' }] }, false);
  }

  const draftFields = $derived<BenchmarkField[]>(
    editing ? editing.rows.map((r) => {
      const def = defs.find((d) => d.id === r.valueId);
      const fixedText = r.fixedText.trim();
      const fixed = fixedText === '' ? undefined : def?.kind === 'choice' ? fixedText : Number.isFinite(Number(fixedText)) ? Number(fixedText) : undefined;
      return { valueId: r.valueId, role: r.role, label: r.label, ...(fixed !== undefined ? { fixed } : {}), basis: r.basis };
    }) : [],
  );
  const draft = $derived(editing ? { ...editing.type, fields: draftFields } : null);
  const problem = $derived(
    draft && editing ? typeProblem(draft, benchmarkTypes.filter((t) => t.id !== editing!.type.id).map((t) => t.name)) : null,
  );
  const resolved = $derived<ResolvedField[]>(draft ? resolveFields({ unit: draft.unit, fields: draft.fields }, defs) : []);
  const primary = $derived(resolved.find((f) => f.role === 'result'));
  const hasWeight = $derived(resolved.some((f) => f.measure === 'weight'));
  const canRelative = $derived(primary?.measure === 'weight');
  const canEstimate = $derived(resolved.some((f) => f.measure === 'weight') && resolved.some((f) => f.measure === 'reps'));
  const unusedDefs = $derived(offered.filter((d) => !editing?.rows.some((r) => r.valueId === d.id)));

  function addRow(valueId: string) {
    if (!editing || !valueId) return;
    const hasResult = editing.rows.some((r) => r.role === 'result');
    editing.rows = [...editing.rows, { valueId, role: hasResult ? 'condition' : 'result', label: '', fixedText: '', basis: 'added' }];
  }
  function removeRow(i: number) {
    if (editing) editing.rows = editing.rows.filter((_, j) => j !== i);
  }
  function moveRow(i: number, by: number) {
    if (!editing) return;
    const j = i + by;
    if (j < 0 || j >= editing.rows.length) return;
    const rows = [...editing.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    editing.rows = rows;
  }
  function setScore(score: BenchmarkScore) {
    if (editing) editing.type = { ...editing.type, score };
  }

  async function save() {
    if (!editing || !draft || problem) return;
    // A value type the test needs may have been deleted since it shipped: put it back.
    const missing = missingBuiltIns(draft, defs);
    if (missing.length) await trainingState.saveValueDefs([...defs, ...missing]);
    const type = finalizeType(draft, [...defs, ...missing]);
    const index = benchmarkTypes.findIndex((t) => t.id === type.id);
    if (index === -1) benchmarkTypes.push(type);
    else benchmarkTypes[index] = type;
    // Closing is enough: nulling the edited object too would make the form's
    // still-bound inputs read a property of null before the form is gone.
    editing = null;
  }

  function setArchived(type: BenchmarkTypeDef, archive: boolean) {
    const index = benchmarkTypes.findIndex((t) => t.id === type.id);
    if (index === -1) return;
    benchmarkTypes[index] = { ...benchmarkTypes[index], archived: archive || undefined };
    if (!archive) delete benchmarkTypes[index].archived;
    editing = null;
  }

  // --- Tidy-up: leftovers of how tests used to be kept ---
  const proposals = $derived(proposeTidy(benchmarkTypes, trainingState.benchmarks, defs));
  const tidySignature = $derived(`tidy:${proposals.map((p) => p.id).join(',')}`);
  let ticked = $state<Record<string, boolean>>({});
  const isTicked = (p: { id: string; defaultOn: boolean }) => ticked[p.id] ?? p.defaultOn;
  const tickedCount = $derived(proposals.filter(isTicked).length);

  /** Applies the ticked proposals; Undo puts the tests and every moved result back. */
  async function tidy() {
    const chosen = proposals.filter(isTicked);
    if (chosen.length === 0) return;
    const beforeTypes = $state.snapshot(benchmarkTypes) as BenchmarkTypeDef[];
    const out = applyTidy(chosen, beforeTypes, trainingState.benchmarks);
    const beforeResults = out.benchmarks.map((b) => $state.snapshot(trainingState.benchmarks.find((x) => x.id === b.id)) as Benchmark);
    benchmarkTypes = out.types;
    for (const b of out.benchmarks) await trainingState.saveBenchmark(b, { syncBodyweight: false });
    ticked = {};
    undoable('Tests tidied up', async () => {
      benchmarkTypes = beforeTypes;
      for (const b of beforeResults) await trainingState.saveBenchmark(b, { syncBodyweight: false });
    });
  }

  // --- Weigh-ins: a daily reading, not a test ---
  const weighIn = $derived(planWeighInMigration(benchmarkTypes, trainingState.benchmarks, defs, trainingState.dailyMetrics));
  const weighInSlots = $derived(withoutWeighInSlots(trainingState.workouts, weighInTypeIds(benchmarkTypes, defs)));
  /** Weigh-in slots left in the phases' templates and Plan B alternatives. */
  const weighInPlanSlots = $derived(
    withoutWeighInSlotsInTemplates(trainingState.templates, weighInTypeIds(benchmarkTypes, defs)).count
      + withoutWeighInSlotsInAlternatives(trainingState.planAlternatives, weighInTypeIds(benchmarkTypes, defs)).count,
  );
  const weighInSignature = $derived(`weighin:${weighIn.typeIds.join(',')}:${weighIn.entries.length}:${weighInSlots.length}:${weighInPlanSlots}`);
  const weighInOffer = $derived(weighIn.typeIds.length > 0 || weighIn.entries.length > 0 || weighInSlots.length > 0 || weighInPlanSlots > 0);

  /** Results become readings, the test is archived, planned weigh-in sessions lose the slot. Undo reverses all three; no result is deleted. */
  async function moveWeighIns() {
    const plan = weighIn;
    const beforeTypes = $state.snapshot(benchmarkTypes) as BenchmarkTypeDef[];
    const beforeWorkouts = weighInSlots.map((w) => $state.snapshot(trainingState.workouts.find((x) => x.id === w.id)) as Workout);
    if (plan.entries.length > 0) await trainingState.importDailyMetrics(plan.entries, [{ id: BODYWEIGHT_METRIC_ID, name: 'Bodyweight', unit: 'kg' }]);
    benchmarkTypes = benchmarkTypes.map((t) => (plan.typeIds.includes(t.id) ? { ...t, archived: true } : t));
    for (const w of weighInSlots) await trainingState.saveWorkoutQuiet($state.snapshot(w) as Workout);
    const fromPlan = await trainingState.stripTestSlotsFromPlan(weighInTypeIds(beforeTypes, defs));
    undoable(`${plan.entries.length} weigh-in${plan.entries.length === 1 ? '' : 's'} moved to Bodyweight`, async () => {
      await trainingState.removeDailyMetrics(plan.entries.map((e) => e.id));
      benchmarkTypes = beforeTypes;
      for (const w of beforeWorkouts) await trainingState.saveWorkoutQuiet(w);
      await fromPlan.undo();
    });
  }

  const undoable = scopedUndo();
  /** Logged results stay; they're just unlinked until Undo puts the type back. */
  async function remove(id: string) {
    const index = benchmarkTypes.findIndex((t) => t.id === id);
    if (index === -1) return;
    const removed = $state.snapshot(benchmarkTypes[index]) as BenchmarkTypeDef;
    const n = resultCount(id);
    if (n > 0 && !(await showConfirm(`Delete ${removed.name}?`, `${n} logged ${n === 1 ? 'result stays' : 'results stay'} but ${n === 1 ? 'is' : 'are'} no longer part of a test. Archive it instead to keep them in it.`))) return;
    benchmarkTypes = benchmarkTypes.filter((t) => t.id !== id);
    editing = null;
    undoable(`${removed.name} deleted`, () => {
      if (!benchmarkTypes.some((t) => t.id === removed.id)) benchmarkTypes = [...benchmarkTypes.slice(0, index), removed, ...benchmarkTypes.slice(index)];
    });
  }

  const defName = (id: string) => defs.find((d) => d.id === id)?.name ?? id;
  const sheetClose = () => (editing = null);
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1 flex items-center gap-1.5">Tests <InfoButton term="tests" /></h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">Periodic tests tracked over time - log one from the + on Home. Each records what you measure and, where it matters, how you did it (edge depth, added weight). Everything is kept, and Analytics lets you filter, split and plot it any way you like.</p>
  </div>

  {#if weighInOffer && !dismissed.includes(weighInSignature)}
    <div class="rounded-card bg-status-caution/10 p-4 space-y-3">
      <div>
        <div class="flex items-start justify-between gap-2">
          <p class="text-label font-semibold text-content">Weigh-ins are a daily reading now</p>
          <button onclick={() => dismiss(weighInSignature)} class="tap p-1 -m-1 text-content-subtle hover:text-content" aria-label="Hide this for now"><Icon icon="ic:baseline-close" class="text-lg" /></button>
        </div>
        <p class="text-caption text-content-subtle leading-relaxed">
          Your bodyweight lives under Home &rarr; Metrics, which is what the Home card, readiness and the % of bodyweight scores read - a Bodyweight test isn't needed, and the AI no longer schedules one.
          {#if weighIn.entries.length > 0}{weighIn.entries.length} result{weighIn.entries.length === 1 ? '' : 's'} become{weighIn.entries.length === 1 ? 's' : ''} a daily reading{#if weighIn.keptDays > 0}; {weighIn.keptDays} day{weighIn.keptDays === 1 ? '' : 's'} already {weighIn.keptDays === 1 ? 'has' : 'have'} one and keep it{/if}.{/if}
          {#if weighIn.typeIds.length > 0}The test is archived.{/if}
          {#if weighInSlots.length > 0}{weighInSlots.length} planned session{weighInSlots.length === 1 ? '' : 's'} lose{weighInSlots.length === 1 ? 's' : ''} the weigh-in.{/if}
          {#if weighInPlanSlots > 0}It is also taken out of {weighInPlanSlots} phase or Plan B session{weighInPlanSlots === 1 ? '' : 's'}.{/if}
          {#if weighIn.skipped.length > 0}{weighIn.skipped.length} result{weighIn.skipped.length === 1 ? '' : 's'} had no usable weight or date and stay{weighIn.skipped.length === 1 ? 's' : ''} in history only.{/if}
          No result is deleted; Undo is offered afterwards.
        </p>
      </div>
      <button onclick={moveWeighIns} class="w-full py-2.5 rounded-control bg-primary text-white text-label font-semibold">Move to Bodyweight</button>
    </div>
  {/if}

  {#if proposals.length > 0 && !dismissed.includes(tidySignature)}
    <div class="rounded-card bg-status-caution/10 p-4 space-y-3">
      <div>
        <div class="flex items-start justify-between gap-2">
          <p class="text-label font-semibold text-content">Tidy up your tests</p>
          <button onclick={() => dismiss(tidySignature)} class="tap p-1 -m-1 text-content-subtle hover:text-content" aria-label="Hide this for now"><Icon icon="ic:baseline-close" class="text-lg" /></button>
        </div>
        <p class="text-caption text-content-subtle leading-relaxed">Some of these look like leftovers: the same test kept twice, one lift kept as a max-reps test and a heaviest-single test, or one your daily metrics already cover. Tick what to do; Undo is offered afterwards, and no result is ever deleted.</p>
      </div>
      <div class="space-y-2.5">
        {#each proposals as p (p.id)}
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={isTicked(p)} onchange={(e) => (ticked[p.id] = e.currentTarget.checked)} class="mt-1 w-4 h-4 rounded accent-primary shrink-0" />
            <span class="min-w-0">
              <span class="block text-body text-content">{p.label}</span>
              <span class="block text-caption text-content-subtle leading-relaxed">{p.detail}</span>
            </span>
          </label>
        {/each}
      </div>
      <button onclick={tidy} disabled={tickedCount === 0} class="w-full py-2.5 rounded-control bg-primary text-white text-label font-semibold disabled:opacity-40">Apply {tickedCount} change{tickedCount === 1 ? '' : 's'}</button>
    </div>
  {/if}

  {#each groups as g (g.group)}
    <div class="space-y-1">
      {#if g.group || groups.length > 1}<p class="text-label text-content-subtle px-1">{g.group || 'Other'}</p>{/if}
      <div class="divide-y divide-border">
        {#each g.types as type (type.id)}
          <button onclick={() => startEdit(type)} class="w-full flex items-center justify-between gap-3 py-3 text-left group">
            <span class="min-w-0">
              <span class="block text-body font-bold text-content group-hover:text-primary transition-colors truncate">{type.name}</span>
              <span class="block text-caption text-content-subtle truncate">{summary(type)}</span>
            </span>
            <span class="flex items-center gap-2 shrink-0">
              {#if resultCount(type.id) > 0}<span class="text-caption text-content-subtle tabular-nums">{resultCount(type.id)}</span>{/if}
              <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
            </span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <p class="text-caption text-content-subtle italic px-1">No tests yet.</p>
  {/each}

  <button onclick={() => (choosing = true)} class="w-full py-2.5 text-label font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-control transition-colors flex items-center justify-center gap-1.5">
    <Icon icon="ic:baseline-add" class="text-lg" /> New test
  </button>

  {#if archived.length || archivedEmpty.length}
    <div class="pt-2 space-y-1">
      <p class="text-caption uppercase text-content-subtle px-1">Archived</p>
      <div class="divide-y divide-border">
        {#each showEmptyArchived ? [...archived, ...archivedEmpty] : archived as type (type.id)}
          <button onclick={() => startEdit(type)} class="w-full flex items-center justify-between gap-3 py-2 text-left">
            <span class="min-w-0"><span class="block text-body text-content-muted truncate">{type.name}</span><span class="block text-caption text-content-subtle">{resultCount(type.id)} result{resultCount(type.id) === 1 ? '' : 's'} kept</span></span>
            <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
          </button>
        {/each}
      </div>
      {#if archivedEmpty.length}
        <button onclick={() => (showEmptyArchived = !showEmptyArchived)} class="px-1 py-1 text-caption text-primary">{showEmptyArchived ? 'Hide' : 'Show'} {archivedEmpty.length} archived without results</button>
      {/if}
    </div>
  {/if}
</div>

{#if choosing}
  {@const closeChooser = () => (choosing = false)}
  <div use:portal class="fixed inset-0 pb-safe z-[100] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeChooser(); }}>
    <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar" use:sheetDrag={closeChooser}>
      <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
        <div><p class="text-caption uppercase text-content-subtle">New test</p><h3 class="text-title text-content">Start from</h3></div>
        <button onclick={closeChooser} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>
      <div class="divide-y divide-border px-2 pb-4">
        {#each BENCHMARK_PRESETS as preset (preset.id)}
          <button onclick={() => startFromPreset(preset.id)} class="w-full flex items-center justify-between gap-3 px-3 py-3.5 text-left group">
            <span class="min-w-0"><span class="block text-body font-bold text-content group-hover:text-primary transition-colors">{preset.label}</span><span class="block text-caption text-content-subtle">{preset.hint}</span></span>
            <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if editing && draft}
  <div use:portal class="fixed inset-0 pb-safe z-[100] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) sheetClose(); }}>
    <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar" use:sheetDrag={sheetClose}>
      <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-caption uppercase text-content-subtle">{editing.isNew ? 'New test' : draft.archived ? 'Archived test' : 'Test'}</p>
          <h3 class="text-title text-content truncate">{draft.name.trim() || 'Untitled'}</h3>
        </div>
        <button onclick={sheetClose} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>

      <div class="p-5 space-y-5">
        <div class="grid grid-cols-5 gap-3">
          <label class="col-span-3 block space-y-1.5">
            <span class="text-label text-content-subtle">Name</span>
            <input bind:value={editing.type.name} placeholder="e.g. Max Hang" class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border text-sm outline-none focus:border-primary/50 {problem && editing.type.name ? 'border-danger/50' : 'border-border-strong'}" />
          </label>
          <label class="col-span-2 block space-y-1.5">
            <span class="text-label text-content-subtle">Folder</span>
            <input bind:value={editing.type.group} list="benchmark-groups" placeholder="optional" class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50" />
            <datalist id="benchmark-groups">{#each existingGroups as g}<option value={g}></option>{/each}</datalist>
          </label>
        </div>

        <div class="space-y-2">
          <span class="text-label text-content-subtle block">What it records</span>
          <div class="space-y-2">
            {#each editing.rows as row, i (row.valueId)}
              {@const def = defs.find((d) => d.id === row.valueId)}
              {@const isPrimary = row.role === 'result' && editing.rows.findIndex((r) => r.role === 'result') === i}
              <div class="p-3 rounded-control bg-surface-elevated/50 border border-border space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="min-w-0 text-body font-bold text-content truncate">{row.label.trim() || defName(row.valueId)}{#if def?.unit}<span class="text-content-subtle font-normal">&nbsp;· {def.measure === 'weight' ? trainingState.units.weight : def.unit}</span>{/if}</span>
                  <span class="flex items-center shrink-0">
                    <button onclick={() => moveRow(i, -1)} disabled={i === 0} class="tap p-1.5 text-content-subtle hover:text-content disabled:opacity-30" aria-label="Move up"><Icon icon="ic:baseline-arrow-upward" class="text-base" /></button>
                    <button onclick={() => moveRow(i, 1)} disabled={i === editing.rows.length - 1} class="tap p-1.5 text-content-subtle hover:text-content disabled:opacity-30" aria-label="Move down"><Icon icon="ic:baseline-arrow-downward" class="text-base" /></button>
                    <button onclick={() => removeRow(i)} class="tap p-1.5 text-content-subtle hover:text-danger" aria-label="Remove"><Icon icon="ic:baseline-close" class="text-base" /></button>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex rounded-control overflow-hidden border border-border-strong shrink-0">
                    {#each [['result', 'Result'], ['condition', 'Set-up']] as [role, label]}
                      <button type="button" onclick={() => (row.role = role as Row['role'])} aria-pressed={row.role === role} class="px-3 py-1.5 text-label {row.role === role ? 'bg-primary/10 text-primary font-bold' : 'bg-surface text-content-muted'}">{label}</button>
                    {/each}
                  </div>
                  {#if isPrimary}<span class="text-caption text-content-subtle">charted</span>{/if}
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input bind:value={row.label} placeholder="Own name (optional)" aria-label="Name in this test" class="px-3 py-2 bg-surface text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50" />
                  {#if def?.kind === 'choice'}
                    <select bind:value={row.fixedText} aria-label="Always" class="px-3 py-2 bg-surface text-content rounded-control border border-border-strong text-sm outline-none">
                      <option value="">Asked each time</option>
                      {#each def.options ?? [] as o}<option value={o}>Always {o}</option>{/each}
                    </select>
                  {:else}
                    <input bind:value={row.fixedText} inputmode="decimal" placeholder="Always… (optional)" aria-label="Always this value" class="px-3 py-2 bg-surface text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50" />
                  {/if}
                </div>
                {#if def?.measure === 'weight'}
                  <div class="flex rounded-control overflow-hidden border border-border-strong">
                    {#each [['added', 'Added on top of bodyweight'], ['total', 'The whole load']] as [basis, label]}
                      <button type="button" onclick={() => (row.basis = basis as Row['basis'])} aria-pressed={row.basis === basis} class="flex-1 px-3 py-1.5 text-label {row.basis === basis ? 'bg-primary/10 text-primary font-bold' : 'bg-surface text-content-muted'}">{label}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          {#if unusedDefs.length > 0}
            <select onchange={(e) => { addRow(e.currentTarget.value); e.currentTarget.value = ''; }} aria-label="Add a field" class="w-full px-3 py-2.5 bg-surface-elevated text-primary font-bold rounded-control border border-border-strong text-sm outline-none">
              <option value="">+ Add a value…</option>
              {#each unusedDefs as d (d.id)}<option value={d.id}>{d.name}{d.unit ? ` (${d.measure === 'weight' ? trainingState.units.weight : d.unit})` : ''}</option>{/each}
            </select>
          {/if}
          <p class="text-caption text-content-subtle leading-relaxed"><b class="text-content-muted">Result</b>: something you measure - weight, reps, time. <b class="text-content-muted">Set-up</b>: how you did it (edge depth, an added load) - it starts from last time and is what Home compares by. Every value is kept either way: in the chart you can filter, split or plot against any of them, so nothing here locks how you look at the results later. The first result is what progress follows. Need another kind of value? Add it under Training setup → Value types.</p>
        </div>

        <div class="space-y-1.5">
          <span class="text-label text-content-subtle block">Which way is better</span>
          <div class="grid grid-cols-2 gap-2">
            {#each [['higher', 'Higher'], ['lower', 'Lower']] as [dir, label]}
              <button type="button" onclick={() => (editing!.type = { ...editing!.type, direction: dir as 'higher' | 'lower' })} aria-pressed={(draft.direction ?? 'higher') === dir} class="px-3 py-2 rounded-control text-label border transition-all {(draft.direction ?? 'higher') === dir ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-elevated border-border-strong text-content-muted'}">{label}</button>
            {/each}
          </div>
        </div>

        {#if canRelative || canEstimate}
          <div class="space-y-1.5">
            <span class="text-label text-content-subtle block">Chart it as</span>
            <div class="flex flex-wrap gap-1.5">
              {#each [['raw', 'As logged', true], ['relative', '% of bodyweight', canRelative && hasWeight], ['estimatedMax', 'Estimated max', canEstimate]] as [score, label, ok]}
                {#if ok}
                  <button type="button" onclick={() => setScore(score as BenchmarkScore)} aria-pressed={(draft.score ?? 'raw') === score} class="px-3 py-1.5 rounded-control text-label border transition-all {(draft.score ?? 'raw') === score ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-elevated border-border-strong text-content-muted'}">{label}</button>
                {/if}
              {/each}
            </div>
            <p class="text-caption text-content-subtle">{(draft.score ?? 'raw') === 'estimatedMax' ? 'Weight and reps combined into one number (Epley: weight × (1 + reps ÷ 30)), so more reps and more weight can be compared.' : (draft.score ?? 'raw') === 'relative' ? 'The load against your bodyweight on the day (needs a bodyweight logged near it).' : 'The primary result, as you logged it.'}</p>
          </div>
        {/if}

        <label class="block space-y-1.5">
          <span class="text-label text-content-subtle">How to do it <span class="text-content-subtle/70">(optional)</span></span>
          <textarea bind:value={editing.type.protocol} rows="3" placeholder="Warm-up, rest between attempts, how many tries…" class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 resize-y"></textarea>
        </label>

        {#if problem && (editing.type.name || editing.rows.length)}<p class="text-caption text-danger">{problem}</p>{/if}

        <div class="flex gap-2">
          <button onclick={save} disabled={!!problem} class="flex-1 py-3 bg-primary text-white text-label font-bold rounded-control disabled:opacity-40">Save</button>
          <button onclick={sheetClose} class="px-5 py-3 bg-surface-elevated text-content-muted text-label font-bold rounded-control">Cancel</button>
        </div>

        {#if !editing.isNew}
          <div class="pt-3 border-t border-border space-y-2">
            <button onclick={() => setArchived(editing!.type, !editing!.type.archived)} class="w-full py-2.5 text-label font-bold text-content-muted hover:text-content bg-surface-elevated rounded-control transition-colors">{editing.type.archived ? 'Restore' : 'Archive - keep the results, stop new logging'}</button>
            <button onclick={() => remove(editing!.type.id)} class="w-full py-2.5 text-label font-bold text-danger hover:bg-danger/10 rounded-control transition-colors">Delete…</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
