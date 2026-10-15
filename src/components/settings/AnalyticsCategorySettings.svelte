<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import { scopedUndo } from '../../lib/toast.svelte';
  import type { AnalyticsCategory, ExerciseSlot, WorkoutTemplate } from '../../lib/types';
  import Icon from "@iconify/svelte";
  import ColorPicker from './ColorPicker.svelte';
  import { DEFAULT_COLOR } from './colorChoices';

  let {
    analyticsCategories = $bindable(),
    templates,
  }: {
    analyticsCategories: AnalyticsCategory[];
    templates: Record<string, WorkoutTemplate[]>;
  } = $props();

  let formError = $state('');

  let editingAnalyticsCategory = $state<AnalyticsCategory | null>(null);
  let isAddingAnalyticsCategory = $state(false);

  /** Resolves a slot's effective category name: its override if set, else its type's default. */
  function resolveSlotCategory(e: ExerciseSlot): string | undefined {
    return e.categoryId
      ? analyticsCategories.find(c => c.id === e.categoryId)?.name
      : trainingState.exerciseTypes.find(t => t.id === e.typeId)?.category;
  }

  const missingCategories = $derived.by(() => {
    const existingCats = new Set(analyticsCategories.map((c) => c.name));
    const missing = new Set<string>();

    trainingState.exerciseTypes.forEach(t => {
      if (t.category && !existingCats.has(t.category)) missing.add(t.category);
    });

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        const cat = resolveSlotCategory(e);
        if (cat && !existingCats.has(cat)) missing.add(cat);
      });
    });

    if (templates) {
      Object.values(templates).forEach(phaseTemplates => {
        phaseTemplates?.forEach(t => {
          t.exercises?.forEach(e => {
            const cat = resolveSlotCategory(e);
            if (cat && !existingCats.has(cat)) missing.add(cat);
          });
        });
      });
    }

    return Array.from(missing);
  });

  function startAddAnalyticsCategory() {
    editingAnalyticsCategory = {
      id: generateId(),
      name: 'New category',
      color: DEFAULT_COLOR
    };
    formError = '';
    isAddingAnalyticsCategory = true;
  }

  function saveAnalyticsCategory() {
    if (!editingAnalyticsCategory) return;

    const name = editingAnalyticsCategory.name.trim();
    if (!name) {
      formError = 'Give the category a name.';
      return;
    }

    const isDuplicate = analyticsCategories.some(c =>
      c.id !== editingAnalyticsCategory?.id &&
      c.name.toLowerCase() === name.toLowerCase()
    );

    if (isDuplicate) {
      formError = 'A category with this name already exists.';
      return;
    }

    const index = analyticsCategories.findIndex(c => c.id === editingAnalyticsCategory?.id);
    if (index !== -1) {
      analyticsCategories[index] = { ...editingAnalyticsCategory, name };
    } else {
      analyticsCategories.push({ ...editingAnalyticsCategory, name });
    }
    // Closing is enough: nulling the edited object too would make the
    // form's still-bound inputs read a field of null before the form is gone.
    isAddingAnalyticsCategory = false;
  }

  const undoable = scopedUndo();
  function deleteAnalyticsCategory(id: string) {
    const catToDelete = analyticsCategories.find(c => c.id === id);
    if (!catToDelete) return;

    let inUseCount = 0;
    let inUseModalities = 0;

    trainingState.workouts.forEach(w => {
      w.exercises?.forEach(e => {
        if (resolveSlotCategory(e) === catToDelete.name) inUseCount++;
      });
    });

    if (templates) {
      Object.values(templates).forEach(phaseTemplates => {
        phaseTemplates?.forEach(t => {
          t.exercises?.forEach(e => {
            if (resolveSlotCategory(e) === catToDelete.name) inUseCount++;
          });
        });
      });
    }

    trainingState.exerciseTypes.forEach(t => {
      if (t.category === catToDelete.name) inUseModalities++;
    });

    const index = analyticsCategories.findIndex(c => c.id === id);
    const removed = $state.snapshot(catToDelete) as AnalyticsCategory;
    analyticsCategories = analyticsCategories.filter(c => c.id !== id);
    const orphans = inUseCount + inUseModalities;
    undoable(
      orphans > 0 ? `${removed.name} deleted - ${orphans} exercise${orphans === 1 ? '' : 's'} now have no category` : `${removed.name} deleted`,
      () => {
        if (!analyticsCategories.some(c => c.id === removed.id)) analyticsCategories = [...analyticsCategories.slice(0, index), removed, ...analyticsCategories.slice(index)];
      },
    );
  }

  function moveAnalyticsCategoryUp(index: number) {
    if (index === 0) return;
    const temp = analyticsCategories[index - 1];
    analyticsCategories[index - 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
  }

  function moveAnalyticsCategoryDown(index: number) {
    if (index === analyticsCategories.length - 1) return;
    const temp = analyticsCategories[index + 1];
    analyticsCategories[index + 1] = analyticsCategories[index];
    analyticsCategories[index] = temp;
  }
</script>

{#if isAddingAnalyticsCategory && editingAnalyticsCategory}
    <div class="p-4 bg-surface-elevated/50 rounded-card space-y-4 animate-in zoom-in-95">
      <div class="space-y-3">
        <div class="space-y-1">
          <label for="ac-name" class="text-label text-content-subtle ml-1">Category name</label>
          <input id="ac-name" bind:value={editingAnalyticsCategory.name} oninput={() => (formError = '')} aria-invalid={formError ? 'true' : undefined} aria-describedby={formError ? 'ac-name-error' : undefined} class="field" placeholder="e.g. Flexibility" />
          {#if formError}<p id="ac-name-error" class="text-caption text-danger ml-1" role="alert">{formError}</p>{/if}
        </div>
        <div class="space-y-1"><p class="text-label text-content-subtle ml-1">Colour</p>
          <ColorPicker value={editingAnalyticsCategory.color ?? DEFAULT_COLOR} onChange={(c) => (editingAnalyticsCategory!.color = c)} label="Category colour" />
        </div>
      </div>
      <div class="flex gap-2 pt-2"><button onclick={saveAnalyticsCategory} class="btn btn-primary flex-1">Save</button><button onclick={() => (isAddingAnalyticsCategory = false)} class="btn btn-secondary">Cancel</button></div>
    </div>
  {:else}
    <div class="divide-y divide-border">
      {#each analyticsCategories as cat, index (cat.id)}
        <div class="flex items-center justify-between py-3 group">
          <div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full {cat.color}"></div><div><p class="text-body font-bold text-content">{cat.name}</p></div></div>
          <div class="flex items-center">
            <button onclick={() => moveAnalyticsCategoryUp(index)} disabled={index === 0} class="btn-icon disabled:opacity-30" aria-label="Move {cat.name} up"><Icon icon="ic:baseline-keyboard-arrow-up" class="text-xl" /></button>
            <button onclick={() => moveAnalyticsCategoryDown(index)} disabled={index === analyticsCategories.length - 1} class="btn-icon disabled:opacity-30" aria-label="Move {cat.name} down"><Icon icon="ic:baseline-keyboard-arrow-down" class="text-xl" /></button>
            <button onclick={() => { editingAnalyticsCategory = { ...cat }; formError = ''; isAddingAnalyticsCategory = true; }} class="btn-icon" aria-label="Edit {cat.name}"><Icon icon="ic:baseline-edit" class="text-xl" /></button>
            <button onclick={() => deleteAnalyticsCategory(cat.id)} class="btn-icon hover:text-danger" aria-label="Delete {cat.name}"><Icon icon="ic:baseline-delete" class="text-xl" /></button>
          </div>
        </div>
      {/each}
      <button onclick={startAddAnalyticsCategory} class="w-full min-h-11 py-3 rounded-control hover:bg-surface-elevated/50 flex items-center justify-center gap-2 text-primary transition-colors"><Icon icon="ic:baseline-plus" /><span class="text-label">Add category</span></button>
    </div>
  {/if}

  {#if missingCategories.length > 0}
    <div class="mt-6 p-4 bg-surface-elevated/50 rounded-card space-y-3 animate-in fade-in">
      <div class="flex items-center gap-2 text-content">
        <Icon icon="ic:baseline-warning" class="text-lg text-status-caution" />
        <span class="text-label">Categories that are used but missing</span>
      </div>
      <p class="text-caption text-content-muted leading-relaxed">These categories are used by existing exercises but are not in the list. Add them back to track them in Analytics.</p>
      <div class="space-y-2">
        {#each missingCategories as mCat}
          <div class="flex items-center justify-between p-2.5 bg-surface/50 rounded-control">
            <span class="text-label text-content">{mCat}</span>
            <button
              onclick={() => {
                analyticsCategories = [...analyticsCategories, {
                  id: generateId(),
                  name: mCat,
                  color: 'bg-status-neutral'
                }];
              }}
              class="btn btn-secondary"
            >
              Restore
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
