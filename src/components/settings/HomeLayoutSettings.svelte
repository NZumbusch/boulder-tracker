<script lang="ts">
  import { motionMs } from '../../lib/motion';
  /**
   * Appearance -> Home: the Fatigue card's chart style, and Home section
   * visibility + reorder. Split out of the old single
   * "Layout" card when Appearance was grouped by topic.
   *
   * **Home sections** reorder via `svelte-dnd-action`'s `dragHandleZone`/
   * `dragHandle` - the same handle-only pattern (not whole-row-draggable)
   * the Plan screen uses for day reassignment, so normal page
   * scrolling isn't interrupted by an accidental drag start.
   *
   * A section with optional parts (`HOME_SECTION_DETAILS`) gets a chevron
   * that expands its row into those parts' toggles. Which rows are open is
   * view state only - it resets when the screen is left.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action';
  import type { HomeSectionPreference } from '../../lib/preferences/migrate';
  import { HOME_SECTION_DETAILS } from '../../lib/preferences/homeDetails';
  import Icon from "@iconify/svelte";

  const SECTION_LABELS: Record<HomeSectionPreference['id'], string> = {
    readiness: 'Readiness',
    alerts: 'Alerts',
    today: 'Today',
    metrics: 'Metrics',
    fatigue: 'Fatigue',
    thisWeek: 'This Week',
    weekRecap: 'Week Recap',
    trainingBlock: 'Training Block',
    competition: 'Next Goal',
    progress: 'Progress',
    recentActivity: 'Recent Activity',
    weather: 'Weather',
    crags: 'Crags',
  };

  // Local mutable mirror, same reasoning as TrainingPlan.svelte's `dayGroups`
  // - the DnD library needs a locally-reorderable array for live
  // visual feedback; the actual write path is `setHomeSectionOrder`, called
  // only on drop.
  let items = $state<HomeSectionPreference[]>(trainingState.homeSections);
  $effect(() => {
    items = trainingState.homeSections;
  });

  let expanded = $state<Set<HomeSectionPreference['id']>>(new Set());
  function toggleExpanded(id: HomeSectionPreference['id']) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  function handleConsider(e: CustomEvent<DndEvent<HomeSectionPreference>>) {
    items = e.detail.items;
  }
  function handleFinalize(e: CustomEvent<DndEvent<HomeSectionPreference>>) {
    items = e.detail.items;
    trainingState.setHomeSectionOrder(items.map((s) => s.id));
  }
</script>

<div class="card space-y-5 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Home sections</h3>
    <p class="text-caption text-content-subtle px-1">Drag the handle to reorder; toggle to show or hide. Open a section to choose what it shows.</p>
    <div
      class="divide-y divide-border"
      use:dragHandleZone={{ items, flipDurationMs: motionMs(150), dropTargetClasses: ['ring-2', 'ring-primary/40'] }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each items as section (section.id)}
        {@const details = HOME_SECTION_DETAILS[section.id]}
        {@const isOpen = expanded.has(section.id)}
        <div>
          <div class="flex items-center gap-2 py-2">
            <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle touch-none p-1" aria-label="Drag to reorder {SECTION_LABELS[section.id]}">
              <Icon icon="ic:baseline-drag-indicator" class="text-lg" />
            </div>
            {#if details.length > 0}
              <button
                onclick={() => toggleExpanded(section.id)}
                class="flex-1 flex items-center gap-1 text-left text-body text-content"
                aria-expanded={isOpen}
                aria-label="{isOpen ? 'Hide' : 'Show'} {SECTION_LABELS[section.id]} options"
              >
                <span>{SECTION_LABELS[section.id]}</span>
                <Icon icon="ic:baseline-chevron-right" class="text-lg text-content-subtle transition-transform {isOpen ? 'rotate-90' : ''}" />
              </button>
            {:else}
              <span class="text-body text-content flex-1">{SECTION_LABELS[section.id]}</span>
            {/if}
            <input
              type="checkbox"
              checked={section.visible}
              onchange={(e) => trainingState.setHomeSectionVisible(section.id, e.currentTarget.checked)}
              class="w-5 h-5 rounded accent-primary"
              aria-label="Show {SECTION_LABELS[section.id]} on Home"
            />
          </div>
          {#if isOpen}
            <div class="pl-9 pb-3 space-y-2 {section.visible ? '' : 'opacity-50'}">
              {#each details as detail (detail.id)}
                <label class="flex items-center gap-3 cursor-pointer">
                  <div class="flex-1 min-w-0">
                    <p class="text-label text-content">{detail.label}</p>
                    {#if detail.hint}<p class="text-caption text-content-subtle">{detail.hint}</p>{/if}
                  </div>
                  <input
                    type="checkbox"
                    checked={trainingState.homeDetails[detail.id]}
                    onchange={(e) => trainingState.setHomeDetail(detail.id, e.currentTarget.checked)}
                    class="w-4 h-4 rounded accent-primary shrink-0"
                  />
                </label>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<div class="card space-y-3 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Fatigue card</h3>
    <p class="text-caption text-content-subtle px-1">How the Fatigue card on Home draws the four axes.</p>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button
        onclick={() => trainingState.setFatigueChartStyle('bars')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.fatigueChartStyle === 'bars' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        Bars
      </button>
      <button
        onclick={() => trainingState.setFatigueChartStyle('radar')}
        class="flex-1 py-2 text-label rounded-control transition-all {trainingState.fatigueChartStyle === 'radar' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
      >
        Radar
      </button>
    </div>
  </div>

</div>
