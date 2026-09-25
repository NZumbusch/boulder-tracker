<script lang="ts">
  /**
   * A user-ordered, individually hideable list in Settings - drag the
   * handle to reorder, tick to show. Used for the Analytics cards and the
   * quick-log actions; Home sections have their own (with per-card options).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import Icon from '@iconify/svelte';

  let { list, title, hint, labels }: {
    list: 'analyticsSections' | 'quickLogActions';
    title: string;
    hint?: string;
    labels: Record<string, string>;
  } = $props();

  type Item = { id: string; visible: boolean };
  const source = $derived(trainingState[list] as Item[]);
  // Local mirror for the drag library's live feedback; written back on drop.
  // svelte-ignore state_referenced_locally
  let items = $state<Item[]>(source);
  $effect(() => {
    items = source;
  });

  function consider(e: CustomEvent<DndEvent<Item>>) {
    items = e.detail.items;
  }
  function finalize(e: CustomEvent<DndEvent<Item>>) {
    items = e.detail.items;
    trainingState.setListOrder(list, items.map((i) => i.id));
  }
</script>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-1">
    <h3 class="text-section uppercase text-content-muted px-1">{title}</h3>
    {#if hint}<p class="text-caption text-content-subtle px-1">{hint}</p>{/if}
  </div>
  <div
    class="space-y-1.5"
    use:dragHandleZone={{ items, flipDurationMs: 150, dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
    onconsider={consider}
    onfinalize={finalize}
  >
    {#each items as item (item.id)}
      <div class="flex items-center gap-2 p-2.5 rounded-control border border-border-strong/50 bg-surface-elevated/30">
        <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle touch-none p-1" aria-label="Drag to reorder {labels[item.id]}">
          <Icon icon="ic:baseline-drag-indicator" class="text-lg" />
        </div>
        <span class="text-body text-content flex-1">{labels[item.id] ?? item.id}</span>
        <input
          type="checkbox"
          checked={item.visible}
          onchange={(e) => trainingState.setListVisible(list, item.id, e.currentTarget.checked)}
          class="w-5 h-5 rounded accent-primary"
          aria-label="Show {labels[item.id]}"
        />
      </div>
    {/each}
  </div>
</div>
