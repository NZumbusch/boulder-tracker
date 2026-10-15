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
  import Toggle from '../ui/Toggle.svelte';
  import Segmented from '../ui/Segmented.svelte';

  const SECTION_LABELS: Record<HomeSectionPreference['id'], string> = {
    checklist: 'Get started',
    readiness: 'Readiness',
    alerts: 'Alerts',
    today: 'Today',
    timer: 'Timer',
    metrics: 'Metrics',
    fatigue: 'Fatigue',
    thisWeek: 'This week',
    weekRecap: 'Week recap',
    trainingBlock: 'Training block',
    competition: 'Next goal',
    progress: 'Progress',
    recentActivity: 'Recent activity',
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
    <h2 class="text-section uppercase text-content-muted px-1">Home sections</h2>
    <p class="text-caption text-content-subtle px-1">Drag the handle to reorder, use the switch to show or hide. Open a section's options to choose what it shows.</p>
    <Toggle
      checked={trainingState.simpleHome}
      onChange={(v) => trainingState.setSimpleHome(v)}
      label="Simple Home until I have data"
      hint="Hides Readiness, Metrics, Fatigue, Progress, Recent activity and Alerts while there is nothing logged yet. They all appear with your first entry. Off shows every section you've turned on, always."
    />
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
          <div class="flex items-center gap-1">
            <div use:dragHandle class="cursor-grab active:cursor-grabbing text-content-subtle touch-none grid place-items-center min-w-11 min-h-11" aria-label="Drag to reorder {SECTION_LABELS[section.id]}">
              <Icon icon="ic:baseline-drag-indicator" class="text-xl" />
            </div>
            <div class="flex-1 min-w-0">
              <Toggle checked={section.visible} onChange={(v) => trainingState.setHomeSectionVisible(section.id, v)} label={SECTION_LABELS[section.id]} />
            </div>
            {#if details.length > 0}
              <button
                type="button"
                onclick={() => toggleExpanded(section.id)}
                class="btn-icon shrink-0"
                aria-expanded={isOpen}
                aria-label="{isOpen ? 'Hide' : 'Show'} {SECTION_LABELS[section.id]} options"
              >
                <Icon icon="ic:baseline-chevron-right" class="text-xl transition-transform {isOpen ? 'rotate-90' : ''}" />
              </button>
            {:else}
              <span class="min-w-11 shrink-0" aria-hidden="true"></span>
            {/if}
          </div>
          {#if isOpen}
            <div class="pl-12 pb-2 {section.visible ? '' : 'opacity-60'}">
              {#each details as detail (detail.id)}
                <Toggle
                  checked={trainingState.homeDetails[detail.id]}
                  onChange={(v) => trainingState.setHomeDetail(detail.id, v)}
                  label={detail.label}
                  hint={detail.hint ?? (section.visible ? undefined : 'Hidden while the section is off')}
                  disabled={!section.visible}
                />
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
    <h2 class="text-section uppercase text-content-muted px-1">Fatigue card</h2>
    <p class="text-caption text-content-subtle px-1">How the Fatigue card on Home draws the four axes.</p>
    <Segmented
      variant="setting"
      full
      label="Fatigue card style"
      value={trainingState.fatigueChartStyle}
      onChange={(v) => trainingState.setFatigueChartStyle(v)}
      options={[{ value: 'bars', label: 'Bars' }, { value: 'radar', label: 'Radar' }]}
    />
  </div>
</div>
