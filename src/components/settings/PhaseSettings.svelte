<script lang="ts">
  import { scopedUndo } from '../../lib/toast.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import type { PhaseDef, WorkoutTemplate } from '../../lib/types';
  import PhaseTemplateEditor from './PhaseTemplateEditor.svelte';
  import Icon from "@iconify/svelte";
  import ColorPicker from './ColorPicker.svelte';
  import { DEFAULT_COLOR } from './colorChoices';
  import { showUndo } from '../../lib/toast.svelte';

  let {
    phaseDefs = $bindable(),
    templates = $bindable(),
    onResetAllTemplates,
  }: {
    phaseDefs: PhaseDef[];
    templates: Record<string, WorkoutTemplate[]>;
    onResetAllTemplates: () => void | Promise<void>;
  } = $props();

  let formError = $state('');

  let editingPhase = $state<PhaseDef | null>(null);
  let isAddingPhase = $state(false);
  let expandedPhaseId = $state<string | null>(null);
  let showStarterLibrary = $state(false);

  const sortedPhaseDefs = $derived([...phaseDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  function togglePhaseExpanded(id: string) {
    expandedPhaseId = expandedPhaseId === id ? null : id;
  }

  function startAddPhase() {
    const maxOrder = phaseDefs.reduce((acc, p) => Math.max(acc, p.order ?? 0), 0);
    editingPhase = {
      id: generateId(),
      name: 'New phase',
      color: DEFAULT_COLOR,
      order: maxOrder + 1,
    };
    formError = '';
    isAddingPhase = true;
  }

  function savePhase() {
    if (!editingPhase) return;

    const name = editingPhase.name.trim();
    if (!name) {
      formError = 'Give the phase a name.';
      return;
    }

    const isDuplicate = phaseDefs.some(p =>
      p.id !== editingPhase?.id &&
      p.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      formError = 'A phase with this name already exists.';
      return;
    }

    const index = phaseDefs.findIndex(p => p.id === editingPhase?.id);
    if (index !== -1) {
      phaseDefs[index] = { ...editingPhase, name };
    } else {
      phaseDefs.push({ ...editingPhase, name });
    }
    // Closing is enough: nulling the edited object too would make the
    // form's still-bound inputs read a field of null before the form is gone.
    isAddingPhase = false;
  }

  const undoable = scopedUndo();
  function deletePhase(id: string) {
    const index = phaseDefs.findIndex(p => p.id === id);
    if (index === -1) return;
    const removed = $state.snapshot(phaseDefs[index]) as PhaseDef;
    phaseDefs = phaseDefs.filter(p => p.id !== id);
    if (expandedPhaseId === id) expandedPhaseId = null;
    undoable(`${removed.name} deleted`, () => {
      if (!phaseDefs.some(p => p.id === removed.id)) phaseDefs = [...phaseDefs.slice(0, index), removed, ...phaseDefs.slice(index)];
    });
  }

  function movePhase(id: string, direction: 'up' | 'down') {
    const sorted = sortedPhaseDefs;
    const index = sorted.findIndex(p => p.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return;

    const a = phaseDefs.find(p => p.id === sorted[index].id)!;
    const b = phaseDefs.find(p => p.id === sorted[swapIndex].id)!;
    const tempOrder = a.order;
    a.order = b.order;
    b.order = tempOrder;
  }

  async function loadStarterSet(setId: string) {
    const set = DEFAULT_TEMPLATE_LIBRARY.find(s => s.id === setId);
    if (!set) return;
    const replaced = Object.keys(set.templates).map((id) => phaseDefs.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
    const confirmed = await showConfirm(
      'Load this starter set?',
      `"${set.name}" replaces the default sessions of ${replaced.length > 0 ? replaced.join(', ') : 'the phases it covers'}. Weeks you already changed keep theirs. You can undo this right after.`,
      { ok: 'Replace sessions', cancel: 'Keep mine' },
    );
    if (!confirmed) return;
    const before = $state.snapshot(templates);
    templates = { ...templates, ...JSON.parse(JSON.stringify(set.templates)) };
    showStarterLibrary = false;
    showUndo(`"${set.name}" loaded`, () => { templates = before; });
  }
</script>

<div class="card space-y-4">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Training phases</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The blocks of weeks (for example Strength or Deload) you set on the Plan calendar. Tap a phase to edit the sessions it starts with when you set it on a week.</p>
  </div>

  {#if isAddingPhase && editingPhase}
    <div class="p-4 bg-surface-elevated/50 rounded-card space-y-4 animate-in zoom-in-95">
      <div class="space-y-3">
        <div class="space-y-1">
          <label for="phase-name" class="text-label text-content-subtle ml-1">Phase name</label>
          <input id="phase-name" bind:value={editingPhase.name} oninput={() => (formError = '')} aria-invalid={formError ? 'true' : undefined} aria-describedby={formError ? 'phase-name-error' : undefined} class="field" placeholder="e.g. Hypertrophy" />
          {#if formError}<p id="phase-name-error" class="text-caption text-danger ml-1" role="alert">{formError}</p>{/if}
        </div>
        <div class="space-y-1"><p class="text-label text-content-subtle ml-1">Colour</p>
          <ColorPicker value={editingPhase.color ?? DEFAULT_COLOR} onChange={(c) => (editingPhase!.color = c)} label="Phase colour" />
        </div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={savePhase} class="btn btn-primary flex-1">Save</button><button onclick={() => (isAddingPhase = false)} class="btn btn-secondary">Cancel</button></div>
    </div>
  {:else}
    <div class="divide-y divide-border">
      {#each sortedPhaseDefs as phase, index (phase.id)}
        <div>
          <div class="flex items-center justify-between py-3 group">
            <button
              onclick={() => togglePhaseExpanded(phase.id)}
              class="flex items-center gap-3 flex-1 min-w-0 min-h-11 text-left"
              aria-expanded={expandedPhaseId === phase.id}
            >
              <div class="w-3 h-3 rounded-full flex-shrink-0 {phase.color || 'bg-status-neutral'}"></div>
              <div class="min-w-0 flex-1">
                <p class="text-body font-bold text-content truncate">{phase.name}</p>
                <p class="text-caption text-content-subtle">{(templates[phase.id] || []).length} session{(templates[phase.id] || []).length === 1 ? '' : 's'}</p>
              </div>
              <Icon icon="ic:baseline-expand-more" class="text-content-subtle text-lg flex-shrink-0 transition-transform {expandedPhaseId === phase.id ? 'rotate-180' : ''}" />
            </button>
            <div class="flex items-center flex-shrink-0">
              <button onclick={() => movePhase(phase.id, 'up')} disabled={index === 0} class="btn-icon disabled:opacity-30" aria-label="Move {phase.name} up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
              <button onclick={() => movePhase(phase.id, 'down')} disabled={index === sortedPhaseDefs.length - 1} class="btn-icon disabled:opacity-30" aria-label="Move {phase.name} down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
              <button onclick={() => { editingPhase = { ...phase }; formError = ''; isAddingPhase = true; }} class="btn-icon" aria-label="Edit {phase.name}"><Icon icon="ic:baseline-edit" class="text-xl" /></button>
              <button onclick={() => deletePhase(phase.id)} class="btn-icon hover:text-danger" aria-label="Delete {phase.name}"><Icon icon="ic:baseline-delete" class="text-xl" /></button>
            </div>
          </div>
          {#if expandedPhaseId === phase.id}
            <div class="pb-3.5 animate-in fade-in">
              <PhaseTemplateEditor bind:templates phaseId={phase.id} />
            </div>
          {/if}
        </div>
      {/each}
      <button onclick={startAddPhase} class="w-full min-h-11 py-3 rounded-control hover:bg-surface-elevated/50 flex items-center justify-center gap-2 text-primary transition-colors"><Icon icon="ic:baseline-plus" /><span class="text-label">Add phase</span></button>
    </div>
  {/if}

  <div class="pt-2 border-t border-border space-y-3">
    <button onclick={() => showStarterLibrary = !showStarterLibrary} class="w-full flex items-center justify-between py-2 text-left group">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-library-books" class="text-lg text-content-subtle" />
        <div class="text-left">
          <p class="text-body font-bold text-content">Starter sets by level</p>
          <p class="text-caption text-content-subtle">Replace the phases' sessions with a ready-made set for your level</p>
        </div>
      </div>
      <Icon icon="ic:baseline-expand-more" class="text-content-subtle text-lg transition-transform {showStarterLibrary ? 'rotate-180' : ''}" />
    </button>

    {#if showStarterLibrary}
      <div class="divide-y divide-border animate-in fade-in">
        {#each DEFAULT_TEMPLATE_LIBRARY as set (set.id)}
          <div class="flex items-center justify-between py-3">
            <div class="min-w-0 flex-1 pr-3">
              <p class="text-body font-bold text-content truncate">{set.name}</p>
              {#if set.description}<p class="text-caption text-content-subtle mt-0.5 leading-relaxed">{set.description}</p>{/if}
            </div>
            <button onclick={() => loadStarterSet(set.id)} class="btn btn-secondary shrink-0">Load</button>
          </div>
        {:else}
          <p class="text-caption text-content-subtle italic px-1">No starter sets available.</p>
        {/each}
      </div>
    {/if}

    <button onclick={onResetAllTemplates} class="btn btn-ghost w-full hover:text-danger">Reset all session templates</button>
  </div>
</div>
