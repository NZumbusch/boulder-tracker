<script lang="ts">
  /**
   * Choosing an exercise for a slot, from a library that can be long:
   * search (names, groups, how-tos), your most recent ones up top, then
   * every group - folded until you open one or search. Archived exercises
   * aren't offered. Replaces what used to be one long `<select>`.
   */
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import type { ExerciseTypeDef } from '../../lib/types';
  import { exerciseGroup, groupTypes, searchTypes, typeUsage, recentTypes } from '../../lib/exercise/library';
  import { localIsoDate } from '../../lib/dateUtils';
  import Icon from '@iconify/svelte';

  let { types, selectedId, onPick, onClose }: {
    types: ExerciseTypeDef[];
    selectedId: string;
    onPick: (id: string) => void;
    onClose: () => void;
  } = $props();

  let query = $state('');
  let open = $state<Set<string>>(new Set());

  const offered = $derived(types.filter((t) => !t.archived));
  const usage = $derived(typeUsage(trainingState.workouts, localIsoDate(new Date())));
  const recent = $derived(recentTypes(offered, usage));
  const groups = $derived(groupTypes(offered));
  const results = $derived(query.trim() ? searchTypes(offered, query) : []);
  // The current choice's group starts open, so it's visible in context.
  $effect(() => {
    const current = types.find((t) => t.id === selectedId);
    if (current) open = new Set([exerciseGroup(current)]);
  });

  function toggle(name: string) {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    open = next;
  }

  function pick(id: string) {
    onPick(id);
    onClose();
  }

  backWhile(() => true, () => onClose());
</script>

{#snippet row(t: ExerciseTypeDef, showGroup: boolean)}
  <button onclick={() => pick(t.id)} class="w-full flex items-center gap-3 py-2.5 text-left group">
    <span class="min-w-0 flex-1">
      <span class="block text-body font-semibold truncate transition-colors {t.id === selectedId ? 'text-primary' : 'text-content group-hover:text-primary'}">{t.name}</span>
      {#if showGroup || t.description}
        <span class="block text-caption text-content-subtle truncate">{showGroup ? exerciseGroup(t) : ''}{showGroup && t.description ? ' · ' : ''}{t.description ?? ''}</span>
      {/if}
    </span>
    {#if t.id === selectedId}<Icon icon="ic:baseline-check" class="text-lg text-primary shrink-0" />{/if}
  </button>
{/snippet}

<div class="fixed inset-0 pb-safe z-[130] flex items-end sm:items-center justify-center bg-app-bg/85 backdrop-blur-md" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="bg-surface w-full max-w-lg rounded-t-2xl sm:rounded-card border-t sm:border border-border shadow-card h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
    <div class="shrink-0 border-b border-border px-5 pt-4 pb-3 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-title text-content">Choose an exercise</h3>
        <button onclick={onClose} class="p-2 -mr-2 text-content-subtle hover:text-content transition-colors" aria-label="Close">
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      </div>
      <div class="relative">
        <Icon icon="ic:baseline-search" class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-content-subtle pointer-events-none" />
        <input
          bind:value={query}
          type="search"
          placeholder="Search {offered.length} exercises…"
          class="w-full pl-10 pr-9 py-2.5 bg-surface-elevated/60 text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 placeholder:text-content-subtle"
        />
        {#if query}
          <button onclick={() => query = ''} class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-content-subtle hover:text-content" aria-label="Clear search">
            <Icon icon="ic:baseline-close" class="text-base" />
          </button>
        {/if}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto no-scrollbar px-5 py-2">
      {#if query.trim()}
        <div class="divide-y divide-border">
          {#each results as t (t.id)}
            {@render row(t, true)}
          {:else}
            <p class="py-6 text-caption text-content-subtle italic text-center">Nothing matches “{query.trim()}”. New exercises are added in Settings → Customization → Exercises.</p>
          {/each}
        </div>
      {:else}
        {#if recent.length > 0}
          <p class="pt-2 text-section uppercase text-content-muted">Recent</p>
          <div class="divide-y divide-border mb-2">
            {#each recent as t (t.id)}
              {@render row(t, true)}
            {/each}
          </div>
        {/if}
        {#each groups as g, i (g.name)}
          <div class={i > 0 || recent.length > 0 ? 'border-t border-border' : ''}>
            <button onclick={() => toggle(g.name)} class="w-full flex items-center gap-2 py-3 text-left">
              <Icon icon={open.has(g.name) ? 'ic:baseline-expand-more' : 'ic:baseline-chevron-right'} class="text-lg text-content-subtle shrink-0" />
              <span class="text-section uppercase text-content-muted truncate">{g.name}</span>
              <span class="text-caption text-content-subtle tabular-nums">{g.types.length}</span>
            </button>
            {#if open.has(g.name)}
              <div class="divide-y divide-border pl-7 pb-1">
                {#each g.types as t (t.id)}
                  {@render row(t, false)}
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
