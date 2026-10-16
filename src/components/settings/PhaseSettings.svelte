<script lang="ts">
  import { untrack } from 'svelte';
  import { storage } from '../../lib/storage';
  import { reinsertById } from '../../lib/exercise/reinsert';
  import { trainingState } from '../../lib/state.svelte';
  import { scopedUndo } from '../../lib/toast.svelte';
  import { generateId, showConfirm } from '../../lib/utils';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import type { PhaseDef, WorkoutTemplate } from '../../lib/types';
  import PhaseTemplateEditor from './PhaseTemplateEditor.svelte';
  import Icon from "@iconify/svelte";
  import ColorPicker from './ColorPicker.svelte';
  import { DEFAULT_COLOR } from './colorChoices';
  import { showUndo } from '../../lib/toast.svelte';

  /**
   * The phases are a list; a tap opens one phase on a page of its own (`phaseId`, owned by Settings so its back
   * arrow and title follow): its name and colour, the sessions it starts with, and Delete.
   */
  let {
    phaseDefs = $bindable(),
    templates = $bindable(),
    phaseId = $bindable(null),
    onResetAllTemplates,
  }: {
    phaseDefs: PhaseDef[];
    templates: Record<string, WorkoutTemplate[]>;
    phaseId?: string | null;
    onResetAllTemplates: () => void | Promise<void>;
  } = $props();

  let formError = $state('');

  let editingPhase = $state<PhaseDef | null>(null);
  let isAddingPhase = $state(false);
  let showStarterLibrary = $state(false);

  const sortedPhaseDefs = $derived([...phaseDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  const openPhase = $derived(phaseId ? phaseDefs.find((p) => p.id === phaseId) ?? null : null);

  // The open phase's name and colour are edited as a draft and written with Save.
  let draftName = $state('');
  let draftColor = $state(DEFAULT_COLOR);
  let detailError = $state('');
  $effect(() => {
    const p = openPhase;
    untrack(() => {
      draftName = p?.name ?? '';
      draftColor = p?.color ?? DEFAULT_COLOR;
      detailError = '';
    });
  });
  const detailDirty = $derived(!!openPhase && (draftName !== openPhase.name || draftColor !== (openPhase.color ?? DEFAULT_COLOR)));

  function saveDetail() {
    if (!openPhase) return;
    const name = draftName.trim();
    if (!name) { detailError = 'Give the phase a name.'; return; }
    if (phaseDefs.some((p) => p.id !== openPhase!.id && p.name.toLowerCase() === name.toLowerCase())) { detailError = 'A phase with this name already exists.'; return; }
    const index = phaseDefs.findIndex((p) => p.id === openPhase!.id);
    phaseDefs[index] = { ...phaseDefs[index], name, color: draftColor };
    detailError = '';
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
    if (phaseId === id) phaseId = null;
    undoable(`${removed.name} deleted`, () => {
      phaseDefs = reinsertById(phaseDefs, removed, index);
    }, async () => {
      await storage.savePhaseDefs(reinsertById(await storage.getPhaseDefs(), removed, index));
      await trainingState.refresh();
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

{#if openPhase}
  <div class="space-y-4">
    <div class="card space-y-4 animate-in fade-in">
      <h2 class="text-section uppercase text-content-muted px-1">Name and colour</h2>
      <div class="space-y-1">
        <label for="phase-detail-name" class="text-label text-content-subtle ml-1">Phase name</label>
        <input id="phase-detail-name" bind:value={draftName} oninput={() => (detailError = '')} aria-invalid={detailError ? 'true' : undefined} aria-describedby={detailError ? 'phase-detail-error' : undefined} class="field" placeholder="e.g. Hypertrophy" />
        {#if detailError}<p id="phase-detail-error" class="text-caption text-danger ml-1" role="alert">{detailError}</p>{/if}
      </div>
      <div class="space-y-1"><p class="text-label text-content-subtle ml-1">Colour</p>
        <ColorPicker value={draftColor} onChange={(c) => (draftColor = c)} label="Phase colour" />
      </div>
      {#if detailDirty}
        <div class="flex gap-2 animate-in fade-in">
          <button onclick={saveDetail} class="btn btn-primary flex-1">Save</button>
          <button onclick={() => { draftName = openPhase.name; draftColor = openPhase.color ?? DEFAULT_COLOR; detailError = ''; }} class="btn btn-secondary">Cancel</button>
        </div>
      {/if}
    </div>

    <div class="card space-y-3 animate-in fade-in">
      <div class="space-y-2">
        <h2 class="text-section uppercase text-content-muted px-1">Sessions it starts with</h2>
        <p class="text-caption text-content-subtle px-1 leading-relaxed">What a week gets when you set this phase on it on the Plan calendar. Weeks you already changed keep theirs.</p>
      </div>
      <PhaseTemplateEditor bind:templates phaseId={openPhase.id} />
    </div>

    <button onclick={() => deletePhase(openPhase.id)} class="btn btn-ghost w-full hover:text-danger"><Icon icon="ic:baseline-delete" class="text-lg" /> Delete {openPhase.name}</button>
  </div>
{:else}
<div class="card space-y-4">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Training phases</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The blocks of weeks (for example Strength or Deload) you set on the Plan calendar. Tap a phase to change its name and colour and edit the sessions it starts with.</p>
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
        <div class="flex items-center justify-between py-1">
          <button
            onclick={() => (phaseId = phase.id)}
            class="flex items-center gap-3 flex-1 min-w-0 min-h-11 py-2 text-left"
            aria-label="Open {phase.name}"
          >
            <div class="w-3 h-3 rounded-full flex-shrink-0 {phase.color || 'bg-status-neutral'}"></div>
            <div class="min-w-0 flex-1">
              <p class="text-body font-bold text-content truncate">{phase.name}</p>
              <p class="text-caption text-content-subtle">{(templates[phase.id] || []).length} session{(templates[phase.id] || []).length === 1 ? '' : 's'}</p>
            </div>
            <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl flex-shrink-0" />
          </button>
          <div class="flex items-center flex-shrink-0">
            <button onclick={() => movePhase(phase.id, 'up')} disabled={index === 0} class="btn-icon disabled:opacity-30" aria-label="Move {phase.name} up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
            <button onclick={() => movePhase(phase.id, 'down')} disabled={index === sortedPhaseDefs.length - 1} class="btn-icon disabled:opacity-30" aria-label="Move {phase.name} down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
          </div>
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
{/if}
