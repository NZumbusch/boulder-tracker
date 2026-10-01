<script lang="ts">
  import { tour } from '../../lib/tour/tour.svelte';
  import HealthConnectSettings from './HealthConnectSettings.svelte';
  import IOSInstallSteps from '../onboarding/IOSInstallSteps.svelte';
  import { readBrowserInfo, shouldOfferIOSInstall } from '../../lib/pwa/platform';
  import { Capacitor } from '@capacitor/core';
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
  import CoachNotesSettings from './CoachNotesSettings.svelte';
  import CircuitSettings from './CircuitSettings.svelte';
  import AISharingSettings from './AISharingSettings.svelte';
  import PreferencesSettings, { APPEARANCE_TOPICS, type AppearanceTopic } from './PreferencesSettings.svelte';
  import NavRow from '../common/NavRow.svelte';
  import SyncSettings from './SyncSettings.svelte';
  import AppUpdateSettings from '../update/AppUpdateSettings.svelte';
  import ErrorLogCard from './ErrorLogCard.svelte';
  import { updater } from '../../lib/update/updater.svelte';
  import { APP_INFO } from '../../lib/appInfo';
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

  // --- State: Tabs ---
  type SettingsTab = 'overview' | 'customization' | 'design' | 'coach' | 'backup' | 'connections' | 'about';
  let currentTab = $state<SettingsTab>('overview');
  /** The open Appearance topic, if any - back returns to the topic list first. */
  let appearanceTopic = $state<AppearanceTopic | null>(null);
  function goBack() {
    if (currentTab === 'design' && appearanceTopic) appearanceTopic = null;
    else currentTab = 'overview';
  }
  // Back (phone key or browser) walks the same way: topic -> Appearance ->
  // Settings -> Home (the last step is the tab-level back, in uiStore).
  const inSection = $derived(currentTab !== 'overview');
  const inTopic = $derived(currentTab === 'design' && appearanceTopic !== null);
  backWhile(() => inSection, () => { currentTab = 'overview'; });
  backWhile(() => inTopic, () => { appearanceTopic = null; });

  // --- State: local editable copies of every catalog, saved as you edit ---
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
  const offerInstall = shouldOfferIOSInstall(readBrowserInfo(Capacitor.isNativePlatform()));
</script>

<div class="w-full max-w-lg space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-200 pb-24">
  <div class="flex items-center justify-between px-1">
    <div class="flex items-center gap-2">
      {#if currentTab === 'overview'}
        <button onclick={() => trainingState.navigate('home')} class="p-1.5 -ml-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors" aria-label="Back"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-title text-content">Settings</h2>
      {:else}
        <button onclick={goBack} class="p-1.5 -ml-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors" aria-label="Back"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-title text-content">
          {#if currentTab === 'customization'}Customization
          {:else if currentTab === 'design'}{APPEARANCE_TOPICS.find((t) => t.id === appearanceTopic)?.label ?? 'Appearance & Behaviour'}
          {:else if currentTab === 'coach'}Coach notes
          {:else if currentTab === 'backup'}Sync & Backup
          {:else if currentTab === 'connections'}Connections & Exports
          {:else if currentTab === 'about'}About & Help{/if}
        </h2>
      {/if}
    </div>
    {#if currentTab === 'customization' && saveState !== 'idle'}
      <span class="text-caption text-content-subtle flex items-center gap-1" aria-live="polite">
        {#if saveState === 'saving'}Saving…{:else}<Icon icon="ic:baseline-check" class="text-sm text-success" /> Saved{/if}
      </span>
    {/if}
  </div>

  {#if currentTab === 'overview'}
    <div class="card py-1 divide-y divide-border">
      <div data-tour="settings-customization"><NavRow icon="ic:baseline-tune" title="Customization" hint="Exercises, circuits, categories, training phases, templates & benchmarks" onclick={() => currentTab = 'customization'} /></div>
      <NavRow icon="ic:baseline-color-lens" title="Appearance & Behaviour" hint="Theme, layout, timer, weather & notifications" onclick={() => { currentTab = 'design'; appearanceTopic = null; }} />
      <div data-tour="settings-coach"><NavRow icon="ic:baseline-psychology" title="Coach notes" hint="About me, standing goal and what the AI coach remembers" onclick={() => currentTab = 'coach'} /></div>
      <div data-tour="settings-data"><NavRow icon="ic:baseline-cloud-sync" title="Sync & Backup" hint="Keep your data safe: Google Drive sync, backups, start over" onclick={() => currentTab = 'backup'} /></div>
      <div data-tour="settings-connections"><NavRow icon="ic:baseline-swap-horiz" title="Connections & Exports" hint="Health Connect, calendar & PDF exports, AI sharing" onclick={() => currentTab = 'connections'} /></div>
      <NavRow icon="ic:baseline-info" title="About & Help" hint="Tour, install on iPhone, contact, privacy policy" onclick={() => currentTab = 'about'} />
    </div>
  {:else if currentTab === 'customization'}
    <div class="space-y-4">
      <div class="card space-y-2">
        <div class="flex items-center gap-2 text-primary">
          <Icon icon="ic:baseline-info" class="text-lg" />
          <span class="text-label">How These Fit Together</span>
        </div>
        <p class="text-caption text-content-muted leading-relaxed">
          <strong class="text-content">Exercises</strong> define what you can log in a workout, grouped for charts by <strong class="text-content">Analytics Category</strong>. <strong class="text-content">Training Phases</strong> (Strength, Deload, ...) are the macrocycle blocks you assign to weeks on the Training Plan calendar — tap a phase below to edit the default workouts it generates. <strong class="text-content">Benchmarks</strong> are separate periodic tests (max hang, max pull-up) logged on their own, not part of a workout.
        </p>
      </div>
      <ExerciseSettings bind:exerciseTypes bind:analyticsCategories {templates} />
      <CircuitSettings />
      <PhaseSettings bind:phaseDefs bind:templates onResetAllTemplates={resetTemplates} />
      <BenchmarkTypeSettings bind:benchmarkTypes />
    </div>
  {:else if currentTab === 'design'}
    <PreferencesSettings bind:topic={appearanceTopic} />
  {:else if currentTab === 'coach'}
    <CoachNotesSettings />
  {:else if currentTab === 'backup'}
    <div class="space-y-4">
      <SyncSettings />
      <BackupSettings {onExport} {onImport} />
      <SettingsTransfer />
    </div>
  {:else if currentTab === 'connections'}
    <div class="space-y-4">
      <HealthConnectSettings />
      <ExportSettings />
      <AISharingSettings />
    </div>
  {:else if currentTab === 'about'}
    <div class="space-y-4">
      <AppUpdateSettings />
      <div class="card space-y-3 animate-in fade-in">
        <h4 class="text-section uppercase text-content-muted px-1">Help</h4>
        <button
          onclick={() => tour.start()}
          disabled={trainingState.isSessionActive}
          class="w-full flex items-center justify-between py-2 group disabled:opacity-50"
        >
          <span class="flex items-center gap-3">
            <Icon icon="ic:baseline-tour" class="text-xl text-content-subtle group-hover:text-primary transition-colors" />
            <span class="text-left">
              <span class="block text-body font-semibold text-content group-hover:text-primary transition-colors">Take the tour</span>
              <span class="block text-caption text-content-subtle">{trainingState.isSessionActive ? 'Finish your running session first' : 'Every screen, on example data. Nothing is saved.'}</span>
            </span>
          </span>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
        </button>
        {#if offerInstall}
          <div class="pt-3 border-t border-border space-y-3">
            <p class="text-body font-semibold text-content">Add to your Home Screen</p>
            <p class="text-caption text-content-subtle leading-relaxed">Opens full screen, works offline, and keeps Safari from clearing your data. The Home Screen app has its own data, so export a backup here first and import it there.</p>
            <IOSInstallSteps />
          </div>
        {/if}
      </div>
      <ErrorLogCard />
      <div class="card space-y-4 animate-in fade-in">
        <div class="space-y-4">
          <div class="text-center py-4">
            <Icon icon="ic:baseline-terrain" class="text-6xl text-primary mx-auto mb-2" />
            <h3 class="text-title text-content">{APP_INFO.name}</h3>
            <p class="text-body text-content-subtle mt-1">Version {updater.installedName ?? APP_INFO.version}</p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">Impressum</h4>
            <p class="text-caption text-content-muted leading-relaxed">
              {APP_INFO.developer}<br/>
              <a href="mailto:{APP_INFO.email}" class="text-primary">{APP_INFO.email}</a><br/>
              <a href={APP_INFO.homepage} target="_blank" rel="noopener" class="text-primary">{APP_INFO.homepage.replace('https://', '')}</a>
            </p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">Privacy</h4>
            <p class="text-caption text-content-muted leading-relaxed">
              No account, no server, no ads, no tracking - your data stays on this device, and in your own Google Drive if you turn on sync.
              <a href={APP_INFO.privacyUrl} target="_blank" rel="noopener" class="text-primary">Privacy policy</a>
            </p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">Credits</h4>
            <ul class="text-caption text-content-muted space-y-1 list-disc list-inside">
              <li>Built with Svelte and Capacitor</li>
              <li>Icons: Material Icons, via Iconify</li>
              <li>Weather data by <a href="https://open-meteo.com" target="_blank" rel="noopener" class="text-primary">Open-Meteo.com</a> (CC BY 4.0)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
