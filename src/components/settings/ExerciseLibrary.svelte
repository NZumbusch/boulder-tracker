<script lang="ts">
  /**
   * Settings -> Customization -> Exercises: the exercise library.
   *
   * Built for a long list (the AI coach adds exercises quickly): search
   * over names, groups and how-tos, one-level groups you can fold and
   * rename, usage on every row, and archived exercises kept out of the way
   * but restorable. Tapping an exercise opens `ExerciseTypeEditor`.
   *
   * Edits go into the bound `exerciseTypes` - Settings autosaves them.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { generateId } from '../../lib/utils';
  import type { ExerciseTypeDef, AnalyticsCategory, WorkoutTemplate } from '../../lib/types';
  import { exerciseGroup, groupTypes, groupNames, searchTypes, typeUsage, isTypeReferenced, renameGroup, type TypeUsage } from '../../lib/exercise/library';
  import ExerciseTypeEditor from './ExerciseTypeEditor.svelte';
  import { localIsoDate } from '../../lib/dateUtils';
  import Icon from '@iconify/svelte';

  let {
    exerciseTypes = $bindable(),
    analyticsCategories,
    templates,
  }: {
    exerciseTypes: ExerciseTypeDef[];
    analyticsCategories: AnalyticsCategory[];
    templates: Record<string, WorkoutTemplate[]>;
  } = $props();

  type Sort = 'name' | 'used' | 'recent';
  let query = $state('');
  let groupFilter = $state<string | null>(null);
  let sort = $state<Sort>('name');
  let open = $state<Set<string>>(new Set());
  let showArchived = $state(false);
  let renaming = $state<{ from: string; to: string } | null>(null);
  let editing = $state<{ type: ExerciseTypeDef; isNew: boolean } | null>(null);

  const today = localIsoDate(new Date());
  const usage = $derived(typeUsage(trainingState.workouts, today));
  const active = $derived(exerciseTypes.filter((t) => !t.archived));
  const archived = $derived(exerciseTypes.filter((t) => t.archived).sort((a, b) => a.name.localeCompare(b.name)));
  const groups = $derived(groupTypes(exerciseTypes));
  const allGroupNames = $derived(groupNames(exerciseTypes));

  function sorted(list: ExerciseTypeDef[]): ExerciseTypeDef[] {
    if (sort === 'name') return list;
    const u = (t: ExerciseTypeDef): TypeUsage => usage.get(t.id) ?? { count: 0, lastUsed: '' };
    return [...list].sort((a, b) =>
      sort === 'used'
        ? u(b).count - u(a).count || a.name.localeCompare(b.name)
        : u(b).lastUsed.localeCompare(u(a).lastUsed) || a.name.localeCompare(b.name),
    );
  }

  const results = $derived(query.trim() ? searchTypes(active, query) : []);
  const shownGroups = $derived(groupFilter ? groups.filter((g) => g.name === groupFilter) : groups);

  function usageLabel(t: ExerciseTypeDef): string {
    const u = usage.get(t.id);
    if (!u) return 'not used yet';
    if (!u.lastUsed) return `${u.count}× planned`;
    const days = Math.round((Date.parse(today) - Date.parse(u.lastUsed)) / 86_400_000);
    const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} d ago` : new Date(u.lastUsed).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    return `${u.count}× · last ${when}`;
  }

  function toggle(name: string) {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    open = next;
  }

  function startNew() {
    const group = groupFilter ?? (open.size === 1 ? [...open][0] : undefined);
    editing = {
      isNew: true,
      type: { id: generateId(), name: query.trim(), group, category: analyticsCategories.find((c) => !c.archived)?.name ?? 'Other', parameters: ['duration'] },
    };
  }

  function save(type: ExerciseTypeDef) {
    const index = exerciseTypes.findIndex((t) => t.id === type.id);
    if (index === -1) exerciseTypes = [...exerciseTypes, type];
    else exerciseTypes[index] = type;
    // Show where it went.
    const g = exerciseGroup(type);
    if (!query.trim() && !open.has(g)) open = new Set([...open, g]);
    editing = null;
  }

  function setArchived(id: string, value: boolean) {
    exerciseTypes = exerciseTypes.map((t) => (t.id === id ? { ...t, archived: value || undefined } : t));
    editing = null;
  }

  function remove(id: string) {
    exerciseTypes = exerciseTypes.filter((t) => t.id !== id);
    editing = null;
  }

  function commitRename() {
    if (!renaming) return;
    const { from, to } = renaming;
    exerciseTypes = renameGroup(exerciseTypes, from, to);
    if (open.has(from)) open = new Set([...[...open].filter((g) => g !== from), to.trim()]);
    if (groupFilter === from) groupFilter = to.trim() || null;
    renaming = null;
  }

  const takenNames = $derived(new Set(exerciseTypes.filter((t) => t.id !== editing?.type.id).map((t) => t.name.trim().toLowerCase())));
  const editingReferenced = $derived(
    editing && !editing.isNew
      ? isTypeReferenced(editing.type.id, { workouts: trainingState.workouts, templates, circuits: trainingState.circuits })
      : false,
  );
</script>

{#snippet row(t: ExerciseTypeDef, showGroup: boolean)}
  <button onclick={() => editing = { type: t, isNew: false }} class="w-full flex items-center gap-3 py-2.5 text-left group">
    <span class="min-w-0 flex-1">
      <span class="block text-body font-semibold text-content truncate group-hover:text-primary transition-colors">{t.name}</span>
      <span class="block text-caption text-content-subtle truncate tabular-nums">
        {showGroup ? `${exerciseGroup(t)} · ` : ''}{usageLabel(t)}{t.description ? '' : ' · no how-to'}
      </span>
    </span>
    <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle shrink-0" />
  </button>
{/snippet}

<div class="space-y-3">
  <div class="relative">
    <Icon icon="ic:baseline-search" class="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-content-subtle pointer-events-none" />
    <input
      bind:value={query}
      type="search"
      placeholder="Search {active.length} exercises…"
      class="w-full pl-10 pr-9 py-2.5 bg-surface-elevated/60 text-content rounded-control border border-border-strong text-sm outline-none focus:border-primary/50 placeholder:text-content-subtle"
    />
    {#if query}
      <button onclick={() => query = ''} class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-content-subtle hover:text-content" aria-label="Clear search">
        <Icon icon="ic:baseline-close" class="text-base" />
      </button>
    {/if}
  </div>

  {#if !query.trim()}
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
      <button onclick={() => groupFilter = null} class="chip shrink-0 {groupFilter === null ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'text-content-muted'}">All</button>
      {#each groups as g}
        <button onclick={() => groupFilter = groupFilter === g.name ? null : g.name} class="chip shrink-0 {groupFilter === g.name ? 'bg-primary/10 border-primary/40 text-primary font-bold' : 'text-content-muted'}">
          {g.name} <span class="tabular-nums opacity-70">{g.types.length}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="flex items-center justify-between gap-2">
    <span class="text-caption text-content-subtle">
      {query.trim() ? `${results.length} found` : `${active.length} exercises · ${groups.length} groups`}
    </span>
    <div class="seg">
      <button onclick={() => sort = 'name'} class="seg-item {sort === 'name' ? 'seg-on' : ''}">A–Z</button>
      <button onclick={() => sort = 'used'} class="seg-item {sort === 'used' ? 'seg-on' : ''}">Most used</button>
      <button onclick={() => sort = 'recent'} class="seg-item {sort === 'recent' ? 'seg-on' : ''}">Recent</button>
    </div>
  </div>

  {#if query.trim()}
    <div class="divide-y divide-border">
      {#each sort === 'name' ? results : sorted(results) as t (t.id)}
        {@render row(t, true)}
      {:else}
        <p class="py-4 text-caption text-content-subtle italic">Nothing matches “{query.trim()}”.</p>
      {/each}
    </div>
  {:else}
    <div class="space-y-1">
      {#each shownGroups as g (g.name)}
        {@const expanded = groupFilter !== null || open.has(g.name)}
        <div class="border-b border-border last:border-b-0">
          {#if renaming?.from === g.name}
            <div class="flex items-center gap-2 py-2">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:value={renaming.to}
                autofocus
                data-own-enter
                onkeydown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') renaming = null; }}
                class="flex-1 min-w-0 px-3 py-2 bg-surface-elevated text-content rounded-control border border-primary/40 text-sm outline-none"
              />
              <button onclick={commitRename} class="px-3 py-2 text-label font-bold text-primary">Rename</button>
              <button onclick={() => renaming = null} class="p-2 text-content-subtle" aria-label="Cancel"><Icon icon="ic:baseline-close" /></button>
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <button onclick={() => groupFilter === null && toggle(g.name)} class="flex-1 min-w-0 flex items-center gap-2 py-3 text-left">
                <Icon icon={expanded ? 'ic:baseline-expand-more' : 'ic:baseline-chevron-right'} class="text-lg text-content-subtle shrink-0" />
                <span class="text-section uppercase text-content-muted truncate">{g.name}</span>
                <span class="text-caption text-content-subtle tabular-nums">{g.types.length}</span>
              </button>
              {#if expanded}
                <button onclick={() => renaming = { from: g.name, to: g.name }} class="p-2 text-content-subtle hover:text-content" aria-label="Rename group {g.name}" title="Rename group">
                  <Icon icon="ic:baseline-edit" class="text-base" />
                </button>
              {/if}
            </div>
          {/if}
          {#if expanded}
            <div class="divide-y divide-border pl-7 pb-1">
              {#each sorted(g.types) as t (t.id)}
                {@render row(t, false)}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <button onclick={startNew} class="w-full py-3 rounded-control hover:bg-surface-elevated/50 flex items-center justify-center gap-2 text-primary transition-colors">
    <Icon icon="ic:baseline-plus" />
    <span class="text-label">{query.trim() ? `New exercise “${query.trim()}”` : 'New exercise'}</span>
  </button>

  {#if archived.length > 0}
    <div class="pt-2 border-t border-border">
      <button onclick={() => showArchived = !showArchived} class="w-full flex items-center justify-between py-2 text-left">
        <span class="text-label text-content-subtle">Archived · {archived.length}</span>
        <Icon icon={showArchived ? 'ic:baseline-expand-less' : 'ic:baseline-expand-more'} class="text-lg text-content-subtle" />
      </button>
      {#if showArchived}
        <div class="divide-y divide-border">
          {#each archived as t (t.id)}
            <div class="flex items-center gap-2">
              <div class="flex-1 min-w-0 opacity-70">{@render row(t, true)}</div>
              <button onclick={() => setArchived(t.id, false)} class="shrink-0 px-3 py-1.5 text-label font-bold text-primary hover:bg-primary/10 rounded-control">Restore</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if editing}
  <ExerciseTypeEditor
    type={editing.type}
    isNew={editing.isNew}
    groups={allGroupNames}
    {analyticsCategories}
    {takenNames}
    referenced={editingReferenced}
    onSave={save}
    onArchive={(value) => editing && setArchived(editing.type.id, value)}
    onDelete={() => editing && remove(editing.type.id)}
    onClose={() => editing = null}
  />
{/if}
