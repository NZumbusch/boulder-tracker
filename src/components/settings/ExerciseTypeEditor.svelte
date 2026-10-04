<script lang="ts">
  import { portal } from '../../lib/ui/portal';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  /**
   * One exercise in the library, as a sheet: name, group, how-to, which
   * fields it tracks, its chart category and default load. Edits a draft;
   * nothing changes until Save. Archive / Restore / Delete live here too -
   * Delete only for an exercise nothing uses yet, since deleting one that
   * sessions, phases or circuits point at would leave them "Unknown".
   */
  import { backWhile } from '../../lib/navigation/backStack.svelte';
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
  let confirmDelete = $state(false);

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

  /** Off -> possible -> default -> off: "possible" fields can be switched on per exercise, "default" ones come switched on. */
  function cycleParam(param: ParameterBlock) {
    const possible = draft.possibleParameters ?? [...draft.parameters];
    if (draft.parameters.includes(param)) {
      draft.parameters = draft.parameters.filter((p) => p !== param);
      draft.possibleParameters = possible.filter((p) => p !== param);
    } else if (possible.includes(param)) {
      draft.parameters = [...draft.parameters, param];
      draft.possibleParameters = possible;
    } else {
      draft.possibleParameters = [...possible, param];
    }
  }

  function save() {
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

  backWhile(() => true, () => onClose());
</script>

<div use:portal class="fixed inset-0 pb-safe {layer} flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onClose()}>
    <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-5 py-4 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase text-content-subtle">{isNew ? 'New exercise' : type.archived ? 'Archived exercise' : 'Exercise'}</p>
        <h3 class="text-title text-content truncate">{trimmedName || 'Untitled'}</h3>
      </div>
      <button onclick={onClose} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="p-5 space-y-5">
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Name</span>
        <input
          bind:value={draft.name}
          placeholder="e.g. Hip flexor stretch"
          class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border text-sm outline-none focus:border-primary/50 {nameError && draft.name ? 'border-danger/50' : 'border-border-strong'}"
        />
        {#if nameError && draft.name}<span class="block text-caption text-danger">{nameError}</span>{/if}
      </label>

      <div class="space-y-2">
        <span class="text-label text-content-subtle block">Group</span>
        {#if groupChoices.length > 0}
          <div class="flex flex-wrap gap-1.5">
            {#each groupChoices as g}
              <button
                type="button"
                onclick={() => draft.group = g}
                class="chip {draft.group?.trim() === g ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'text-content-muted hover:text-content'}"
              >{g}</button>
            {/each}
          </div>
        {/if}
        <input
          bind:value={draft.group}
          placeholder="…or type a new group"
          class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50"
        />
      </div>

      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">How to do it <span class="text-content-subtle/70">(optional)</span></span>
        <textarea
          bind:value={draft.description}
          rows="3"
          placeholder="Setup and the cues that matter - the numbers go on each session."
          class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 resize-y placeholder:text-content-subtle"
        ></textarea>
      </label>

      <div class="space-y-2">
        <span class="text-label text-content-subtle block">What it tracks</span>
        <p class="text-caption text-content-subtle">Tap to cycle: off → possible (can be switched on per exercise) → on by default.</p>
        <div class="grid grid-cols-2 gap-2">
          {#each parameterBlocks as block}
            {@const on = draft.parameters.includes(block.id)}
            {@const possible = (draft.possibleParameters ?? draft.parameters).includes(block.id)}
            <button
              type="button"
              onclick={() => cycleParam(block.id)}
              class="px-3 py-2 rounded-control text-label border transition-all flex items-center justify-between gap-2 {on ? 'bg-primary/10 border-primary/40 text-primary' : possible ? 'bg-surface-elevated border-border-strong text-content' : 'bg-surface border-border/50 text-content-subtle'}"
            >
              <span class="flex items-center gap-2 min-w-0">
                <Icon icon={on ? 'ic:baseline-check-box' : possible ? 'ic:baseline-indeterminate-check-box' : 'ic:baseline-check-box-outline-blank'} class="text-sm shrink-0" />
                <span class="truncate">{block.label}</span>
              </span>
              <span class="text-caption opacity-60 shrink-0">{on ? 'Default' : possible ? 'Possible' : ''}</span>
            </button>
          {/each}
        </div>
      </div>

      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Analytics category</span>
        <select bind:value={draft.category} class="w-full px-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm outline-none">
          {#each analyticsCategories.filter((c) => !c.archived || c.name === draft.category) as cat}
            <option value={cat.name}>{cat.name}</option>
          {/each}
        </select>
        <span class="block text-caption text-content-subtle">Only groups load on the Analytics charts - the group above is where you find it.</span>
      </label>

      <div class="space-y-1">
        <span class="flex justify-between text-label text-content-subtle">
          <span>Default planned load</span>
          <span class="tabular-nums text-content">{load}/10</span>
        </span>
        <RangeSlider bind:value={load} label="Default planned load" />
        <span class="block text-caption text-content-subtle">Expected stress of a standard session of it.</span>
      </div>

      {#if !isNew}
        <div class="pt-4 border-t border-border space-y-2">
          {#if type.archived}
            <button onclick={() => onArchive(false)} class="w-full py-2.5 text-label font-bold text-primary bg-primary/10 hover:bg-primary/15 rounded-control flex items-center justify-center gap-1.5">
              <Icon icon="ic:baseline-unarchive" class="text-base" /> Restore to the library
            </button>
          {:else}
            <button onclick={() => onArchive(true)} class="w-full py-2.5 text-label font-bold text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control flex items-center justify-center gap-1.5">
              <Icon icon="ic:baseline-archive" class="text-base" /> Archive
            </button>
            <p class="text-caption text-content-subtle text-center">Hidden from pickers and the AI coach; history, phases and circuits keep using it.</p>
          {/if}
          {#if !referenced}
            {#if confirmDelete}
              <div class="flex gap-2">
                <button onclick={onDelete} class="flex-1 py-2.5 text-label font-bold text-white bg-danger rounded-control">Delete for good</button>
                <button onclick={() => confirmDelete = false} class="px-4 py-2.5 text-label font-bold text-content-muted bg-surface-elevated rounded-control">Keep</button>
              </div>
            {:else}
              <button onclick={() => confirmDelete = true} class="w-full py-2 text-label text-content-subtle hover:text-danger transition-colors">Delete — nothing uses it yet</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <div class="sticky bottom-0 bg-surface/95 backdrop-blur-sm border-t border-border px-5 py-4 flex gap-2">
      <button onclick={save} disabled={!!nameError} class="flex-1 py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control disabled:opacity-40 transition-all active:scale-[0.98]">
        {isNew ? 'Add to library' : 'Save'}
      </button>
      <button onclick={onClose} class="px-5 py-3 bg-surface-elevated text-content-muted text-label font-bold rounded-control">Cancel</button>
    </div>
  </div>
</div>
