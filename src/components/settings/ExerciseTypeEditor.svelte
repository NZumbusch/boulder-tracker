<script lang="ts">
  import { PER_SET_KEYS, DEFAULT_PER_SET } from '../../lib/exercise/setRows';
  /**
   * One exercise in the library, as a sheet: name, group, how-to, which
   * fields it tracks, its chart category and default load. Edits a draft;
   * nothing changes until Save. Archive / Restore / Delete live here too -
   * Delete only for an exercise nothing uses yet, since deleting one that
   * sessions, phases or circuits point at would leave them "Unknown".
   */
  import Sheet from '../ui/Sheet.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { showConfirm } from '../../lib/utils';
  import { PARAMETER_LABELS } from '../../lib/constants';
  import type { ExerciseTypeDef, ParameterBlock, AnalyticsCategory } from '../../lib/types';
  import { exerciseGroup } from '../../lib/exercise/library';
  import { trainingState } from '../../lib/state.svelte';
  import { customParam, usableFor } from '../../lib/exercise/valueDefs';
  import RangeSlider from '../common/RangeSlider.svelte';
  import Icon from '@iconify/svelte';

  let { type, isNew = false, groups, analyticsCategories, takenNames, referenced = false, onSave, onArchive = () => {}, onDelete = () => {}, onClose, layer = 'z-[100]' }: {
    type: ExerciseTypeDef;
    /** Stacking class - the exercise picker opens it above itself. */
    layer?: string;
    isNew?: boolean;
    /** Existing group names, for one-tap picking. */
    groups: string[];
    analyticsCategories: AnalyticsCategory[];
    /** Other exercises' names, lower-cased - a name must be unique. */
    takenNames: Set<string>;
    /** Sessions, phases or circuits use it: it can be archived, not deleted. */
    referenced?: boolean;
    onSave: (type: ExerciseTypeDef) => void;
    onArchive?: (archived: boolean) => void;
    onDelete?: () => void;
    onClose: () => void;
  } = $props();

  // A draft, seeded once when the sheet opens.
  // svelte-ignore state_referenced_locally
  let draft = $state<ExerciseTypeDef>({ ...type, group: exerciseGroup(type), parameters: [...type.parameters], possibleParameters: type.possibleParameters ? [...type.possibleParameters] : undefined });
  // svelte-ignore state_referenced_locally
  let load = $state(type.defaultPlannedLoad ?? 5);
  // svelte-ignore state_referenced_locally
  const initial = JSON.stringify({ draft, load });
  const dirty = $derived(JSON.stringify({ draft, load }) !== initial);
  let triedToSave = $state(false);

  async function deleteForGood() {
    if (await showConfirm('Delete this exercise?', `${trimmedName || 'It'} is not used anywhere yet. This cannot be undone.`, { ok: 'Delete', cancel: 'Keep' })) onDelete();
  }

  const trimmedName = $derived(draft.name.trim());
  const nameError = $derived(!trimmedName ? 'Give it a name.' : takenNames.has(trimmedName.toLowerCase()) ? 'Another exercise already has this name.' : null);
  const groupChoices = $derived([...new Set([...groups, draft.group?.trim() || ''].filter(Boolean))].sort((a, b) => a.localeCompare(b)));

  /** Built-in fields, then the user's own value types (an archived one only while this exercise still tracks it). */
  const parameterBlocks = $derived<{ id: ParameterBlock; label: string }[]>([
    ...Object.entries(PARAMETER_LABELS).map(([id, label]) => ({ id: id as ParameterBlock, label })),
    ...trainingState.valueDefs
      .filter((d) => (!d.archived && usableFor(d, 'exercise')) || (draft.possibleParameters ?? draft.parameters).includes(customParam(d.id)))
      .map((d) => ({ id: customParam(d.id), label: d.unit ? `${d.name} (${d.unit})` : d.name })),
  ]);

  /** A field is off, offered ("possible": can be switched on per exercise in a session) or on by default. */
  function setParam(param: ParameterBlock, state: 'off' | 'possible' | 'default') {
    const possible = (draft.possibleParameters ?? [...draft.parameters]).filter((p) => p !== param);
    const defaults = draft.parameters.filter((p) => p !== param);
    if (state === 'off') {
      draft.parameters = defaults;
      draft.possibleParameters = possible;
    } else if (state === 'possible') {
      draft.parameters = defaults;
      draft.possibleParameters = [...possible, param];
    } else {
      draft.parameters = [...defaults, param];
      draft.possibleParameters = [...possible, param];
    }
  }

  /** What can differ set to set: the type's own choice, else the app's defaults - among what it tracks. */
  const perSetBlocks = $derived(PER_SET_KEYS.filter((k) => (draft.possibleParameters ?? draft.parameters).includes(k as ParameterBlock) || draft.parameters.includes(k as ParameterBlock)));
  const perSetOn = $derived(new Set<string>(draft.perSetParameters ?? DEFAULT_PER_SET));
  function togglePerSet(k: string) {
    const next = new Set(perSetOn);
    if (next.has(k)) next.delete(k); else next.add(k);
    draft.perSetParameters = [...next] as ParameterBlock[];
  }

  function save() {
    triedToSave = true;
    if (nameError) return;
    const group = draft.group?.trim();
    const description = draft.description?.trim();
    onSave({
      ...draft,
      name: trimmedName,
      group: group || undefined,
      description: description || undefined,
      defaultPlannedLoad: load,
    });
  }

</script>

<Sheet
  title={isNew ? 'New exercise' : trimmedName || 'Exercise'}
  subtitle={isNew ? undefined : type.archived ? 'Archived exercise' : 'Exercise'}
  level={layer === 'z-[100]' ? 'sheet' : 'top'}
  {dirty}
  {onClose}
>
  <label class="block space-y-1.5">
    <span class="text-label text-content-subtle">Name</span>
    <input
      bind:value={draft.name}
      placeholder="e.g. Hip flexor stretch"
      aria-invalid={nameError && (draft.name || triedToSave) ? 'true' : undefined}
      class="field {nameError && (draft.name || triedToSave) ? '!border-danger' : ''}"
    />
    {#if nameError && (draft.name || triedToSave)}<span class="block text-caption text-danger" role="alert">{nameError}</span>{/if}
  </label>

  <div class="space-y-2">
    <span class="text-label text-content-subtle block">Group</span>
    {#if groupChoices.length > 0}
      <div class="flex flex-wrap gap-1.5">
        {#each groupChoices as g}
          <button
            type="button"
            onclick={() => draft.group = g}
            aria-pressed={draft.group?.trim() === g}
            class="chip {draft.group?.trim() === g ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'text-content-muted hover:text-content'}"
          >{g}</button>
        {/each}
      </div>
    {/if}
    <input
      bind:value={draft.group}
      aria-label="Group name"
      placeholder="or type a new group"
      class="field"
    />
  </div>

  <label class="block space-y-1.5">
    <span class="text-label text-content-subtle">How to do it (optional)</span>
    <textarea
      bind:value={draft.description}
      rows="3"
      placeholder="Setup and the cues that matter. The numbers go on each session."
      class="field resize-y"
    ></textarea>
  </label>

  <div class="space-y-1">
    <span class="text-label text-content-subtle block">What it tracks</span>
    <p class="text-caption text-content-subtle">Switch on the numbers you log for this exercise. Then choose whether each one is filled in from the start or only offered when you want it.</p>
    <div class="divide-y divide-border">
      {#each parameterBlocks as block (block.id)}
        {@const on = draft.parameters.includes(block.id)}
        {@const possible = (draft.possibleParameters ?? draft.parameters).includes(block.id)}
        <div>
          <Toggle checked={possible || on} onChange={(v) => setParam(block.id, v ? 'possible' : 'off')} label={block.label} />
          {#if possible || on}
            <div class="pl-4">
              <Toggle checked={on} onChange={(v) => setParam(block.id, v ? 'default' : 'possible')} label="Filled in from the start" hint={on ? undefined : 'Off: offered, switched on per session when needed'} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  {#if perSetBlocks.length > 0}
    <div class="space-y-2">
      <span class="text-label text-content-subtle block">Can differ from set to set</span>
      <p class="text-caption text-content-subtle">When logging, these can get their own number for each set (for example the weight of each pull-up set).</p>
      <div class="flex flex-wrap gap-2">
        {#each perSetBlocks as k (k)}
          {@const on = perSetOn.has(k)}
          <button type="button" onclick={() => togglePerSet(k)} aria-pressed={on} class="chip rounded-full {on ? 'bg-primary/10 border-primary/40 text-primary' : 'text-content-muted'}">
            <Icon icon={on ? 'ic:baseline-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-sm" />
            {PARAMETER_LABELS[k as keyof typeof PARAMETER_LABELS] ?? k}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <label class="block space-y-1.5">
    <span class="text-label text-content-subtle">Analytics category</span>
    <select bind:value={draft.category} class="field">
      {#each analyticsCategories.filter((c) => !c.archived || c.name === draft.category) as cat}
        <option value={cat.name}>{cat.name}</option>
      {/each}
    </select>
    <span class="block text-caption text-content-subtle">The Analytics charts add up by category. The group above is only where you find the exercise in the library.</span>
  </label>

  <div class="space-y-1">
    <span class="flex justify-between text-label text-content-subtle">
      <span>Default planned load</span>
      <span class="tabular-nums text-content">{load} of 10</span>
    </span>
    <RangeSlider bind:value={load} label="Default planned load" unit="out of 10" />
    <span class="flex justify-between text-caption text-content-subtle"><span>1 easy, like stretching</span><span>10 as hard as a session gets</span></span>
    <span class="block text-caption text-content-subtle">How taxing a normal dose of this exercise is. It sets the planned load of sessions that include it.</span>
  </div>

  {#if !isNew}
    <div class="pt-4 border-t border-border space-y-2">
      {#if type.archived}
        <button onclick={() => onArchive(false)} class="btn btn-secondary w-full gap-1.5 text-primary">
          <Icon icon="ic:baseline-unarchive" class="text-base" /> Restore to the library
        </button>
      {:else}
        <button onclick={() => onArchive(true)} class="btn btn-secondary w-full gap-1.5">
          <Icon icon="ic:baseline-archive" class="text-base" /> Archive
        </button>
        <p class="text-caption text-content-subtle text-center">Hidden from pickers and the AI coach; history, phases and circuits keep using it.</p>
      {/if}
      {#if !referenced}
        <button onclick={deleteForGood} class="btn btn-danger w-full">Delete (nothing uses it yet)</button>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <button onclick={save} class="btn btn-primary flex-1" aria-describedby={nameError ? 'exercise-save-why' : undefined}>
      {isNew ? 'Add to library' : 'Save'}
    </button>
    <button onclick={onClose} class="btn btn-secondary">Cancel</button>
    {#if nameError && !draft.name && triedToSave}<span id="exercise-save-why" class="sr-only">{nameError}</span>{/if}
  {/snippet}
</Sheet>
