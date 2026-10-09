<script lang="ts">
  import HealthConnectSettings from './HealthConnectSettings.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { storage } from '../../lib/storage';
  import { showAlert, showConfirm } from '../../lib/utils';
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
  import WeatherSettings from './WeatherSettings.svelte';
  import RemindersSettings from './RemindersSettings.svelte';
  import { Capacitor } from '@capacitor/core';
  import { healthConnect } from '../../lib/health/healthConnect.svelte';
  import {
    findPage, findSection, searchSettings, visiblePages, visibleSections,
    type PageId, type SectionId, type SettingsContext,
  } from '../../lib/settings/tree';
  import NavRow from '../common/NavRow.svelte';
  import SyncSettings from './SyncSettings.svelte';
  import AboutPage from './AboutPage.svelte';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import Icon from "@iconify/svelte";

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
  const ctx: SettingsContext = $derived({ native: Capacitor.isNativePlatform(), widgets: widgetsAvailable(), healthConnect: healthConnect.supported });
  let section = $state<SectionId | null>(null);
  let page = $state<PageId | null>(null);
  let query = $state('');

  const sections = $derived(visibleSections(ctx));
  const sectionPages = $derived(section ? visiblePages(findSection(section), ctx) : []);
  /** A section with one page opens straight into it, so "back" skips the one-row list. */
  const singlePage = $derived(sectionPages.length === 1);

  function openSection(id: SectionId) {
    const pages = visiblePages(findSection(id), ctx);
    section = id;
    page = pages.length === 1 ? pages[0].id : null;
  }
  function openPage(id: PageId) {
    section = findPage(id).section.id;
    page = id;
    query = '';
  }
  function goBack() {
    if (page && !singlePage) page = null;
    else { section = null; page = null; }
  }
  // Back (phone key or browser) walks the same way: page -> section ->
  // Settings -> Home (the last step is the tab-level back, in uiStore).
  const inSection = $derived(section !== null);
  const inPage = $derived(page !== null && !singlePage);
  backWhile(() => inSection, () => { section = null; page = null; });
  backWhile(() => inPage, () => { page = null; });

  const hits = $derived(searchSettings(query, ctx));
  const title = $derived(
    page ? findPage(page).page.label
    : section ? findSection(section).label
    : 'Settings',
  );

  // --- State: local editable copies of every catalog, saved as they are edited ---
  let templates = $state<Record<string, WorkoutTemplate[]>>({});
  let phaseDefs = $state<PhaseDef[]>([]);
  let exerciseTypes = $state<ExerciseTypeDef[]>([]);
  let benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  let analyticsCategories = $state<AnalyticsCategory[]>([]);

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
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');

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
    } catch (err) {
      saveState = 'idle';
      await showAlert('Settings Error', err instanceof Error ? err.message : 'Failed to save settings.');
    }
  }

  async function resetTemplates() {
    const confirmed = await showConfirm('Reset Templates', 'Reset all templates to default? This will overwrite your customizations.');
    if (!confirmed) return;
    await trainingState.resetTemplates();
    templates = await storage.getTemplates();
    // Already saved by the reset - don't write it again.
    if (lastSaved) lastSaved.templates = current().templates;
  }
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-2 min-w-0">
      <button onclick={() => (section === null ? trainingState.navigate('home') : goBack())} class="p-1.5 -ml-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors" aria-label="Back"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
      <h2 class="text-title text-content truncate">{title}</h2>
    </div>
    {#if section === 'setup' && saveState !== 'idle'}
      <span class="text-caption text-content-subtle flex items-center gap-1" aria-live="polite">
        {#if saveState === 'saving'}Saving…{:else}<Icon icon="ic:baseline-check" class="text-sm text-success" /> Saved{/if}
      </span>
    {/if}
  </div>

  {#if section === null}
    <!-- Search: a setting by name, to the page it lives on. -->
    <div class="relative">
      <Icon icon="ic:baseline-search" class="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-content-subtle pointer-events-none" />
      <input
        type="search"
        bind:value={query}
        placeholder="Search settings"
        aria-label="Search settings"
        class="w-full pl-10 pr-3 py-2.5 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/50 placeholder:text-content-subtle"
      />
    </div>

    {#if query.trim()}
      {#if hits.length > 0}
        <div class="card py-1 divide-y divide-border">
          {#each hits as hit (hit.page + hit.label)}
            {@const where = findPage(hit.page)}
            <NavRow icon={where.page.icon} title={hit.label} hint={where.section.pages.length === 1 ? where.section.label : `${where.section.label} › ${where.page.label}`} onclick={() => openPage(hit.page)} />
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
          <span class="text-label">How These Fit Together</span>
        </div>
        <p class="text-caption text-content-muted leading-relaxed">
          <strong class="text-content">Exercises</strong> define what you can log in a workout, grouped for charts by <strong class="text-content">Analytics Category</strong>. <strong class="text-content">Training Phases</strong> (Strength, Deload, ...) are the macrocycle blocks you assign to weeks on the Training Plan calendar — each starts with default workouts you can edit. <strong class="text-content">Benchmarks</strong> are separate periodic tests (max hang, max pull-up) logged on their own, not part of a workout.
        </p>
      </div>
    {/if}
    <div class="card py-1 divide-y divide-border">
      {#each sectionPages as p (p.id)}
        <NavRow icon={p.icon} title={p.label} hint={p.hint} onclick={() => (page = p.id)} />
      {/each}
    </div>
  {:else if page === 'exercises'}
    <ExerciseSettings bind:exerciseTypes bind:analyticsCategories {templates} />
  {:else if page === 'circuits'}
    <CircuitSettings />
  {:else if page === 'phases'}
    <PhaseSettings bind:phaseDefs bind:templates onResetAllTemplates={resetTemplates} />
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
        labels={{ pain: 'Log pain', bodyweight: 'Bodyweight', send: 'Outdoor send', benchmark: 'Benchmark' }}
      />
      <TunablesSettings topic="layout" title="Home lists" ids={['home.recentActivityCount', 'home.progressBenchmarks']} />
    </div>
  {:else if page === 'history'}
    <div class="space-y-4">
      <OrderedListSettings
        list="analyticsSections"
        title="Analytics cards"
        hint="Drag to reorder; untick to hide."
        labels={{ load: 'Rolling Load & ACWR', strain: 'Monotony & Strain', fingerLoad: 'Filtered Load', heatmap: 'Training Calendar', mix: 'Training Mix', fatigue: 'Fatigue', recoveryTrend: 'Recovery (HRV · Sleep · RHR · weight)', pain: 'Pain', outdoor: 'Outdoor Ascents', benchmarks: 'Benchmark Progress', benchmarkOverview: 'All Benchmarks' }}
      />
      <ChartSettings />
    </div>
  {:else if page === 'live'}
    <div class="space-y-4"><SessionSettings /></div>
  {:else if page === 'timer'}
    <div class="space-y-4">
      <AudioLevelSettings />
      <TimerSettings />
      <SoundSettings />
      <VoiceSettings />
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
      <WeatherSettings />
      <TunablesSettings topic="outdoor" title="Conditions & trips" />
    </div>
  {:else if page === 'reminders'}
    <RemindersSettings onopen={openPage} />
  {:else if page === 'coach'}
    <CoachNotesSettings />
  {:else if page === 'aiSharing'}
    <AISharingSettings />
  {:else if page === 'sync'}
    <div class="space-y-4">
      <SyncSettings />
      <BackupSettings {onExport} {onImport} />
      <SettingsTransfer />
    </div>
  {:else if page === 'healthConnect'}
    <HealthConnectSettings />
  {:else if page === 'exports'}
    <ExportSettings />
  {:else if page === 'widgets'}
    <WidgetSettings />
  {:else if page === 'about'}
    <AboutPage />
  {/if}
</div>
