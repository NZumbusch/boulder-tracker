<script lang="ts">
  import { motionMs } from '../../lib/motion';
  /**
   * A user-ordered, individually hideable list in Settings - drag the
   * handle to reorder, use the switch to show. Used for the Analytics cards and the
   * quick-log actions; Home sections have their own (with per-card options).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import Icon from '@iconify/svelte';
  import Toggle from '../ui/Toggle.svelte';

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
    <h2 class="text-section uppercase text-content-muted px-1">{title}</h2>
    {#if hint}<p class="text-caption text-content-subtle px-1">{hint}</p>{/if}
  </div>
  <div
    class="divide-y divide-border"
    use:dragHandleZone={{ items, flipDurationMs: motionMs(150), dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
    onconsider={consider}
    onfinalize={finalize}
  >
    {#each items as item (item.id)}
      <div class="flex items-center gap-1">
        <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle touch-none grid place-items-center min-w-11 min-h-11" aria-label="Drag to reorder {labels[item.id]}">
          <Icon icon="ic:baseline-drag-indicator" class="text-xl" />
        </div>
        <div class="flex-1 min-w-0">
          <Toggle checked={item.visible} onChange={(v) => trainingState.setListVisible(list, item.id, v)} label={labels[item.id] ?? item.id} />
        </div>
      </div>
    {/each}
  </div>
</div>
