<script lang="ts">
  import { portal } from '../../lib/ui/portal';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * Advanced: the user's own value types - things an exercise can record beyond the
   * built-in fields (height, speed, heart rate, a pick-list of their own...).
   * They are only recorded and shown: they never enter load or fatigue.
   *
   * Removing one is two steps on purpose. Archive hides it from new use and
   * keeps every value ever logged readable; Delete is for good and says how
   * much it takes with it.
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { ValueDef, ValueMeasure } from '../../lib/types';
  import { benchmarkUsage, cleanOptions, defProblem, defUsage, newDefId } from '../../lib/exercise/valueDefs';
  import { showAlert, showConfirm } from '../../lib/utils';
  import { toast } from '../../lib/toast.svelte';
  import Icon from '@iconify/svelte';

  let open = $state(true);
  let editing = $state<{ def: ValueDef; isNew: boolean; optionsText: string } | null>(null);

  // Back (phone key or browser) closes the editor first - see lib/navigation/backStack.
  backWhile(() => editing !== null, () => { editing = null; });

  const defs = $derived(trainingState.valueDefs);
  const active = $derived(defs.filter((d) => !d.archived));
  const archived = $derived(defs.filter((d) => d.archived));

  const usage = (id: string) => defUsage(id, { workouts: trainingState.workouts, exerciseTypes: trainingState.exerciseTypes });
  const benchUsage = (id: string) => benchmarkUsage(id, trainingState.benchmarkTypes, trainingState.benchmarks);

  /** What a quantity fixes: its unit is stored the same way everywhere, so it is not typed. */
  const MEASURES: { id: ValueMeasure | ''; label: string; unit?: string; hint: string }[] = [
    { id: '', label: 'Plain', hint: 'Any number, with a unit of your own.' },
    { id: 'weight', label: 'Weight', unit: 'kg', hint: 'Stored in kg, shown in your unit; can be read against bodyweight.' },
    { id: 'reps', label: 'Reps', unit: 'reps', hint: 'A count of repetitions.' },
    { id: 'time', label: 'Time', unit: 's', hint: 'Seconds.' },
    { id: 'length', label: 'Length', unit: 'mm', hint: 'Millimetres - an edge depth.' },
  ];
  function setMeasure(measure: ValueMeasure | '') {
    if (!editing) return;
    editing.def.measure = measure || undefined;
    const unit = MEASURES.find((m) => m.id === measure)?.unit;
    if (unit) editing.def.unit = unit;
  }
  const hasUse = (use: 'exercise' | 'benchmark') => !editing?.def.uses || editing.def.uses.includes(use);
  function toggleUse(use: 'exercise' | 'benchmark') {
    if (!editing) return;
    const both: ('exercise' | 'benchmark')[] = ['exercise', 'benchmark'];
    const now = editing.def.uses ?? both;
    const next = now.includes(use) ? now.filter((u) => u !== use) : [...now, use];
    if (next.length === 0) return; // it has to be for something
    editing.def.uses = next.length === 2 ? undefined : next;
  }

  function startNew() {
    editing = { def: { id: '', name: '', kind: 'number', unit: '' }, isNew: true, optionsText: '' };
  }
  function startEdit(def: ValueDef) {
    editing = { def: { ...def }, isNew: false, optionsText: (def.options ?? []).join('\n') };
  }

  const draftOptions = $derived(editing ? cleanOptions(editing.optionsText.split('\n')) : []);
  const problem = $derived(
    editing
      ? defProblem({ ...editing.def, options: draftOptions }, defs.filter((d) => d.id !== editing!.def.id).map((d) => d.name))
      : null,
  );
  /** A value type that already holds values can't change from number to pick-list or back. */
  const kindLocked = $derived(!!editing && !editing.isNew && usage(editing.def.id).values > 0);

  async function save() {
    if (!editing || problem) return;
    const { def, isNew } = editing;
    const saved: ValueDef = {
      ...def,
      name: def.name.trim(),
      unit: def.kind === 'number' ? def.unit?.trim() || undefined : undefined,
      options: def.kind === 'choice' ? draftOptions : undefined,
      measure: def.kind === 'number' ? def.measure : undefined,
    };
    if (saved.measure === undefined) delete saved.measure;
    if (saved.uses === undefined) delete saved.uses;
    if (isNew) saved.id = newDefId(saved.name, defs.map((d) => d.id));
    await trainingState.saveValueDefs(isNew ? [...defs, saved] : defs.map((d) => (d.id === saved.id ? saved : d)));
    editing = null;
  }

  async function setArchived(def: ValueDef, archive: boolean) {
    await trainingState.saveValueDefs(defs.map((d) => (d.id === def.id ? { ...d, archived: archive || undefined } : d)));
    editing = null;
    toast.show(archive ? `${def.name} archived - old values are kept` : `${def.name} restored`);
  }

  async function remove(def: ValueDef) {
    const u = usage(def.id);
    const b = benchUsage(def.id);
    if (b.tests > 0) {
      await showAlert(`${def.name} is in use`, `${b.tests} benchmark ${b.tests === 1 ? 'test records' : 'tests record'} it. Take it out of the test${b.tests === 1 ? '' : 's'} first, or archive it instead - archiving keeps every value.`);
      return;
    }
    const used = u.values > 0 || u.trackedBy > 0;
    const ok = await showConfirm(
      `Delete ${def.name}?`,
      used
        ? `This permanently removes ${u.values} logged ${u.values === 1 ? 'value' : 'values'} across ${u.workouts} ${u.workouts === 1 ? 'session' : 'sessions'}${u.trackedBy ? ` and stops ${u.trackedBy} ${u.trackedBy === 1 ? 'exercise' : 'exercises'} tracking it` : ''}. Archive it instead to keep them.`
        : 'Nothing uses it. It will be removed.',
    );
    if (!ok) return;
    await trainingState.deleteValueDef(def.id);
    editing = null;
    toast.show(`${def.name} deleted`);
  }

  function describe(def: ValueDef): string {
    const u = usage(def.id);
    const b = benchUsage(def.id);
    const what = def.kind === 'choice' ? `pick one of ${def.options?.length ?? 0}` : def.measure ? `${def.measure}${def.unit ? `, ${def.unit}` : ''}` : def.unit ? `number, ${def.unit}` : 'number';
    const for_ = !def.uses ? 'exercises & benchmarks' : def.uses.includes('benchmark') ? 'benchmarks' : 'exercises';
    const count = u.values + b.values;
    return `${what} · ${for_} · ${count === 0 ? 'unused' : `${count} ${count === 1 ? 'value' : 'values'}`}`;
  }
</script>

<div class="card space-y-3 animate-in fade-in">
  <button onclick={() => open = !open} class="w-full flex items-center justify-between px-1 text-left" aria-expanded={open}>
    <span class="space-y-0.5">
      <span class="block text-section uppercase text-content-muted">Value types</span>
      <span class="block text-caption text-content-subtle">The numbers and pick-lists you record on exercises and in benchmark tests - weight, reps, time, edge depth, or your own. Never part of load.</span>
    </span>
    <Icon icon={open ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-xl text-content-subtle shrink-0" />
  </button>

  {#if open}
    <div class="divide-y divide-border animate-in fade-in">
      {#each active as def (def.id)}
        <button onclick={() => startEdit(def)} class="w-full flex items-center justify-between gap-3 py-2.5 text-left group">
          <span class="min-w-0"><span class="block text-body font-semibold text-content group-hover:text-primary transition-colors truncate">{def.name}</span><span class="block text-caption text-content-subtle">{describe(def)}</span></span>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
        </button>
      {:else}
        <p class="py-3 text-caption text-content-subtle italic">None yet.</p>
      {/each}
    </div>
    <button onclick={startNew} class="w-full py-2.5 text-label font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-control transition-colors flex items-center justify-center gap-1.5">
      <Icon icon="ic:baseline-add" class="text-lg" /> New value type
    </button>
    {#if archived.length}
      <div class="pt-2 space-y-1">
        <p class="text-caption uppercase text-content-subtle px-1">Archived</p>
        <div class="divide-y divide-border">
          {#each archived as def (def.id)}
            <button onclick={() => startEdit(def)} class="w-full flex items-center justify-between gap-3 py-2 text-left">
              <span class="min-w-0"><span class="block text-body text-content-muted truncate">{def.name}</span><span class="block text-caption text-content-subtle">{describe(def)}</span></span>
              <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if editing}
  {@const sheetClose = () => (editing = null)}
  <div use:portal class="fixed inset-0 pb-safe z-[100] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) sheetClose(); }}>
    <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar" use:sheetDrag={sheetClose}>
      <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-caption uppercase text-content-subtle">{editing.isNew ? 'New value type' : editing.def.archived ? 'Archived value type' : 'Value type'}</p>
          <h3 class="text-title text-content truncate">{editing.def.name.trim() || 'Untitled'}</h3>
        </div>
        <button onclick={sheetClose} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
      </div>
      <div class="p-5 space-y-5">
        <label class="block space-y-1.5">
          <span class="text-label text-content-subtle">Name</span>
          <input bind:value={editing.def.name} placeholder="e.g. Box jump height" class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border text-sm outline-none focus:border-primary/50 {problem && editing.def.name ? 'border-danger/50' : 'border-border-strong'}" />
        </label>

        <div class="space-y-1.5">
          <span class="text-label text-content-subtle block">Kind</span>
          <div class="grid grid-cols-2 gap-2">
            {#each [['number', 'A number'], ['choice', 'A pick-list']] as [kind, label]}
              <button type="button" disabled={kindLocked && editing.def.kind !== kind} onclick={() => editing!.def.kind = kind as ValueDef['kind']} class="px-3 py-2 rounded-control text-label border transition-all disabled:opacity-40 {editing.def.kind === kind ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-elevated border-border-strong text-content-muted'}">{label}</button>
            {/each}
          </div>
          {#if kindLocked}<p class="text-caption text-content-subtle">Locked - it already holds values.</p>{/if}
        </div>

        {#if editing.def.kind === 'number'}
          <div class="space-y-1.5">
            <span class="text-label text-content-subtle block">Quantity</span>
            <div class="flex flex-wrap gap-1.5">
              {#each MEASURES as m (m.id)}
                <button type="button" onclick={() => setMeasure(m.id)} aria-pressed={(editing.def.measure ?? '') === m.id} class="px-3 py-1.5 rounded-control text-label border transition-all {(editing.def.measure ?? '') === m.id ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-elevated border-border-strong text-content-muted'}">{m.label}</button>
              {/each}
            </div>
            <p class="text-caption text-content-subtle">{MEASURES.find((m) => m.id === (editing!.def.measure ?? ''))?.hint}</p>
          </div>
          <label class="block space-y-1.5">
            <span class="text-label text-content-subtle">Unit <span class="text-content-subtle/70">(optional)</span></span>
            <input bind:value={editing.def.unit} disabled={!!editing.def.measure} placeholder="m, bpm, km/h…" maxlength="12" class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 disabled:opacity-50" />
          </label>
        {:else}
          <label class="block space-y-1.5">
            <span class="text-label text-content-subtle">Options <span class="text-content-subtle/70">(one per line)</span></span>
            <textarea bind:value={editing.optionsText} rows="4" placeholder={'Flat\nHilly\nMountain'} class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 resize-y"></textarea>
          </label>
        {/if}

        {#if problem && (editing.def.name || editing.optionsText)}<p class="text-caption text-danger">{problem}</p>{/if}

        <div class="space-y-1.5">
          <span class="text-label text-content-subtle block">Use it for</span>
          <div class="grid grid-cols-2 gap-2">
            {#each [['exercise', 'Exercises'], ['benchmark', 'Benchmark tests']] as [use, label]}
              <button type="button" onclick={() => toggleUse(use as 'exercise' | 'benchmark')} aria-pressed={hasUse(use as 'exercise' | 'benchmark')} class="px-3 py-2 rounded-control text-label border transition-all {hasUse(use as 'exercise' | 'benchmark') ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'bg-surface-elevated border-border-strong text-content-muted'}">{label}</button>
            {/each}
          </div>
          <p class="text-caption text-content-subtle">Switch it on for an exercise under Exercises → the exercise → What it tracks, or add it to a test under Benchmarks.</p>
        </div>

        <div class="flex gap-2">
          <button onclick={save} disabled={!!problem} class="flex-1 py-3 bg-primary text-white text-label font-bold rounded-control disabled:opacity-40">Save</button>
          <button onclick={sheetClose} class="px-5 py-3 bg-surface-elevated text-content-muted text-label font-bold rounded-control">Cancel</button>
        </div>

        {#if !editing.isNew}
          <div class="pt-3 border-t border-border space-y-2">
            <button onclick={() => setArchived(editing!.def, !editing!.def.archived)} class="w-full py-2.5 text-label font-bold text-content-muted hover:text-content bg-surface-elevated rounded-control transition-colors">{editing.def.archived ? 'Restore' : 'Archive - keep the values, stop new use'}</button>
            <button onclick={() => remove(editing!.def)} class="w-full py-2.5 text-label font-bold text-danger hover:bg-danger/10 rounded-control transition-colors">Delete for good…</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
