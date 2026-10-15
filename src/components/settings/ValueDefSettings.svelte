<script lang="ts">
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
  import Sheet from '../ui/Sheet.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const sheetClose = () => (editing = null);
  // svelte-ignore state_referenced_locally
  let initialDraft = '';
  let editing = $state<{ def: ValueDef; isNew: boolean; optionsText: string } | null>(null);

  const dirty = $derived(editing !== null && JSON.stringify({ d: editing.def, o: editing.optionsText }) !== initialDraft);

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
    initialDraft = JSON.stringify({ d: editing.def, o: editing.optionsText });
  }
  function startEdit(def: ValueDef) {
    editing = { def: { ...def }, isNew: false, optionsText: (def.options ?? []).join('\n') };
    initialDraft = JSON.stringify({ d: editing.def, o: editing.optionsText });
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
      await showAlert(`${def.name} is in use`, `${b.tests} ${b.tests === 1 ? 'test records' : 'tests record'} it. Take it out of the test${b.tests === 1 ? '' : 's'} first, or archive it instead - archiving keeps every value.`);
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
    const for_ = !def.uses ? 'exercises and tests' : def.uses.includes('benchmark') ? 'tests' : 'exercises';
    const count = u.values + b.values;
    return `${what} · ${for_} · ${count === 0 ? 'unused' : `${count} ${count === 1 ? 'value' : 'values'}`}`;
  }
</script>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-0.5 px-1">
    <h2 class="text-section uppercase text-content-muted">Value types</h2>
    <p class="text-caption text-content-subtle">The numbers and pick-lists you record on exercises and in tests: weight, reps, time, edge depth, or your own. Never part of load.</p>
  </div>

    <div class="divide-y divide-border animate-in fade-in">
      {#each active as def (def.id)}
        <button onclick={() => startEdit(def)} class="w-full flex items-center justify-between gap-3 py-2.5 min-h-11 text-left group">
          <span class="min-w-0"><span class="block text-body font-semibold text-content group-hover:text-primary transition-colors truncate">{def.name}</span><span class="block text-caption text-content-subtle">{describe(def)}</span></span>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl shrink-0" />
        </button>
      {:else}
        <p class="py-3 text-caption text-content-subtle italic">None yet.</p>
      {/each}
    </div>
    <button onclick={startNew} class="btn btn-secondary w-full gap-1.5 text-primary">
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
</div>

{#if editing}
  <Sheet
    title={editing.def.name.trim() || (editing.isNew ? 'New value type' : 'Value type')}
    subtitle={editing.isNew ? 'New value type' : editing.def.archived ? 'Archived value type' : 'Value type'}
    {dirty}
    onClose={sheetClose}
  >
    <label class="block space-y-1.5">
      <span class="text-label text-content-subtle">Name</span>
      <input bind:value={editing.def.name} placeholder="e.g. Box jump height" class="field {problem && editing.def.name ? '!border-danger' : ''}" />
    </label>

    <div class="space-y-1.5">
      <span class="text-label text-content-subtle block">Kind</span>
      <Segmented
        variant="setting"
        full
        label="Kind of value"
        value={editing.def.kind}
        onChange={(kind) => (editing!.def.kind = kind)}
        options={[{ value: 'number', label: 'A number', disabled: kindLocked && editing.def.kind !== 'number' }, { value: 'choice', label: 'A pick-list', disabled: kindLocked && editing.def.kind !== 'choice' }]}
      />
      {#if kindLocked}<p class="text-caption text-content-subtle">Locked: it already holds values.</p>{/if}
    </div>

    {#if editing.def.kind === 'number'}
      <div class="space-y-1.5">
        <span class="text-label text-content-subtle block">Quantity</span>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="Quantity">
          {#each MEASURES as m (m.id)}
            <button type="button" onclick={() => setMeasure(m.id)} aria-pressed={(editing.def.measure ?? '') === m.id} class="chip {(editing.def.measure ?? '') === m.id ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'text-content-muted'}">{m.label}</button>
          {/each}
        </div>
        <p class="text-caption text-content-subtle">{MEASURES.find((m) => m.id === (editing!.def.measure ?? ''))?.hint}</p>
      </div>
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Unit (optional)</span>
        <input bind:value={editing.def.unit} disabled={!!editing.def.measure} placeholder="m, bpm, km/h" maxlength="12" class="field disabled:opacity-50" />
      </label>
    {:else}
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Options (one per line)</span>
        <textarea bind:value={editing.optionsText} rows="4" placeholder={'Flat\nHilly\nMountain'} class="field resize-y"></textarea>
      </label>
    {/if}

    {#if problem}<p class="text-caption {editing.def.name || editing.optionsText ? 'text-danger' : 'text-content-subtle'}" role={editing.def.name || editing.optionsText ? 'alert' : undefined}>{problem}</p>{/if}

    <div class="space-y-1">
      <span class="text-label text-content-subtle block">Use it for</span>
      <Toggle checked={hasUse('exercise')} onChange={() => toggleUse('exercise')} label="Exercises" />
      <Toggle checked={hasUse('benchmark')} onChange={() => toggleUse('benchmark')} label="Tests" />
      <p class="text-caption text-content-subtle">Switch it on for an exercise under Exercises, the exercise, What it tracks. Or add it to a test under Tests. At least one must stay on.</p>
    </div>

    {#if !editing.isNew}
      <div class="pt-3 border-t border-border space-y-2">
        <button onclick={() => setArchived(editing!.def, !editing!.def.archived)} class="btn btn-secondary w-full">{editing.def.archived ? 'Restore' : 'Archive (keep the values, stop new use)'}</button>
        <button onclick={() => remove(editing!.def)} class="btn btn-danger w-full">Delete for good</button>
      </div>
    {/if}

    {#snippet footer()}
      <button onclick={save} disabled={!!problem} class="btn btn-primary flex-1">Save</button>
      <button onclick={sheetClose} class="btn btn-secondary">Cancel</button>
    {/snippet}
  </Sheet>
{/if}
