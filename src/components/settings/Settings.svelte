<script lang="ts">
  import AppBar from '../nav/AppBar.svelte';
  import HealthConnectSettings from './HealthConnectSettings.svelte';
  import ActivityImportSettings from './ActivityImportSettings.svelte';
  import DeviceCalendarSettings from './DeviceCalendarSettings.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { storage } from '../../lib/storage';
  import { showConfirm } from '../../lib/utils';
  import { provideUndoScope } from '../../lib/toast.svelte';
  import type { ExerciseTypeDef, PhaseDef, WorkoutTemplate, BenchmarkTypeDef, AnalyticsCategory } from '../../lib/types';
  import ExerciseSettings from './ExerciseSettings.svelte';
  import PhaseSettings from './PhaseSettings.svelte';
  import BenchmarkTypeSettings from './BenchmarkTypeSettings.svelte';
  import BackupSettings from './BackupSettings.svelte';
  import ExportSettings from './ExportSettings.svelte';
  import SettingsTransfer from './SettingsTransfer.svelte';
  import WidgetSettings from './WidgetSettings.svelte';
  import { widgetsAvailable } from '../../lib/widget/widgetSync.svelte';
  import ValueDefSettings from './ValueDefSettings.svelte';
  import CoachNotesSettings from './CoachNotesSettings.svelte';
  import CircuitSettings from './CircuitSettings.svelte';
  import AISharingSettings from './AISharingSettings.svelte';
  import DirectAISettings from './DirectAISettings.svelte';
  import TargetsSettings from './TargetsSettings.svelte';
  import GeneralSettings from './GeneralSettings.svelte';
  import UnitsSettings from './UnitsSettings.svelte';
  import HomeLayoutSettings from './HomeLayoutSettings.svelte';
  import OrderedListSettings from './OrderedListSettings.svelte';
  import TunablesSettings from './TunablesSettings.svelte';
  import ChartSettings from './ChartSettings.svelte';
  import SessionSettings from './SessionSettings.svelte';
  import TimerSettings from './TimerSettings.svelte';
  import SoundSettings from './SoundSettings.svelte';
  import AudioLevelSettings from './AudioLevelSettings.svelte';
  import VoiceSettings from './VoiceSettings.svelte';
  import PainCheckInSettings from './PainCheckInSettings.svelte';
  import PlacesSettings from './PlacesSettings.svelte';
  import RemindersSettings from './RemindersSettings.svelte';
  import PageReset from './PageReset.svelte';
  import { Capacitor } from '@capacitor/core';
  import { healthConnect } from '../../lib/health/healthConnect.svelte';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';
  import {
    findPage, findSection, resolvePageId, searchSettings, visiblePages, visibleSections,
    type PageId, type SectionId, type SettingsContext,
  } from '../../lib/settings/tree';
  import NavRow from '../common/NavRow.svelte';
  import SyncSettings from './SyncSettings.svelte';
  import AboutPage from './AboutPage.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import Icon from "@iconify/svelte";
  import { ANALYTICS_SECTION_IDS } from '../../lib/preferences/migrate';
  import { analyticsSectionLabel } from '../../lib/analytics/sectionNames';

  // --- Props ---
  let {
    onExport,
    onImport
  } = $props<{
    onExport: () => void,
    onImport: (e: Event) => void
  }>();

  // --- Navigation: Settings -> a section -> one of its pages ---
  // What this device can show: the browser has no widgets, notifications or
  // Health Connect, and those pages stay out of the lists (and the search).
  const ctx: SettingsContext = $derived({ native: Capacitor.isNativePlatform(), widgets: widgetsAvailable(), healthConnect: healthConnect.supported, deviceCalendar: deviceCalendar.supported, wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator });
  let section = $state<SectionId | null>(null);
  let page = $state<PageId | null>(null);
  let query = $state('');
  /** On the Phases page: the phase opened on a page of its own (its template editor and details). */
  let phaseId = $state<string | null>(null);

  const sections = $derived(visibleSections(ctx));
  const sectionPages = $derived(section ? visiblePages(findSection(section), ctx) : []);
  /** A section with one page opens straight into it, so "back" skips the one-row list. */
  const singlePage = $derived(sectionPages.length === 1);

  function openSection(id: SectionId) {
    const pages = visiblePages(findSection(id), ctx);
    phaseId = null;
    section = id;
    page = pages.length === 1 ? pages[0].id : null;
  }
  function openPage(id: PageId) {
    phaseId = null;
    section = findPage(id).section.id;
    page = id;
    query = '';
  }
  // Another screen asked for a page (the "what's new" sheet sends you to Tests).
  $effect(() => {
    const asked = trainingState.uiStore.settingsPageRequest;
    if (!asked) return;
    // An old or unknown id still lands somewhere sensible (see `resolvePageId`) rather than throwing.
    const wanted = resolvePageId(asked);
    if (wanted) untrack(() => openPage(wanted));
    trainingState.uiStore.settingsPageRequest = null;
  });
  // A page opens at its top: the app's own scroll reset only follows the tab, so a sub-page opened from a scrolled list
  // would land mid-page.
  let root: HTMLDivElement | undefined;
  $effect(() => {
    void section; void page; void phaseId;
    let el: HTMLElement | null = root?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTo({ top: 0, behavior: 'auto' }); break; }
      el = el.parentElement;
    }
  });
  function goBack() {
    if (phaseId) phaseId = null;
    else if (page && !singlePage) page = null;
    else { section = null; page = null; }
  }
  // Back (phone key or browser) walks the same way: page -> section ->
  // Settings -> Home (the last step is the tab-level back, in uiStore).
  const inSection = $derived(section !== null);
  const inPage = $derived(page !== null && !singlePage);
  backWhile(() => inSection, () => { section = null; page = null; phaseId = null; });
  backWhile(() => inPage, () => { page = null; phaseId = null; });
  backWhile(() => phaseId !== null, () => { phaseId = null; });

  const hits = $derived(searchSettings(query, ctx));

  // --- State: local editable copies of every catalog, saved as they are edited ---
  let templates = $state<Record<string, WorkoutTemplate[]>>({});
  let phaseDefs = $state<PhaseDef[]>([]);
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  let analyticsCategories = $state<AnalyticsCategory[]>([]);

  const title = $derived(
    page === 'phases' && phaseId ? (phaseDefs.find((p) => p.id === phaseId)?.name ?? 'Phase')
    : page ? findPage(page).page.label
    : section ? findSection(section).label
    : 'Settings',
  );

  /**
   * Autosave. Like every other setting, catalog edits save themselves -
   * there used to be a "Save All" button, and leaving the tab without it
   * silently threw the edits away. A change is written 600 ms after the
   * last edit (typing a name shouldn't write every letter), only the
   * catalogs that actually changed are written, and a pending save is
   * flushed when the screen closes.
   */
  type Catalog = 'templates' | 'phaseDefs' | 'exerciseTypes' | 'benchmarkTypes' | 'analyticsCategories';
  const current = (): Record<Catalog, string> => ({
    templates: JSON.stringify($state.snapshot(templates)),
    phaseDefs: JSON.stringify($state.snapshot(phaseDefs)),
    exerciseTypes: JSON.stringify($state.snapshot(exerciseTypes)),
    benchmarkTypes: JSON.stringify($state.snapshot(benchmarkTypes)),
    analyticsCategories: JSON.stringify($state.snapshot(analyticsCategories)),
  });
  let lastSaved: Record<Catalog, string> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let saveError = $state('');
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    templates = await storage.getTemplates();
    phaseDefs = await storage.getPhaseDefs();
    exerciseTypes = await storage.getExerciseTypes();
    benchmarkTypes = await storage.getBenchmarkTypes();
    analyticsCategories = await storage.getAnalyticsCategories();
    lastSaved = current();
  });

  $effect(() => {
    const now = current();
    if (!lastSaved) return;
    if ((Object.keys(now) as Catalog[]).every((k) => now[k] === lastSaved![k])) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  });

  // An exercise created from the picker inside a phase or circuit editor
  // goes straight to the store. Take it in here, or the next autosave of
  // this copy would write the list back without it. Only while this copy
  // has no unsaved edits of its own - those win and are saved as usual.
  $effect(() => {
    const fromStore = JSON.stringify(trainingState.exerciseTypes);
    untrack(() => {
      if (!lastSaved || fromStore === lastSaved.exerciseTypes) return;
      if (JSON.stringify($state.snapshot(exerciseTypes)) !== lastSaved.exerciseTypes) return;
      exerciseTypes = JSON.parse(fromStore);
      lastSaved.exerciseTypes = fromStore;
    });
  });

  // Likewise the categories: "Restore default categories" (Backup & Sync) writes the store directly.
  $effect(() => {
    const fromStore = JSON.stringify(trainingState.analyticsCategories);
    untrack(() => {
      if (!lastSaved || fromStore === lastSaved.analyticsCategories) return;
      if (JSON.stringify($state.snapshot(analyticsCategories)) !== lastSaved.analyticsCategories) return;
      analyticsCategories = JSON.parse(fromStore);
      lastSaved.analyticsCategories = fromStore;
    });
  });

  onDestroy(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      persist();
    }
  });

  async function persist() {
    saveTimer = undefined;
    if (!lastSaved) return;
    const now = current();
    const changed = (Object.keys(now) as Catalog[]).filter((k) => now[k] !== lastSaved![k]);
    if (changed.length === 0) return;
    saveState = 'saving';
    try {
      if (changed.includes('templates')) await storage.saveTemplates($state.snapshot(templates));
      if (changed.includes('phaseDefs')) await storage.savePhaseDefs($state.snapshot(phaseDefs));
      if (changed.includes('exerciseTypes')) await storage.saveExerciseTypes($state.snapshot(exerciseTypes));
      if (changed.includes('benchmarkTypes')) await storage.saveBenchmarkTypes($state.snapshot(benchmarkTypes));
      if (changed.includes('analyticsCategories')) await storage.saveAnalyticsCategories($state.snapshot(analyticsCategories));
      for (const k of changed) lastSaved[k] = now[k];
      await trainingState.refresh();
      saveState = 'saved';
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { if (saveState === 'saved') saveState = 'idle'; }, 2500);
    } catch (err) {
      saveState = 'error';
      saveError = err instanceof Error && err.message ? err.message : 'Something went wrong while writing to storage.';
    }
  }

  const { undoable } = provideUndoScope();
  async function resetTemplates() {
    const confirmed = await showConfirm('Reset all session templates?', 'Every phase goes back to the sessions the app ships with. Your own edits to them are replaced; the phases themselves (names, colours) stay. You can undo this right after.', { ok: 'Reset templates', cancel: 'Keep mine' });
    if (!confirmed) return;
    const before = $state.snapshot(templates);
    await trainingState.resetTemplates();
    templates = await storage.getTemplates();
    // Already saved by the reset - don't write it again.
    if (lastSaved) lastSaved.templates = current().templates;
    // Putting the old ones back is an ordinary edit: the autosave writes it.
    undoable('Templates reset', () => { templates = before; }, async () => {
      await storage.saveTemplates(before);
      await trainingState.refresh();
    });
  }
</script>

<div bind:this={root} class="page-col space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <!-- A nested page gets a back arrow; the top of Settings the menu (or, with the bottom bar - which has no Settings tab - an arrow back Home). -->
  <AppBar title={title} onBack={section !== null ? goBack : trainingState.navStyle === 'bar' ? () => trainingState.navigate('home') : undefined}>
    {#snippet actions()}
      {#if section === 'setup' && (saveState === 'saving' || saveState === 'saved')}
        <span class="text-caption text-content-subtle flex items-center gap-1 pr-2" aria-live="polite">
          {#if saveState === 'saving'}Saving…{:else}<Icon icon="ic:baseline-check" class="text-sm text-success" /> Saved{/if}
        </span>
      {/if}
    {/snippet}
  </AppBar>

  {#if saveState === 'error'}
    <div class="flex items-center gap-3 rounded-control bg-danger/10 px-3 py-2" role="alert">
      <p class="flex-1 text-label text-danger">Your last change was not saved. {saveError}</p>
      <button type="button" class="btn btn-danger shrink-0" onclick={persist}>Try again</button>
    </div>
  {/if}

  {#if section === null}
    <!-- Search: a setting by name, to the page it lives on. -->
    <div class="relative">
      <Icon icon="ic:baseline-search" class="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-content-subtle pointer-events-none" />
      <input
        type="search"
        bind:value={query}
        placeholder="Search settings"
        aria-label="Search settings"
        class="field pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {#if query}
        <button type="button" class="btn-icon absolute right-0 top-1/2 -translate-y-1/2" aria-label="Clear search" onclick={() => (query = '')}>
          <Icon icon="ic:baseline-close" class="text-xl" />
        </button>
      {/if}
    </div>

    {#if query.trim()}
      {#if hits.length > 0}
        <div class="card py-1 divide-y divide-border">
          {#each hits as hit (hit.page + hit.label)}
            {@const where = findPage(hit.page)}
            <NavRow icon={where.page.icon} title={hit.label} hint={where.section.pages.length === 1 ? where.section.label : `${where.section.label} → ${where.page.label}`} onclick={() => openPage(hit.page)} />
          {/each}
        </div>
      {:else}
        <p class="text-caption text-content-subtle px-1">Nothing called that. Try a shorter word - "volume", "sync", "units".</p>
      {/if}
    {:else}
      <div class="card py-1 divide-y divide-border">
        {#each sections as s (s.id)}
          <div data-tour="settings-{s.id}"><NavRow icon={s.icon} title={s.label} hint={s.hint} onclick={() => openSection(s.id)} /></div>
        {/each}
      </div>
    {/if}
  {:else if page === null}
    {#if section === 'setup'}
      <div class="card space-y-2">
        <div class="flex items-center gap-2 text-primary">
          <Icon icon="ic:baseline-info" class="text-lg" />
          <h2 class="text-label">How these fit together</h2>
        </div>
        <p class="text-body text-content-muted leading-relaxed">
          <strong class="text-content">Exercises</strong> are what you can log in a workout. They are grouped into <strong class="text-content">categories</strong> for the analytics charts. <strong class="text-content">Phases</strong> (Strength, Deload and so on) are the blocks of weeks you set on the Plan calendar; each starts with sessions you can edit. <strong class="text-content">Tests</strong> (max hang, max pull-up) are repeated now and then and logged on their own, not as part of a workout.
        </p>
      </div>
    {/if}
    <div class="card py-1 divide-y divide-border">
      {#each sectionPages as p (p.id)}
        <NavRow icon={p.icon} title={p.label} hint={p.hint} onclick={() => { page = p.id; phaseId = null; }} />
      {/each}
    </div>
  {:else if page === 'exercises'}
    <ExerciseSettings bind:exerciseTypes bind:analyticsCategories {templates} />
  {:else if page === 'circuits'}
    <CircuitSettings />
  {:else if page === 'phases'}
    <PhaseSettings bind:phaseDefs bind:templates bind:phaseId onResetAllTemplates={resetTemplates} />
  {:else if page === 'benchmarks'}
    <BenchmarkTypeSettings bind:benchmarkTypes />
  {:else if page === 'values'}
    <ValueDefSettings />
  {:else if page === 'general'}
    <GeneralSettings />
  {:else if page === 'units'}
    <UnitsSettings />
  {:else if page === 'home'}
    <div class="space-y-4">
      <HomeLayoutSettings />
      <OrderedListSettings
        list="quickLogActions"
        title="Quick log (+)"
        hint="What the + on Home offers, and in which order."
        labels={{ pain: 'Log pain', bodyweight: 'Bodyweight', send: 'Outdoor send', benchmark: 'Test result' }}
      />
      <TunablesSettings topic="layout" title="Home lists" ids={['home.recentActivityCount', 'home.progressBenchmarks']} />
    </div>
  {:else if page === 'planCalendar'}
    <div class="space-y-4">
      <TunablesSettings topic="layout" title="Views" ids={['plan.weekAgenda', 'plan.weekListOnPhone', 'plan.exerciseList', 'plan.highContrast', 'plan.eventEdges', 'plan.calendarPhases', 'plan.calendarPhaseNames', 'plan.calendarPhaseTint', 'plan.calendarCategoryColors', 'plan.weekGridClear', 'plan.gridWholeWords', 'plan.gridTextSize', 'plan.gridWide', 'plan.gridPeek', 'plan.weekPatterns', 'plan.goalsInCalendar']} />
      <TunablesSettings topic="layout" title="Day" ids={['day.startHour', 'ui.clock12']} />
    </div>
  {:else if page === 'history'}
    <div class="space-y-4">
      <OrderedListSettings
        list="analyticsSections"
        title="Analytics cards"
        hint="Named as in Analytics, with the tab each one is on. Drag to reorder, switch off to hide."
        labels={Object.fromEntries(ANALYTICS_SECTION_IDS.map((id) => [id, analyticsSectionLabel(id)]))}
      />
      <TunablesSettings topic="layout" title="Rolling Load" ids={['analytics.plannedOutline']} />
      <ChartSettings />
    </div>
  {:else if page === 'live'}
    <div class="space-y-4">
      <SessionSettings />
      <TunablesSettings topic="layout" title="Circuits" ids={['circuit.askSkip']} />
    </div>
  {:else if page === 'timer'}
    <div class="space-y-4">
      <TimerSettings />
      <TunablesSettings topic="layout" title="Single-exercise timer" ids={['timer.leadIn', 'timer.setRest', 'timer.openNext']} />
      <div class="card py-1"><NavRow icon={findPage('sounds').page.icon} title={findPage('sounds').page.label} hint="How much it speaks up, beeps, vibration, spoken exercises" onclick={() => openPage('sounds')} /></div>
    </div>
  {:else if page === 'sounds'}
    <div class="space-y-4">
      <AudioLevelSettings />
      <SoundSettings />
      <VoiceSettings />
      <div class="card py-1"><NavRow icon={findPage('timer').page.icon} title={findPage('timer').page.label} hint="3-2-1, 15 s warning, screen on, background alerts" onclick={() => openPage('timer')} /></div>
    </div>
  {:else if page === 'model'}
    <div class="space-y-4">
      <p class="text-caption text-content-subtle px-1 leading-relaxed">These tune how the app judges your training - readiness, load zones, fatigue and alerts. The defaults are sensible starting points; change them if they don't match how you respond.</p>
      <TunablesSettings topic="model" title="Training model" />
    </div>
  {:else if page === 'pain'}
    <PainCheckInSettings />
  {:else if page === 'weather'}
    <div class="space-y-4">
      <PlacesSettings />
      <TunablesSettings topic="outdoor" title="Conditions & trips" />
    </div>
  {:else if page === 'reminders'}
    <RemindersSettings onopen={openPage} />
  {:else if page === 'coach'}
    <CoachNotesSettings />
  {:else if page === 'aiSharing'}
    <AISharingSettings />
  {:else if page === 'targets'}
    <TargetsSettings />
  {:else if page === 'aiDirect'}
    <DirectAISettings />
  {:else if page === 'sync'}
    <div class="space-y-4">
      <SyncSettings />
      <BackupSettings {onExport} {onImport} />
      <SettingsTransfer />
    </div>
  {:else if page === 'activityImport'}
    <div class="space-y-4">
      <ActivityImportSettings />
      <TunablesSettings topic="layout" title="Maps" ids={['activities.mapDefault']} />
    </div>
  {:else if page === 'healthConnect'}
    <HealthConnectSettings />
  {:else if page === 'deviceCalendar'}
    <DeviceCalendarSettings />
  {:else if page === 'exports'}
    <ExportSettings />
  {:else if page === 'widgets'}
    <WidgetSettings />
  {:else if page === 'about'}
    <AboutPage />
  {/if}

  {#if section !== null && page !== null}
    <PageReset {page} />
  {/if}
</div>
