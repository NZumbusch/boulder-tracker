<script lang="ts">
  import { trainingState } from '../../lib/state.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { storage } from '../../lib/storage';
  import { showAlert, showConfirm } from '../../lib/utils';
  import type { ExerciseTypeDef, PhaseDef, WorkoutTemplate, BenchmarkTypeDef, AnalyticsCategory } from '../../lib/types';
  import ExerciseSettings from './ExerciseSettings.svelte';
  import PhaseSettings from './PhaseSettings.svelte';
  import BenchmarkTypeSettings from './BenchmarkTypeSettings.svelte';
  import BackupSettings from './BackupSettings.svelte';
  import AISharingSettings from './AISharingSettings.svelte';
  import PreferencesSettings, { APPEARANCE_TOPICS, type AppearanceTopic } from './PreferencesSettings.svelte';
  import NavRow from '../common/NavRow.svelte';
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
  type SettingsTab = 'overview' | 'customization' | 'design' | 'integration' | 'about';
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
    <div class="flex items-center gap-2">
      {#if currentTab === 'overview'}
        <button onclick={() => trainingState.navigate('home')} class="p-1.5 -ml-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors" aria-label="Back"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-title text-content">Settings</h2>
      {:else}
        <button onclick={goBack} class="p-1.5 -ml-1.5 rounded-control text-content-subtle hover:text-content hover:bg-surface-elevated transition-colors" aria-label="Back"><Icon icon="ic:baseline-arrow-back" class="text-xl" /></button>
        <h2 class="text-title text-content">
          {#if currentTab === 'customization'}Customization
          {:else if currentTab === 'design'}{APPEARANCE_TOPICS.find((t) => t.id === appearanceTopic)?.label ?? 'Appearance & Behaviour'}
          {:else if currentTab === 'integration'}Data & Exports
          {:else if currentTab === 'about'}About & Impressum{/if}
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
      <NavRow icon="ic:baseline-tune" title="Customization" hint="Exercises, categories, training phases, templates & benchmarks" onclick={() => currentTab = 'customization'} />
      <NavRow icon="ic:baseline-color-lens" title="Appearance & Behaviour" hint="Theme, layout, timer, weather & notifications" onclick={() => { currentTab = 'design'; appearanceTopic = null; }} />
      <NavRow icon="ic:baseline-sync" title="Data & Exports" hint="Backups, calendar/PDF export & AI sharing" onclick={() => currentTab = 'integration'} />
      <NavRow icon="ic:baseline-info" title="About & Impressum" hint="Application details and legal information" onclick={() => currentTab = 'about'} />
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
      <PhaseSettings bind:phaseDefs bind:templates onResetAllTemplates={resetTemplates} />
      <BenchmarkTypeSettings bind:benchmarkTypes />
    </div>
  {:else if currentTab === 'design'}
    <PreferencesSettings bind:topic={appearanceTopic} />
  {:else if currentTab === 'integration'}
    <div class="space-y-4">
      <BackupSettings {onExport} {onImport} />
      <AISharingSettings />
    </div>
  {:else if currentTab === 'about'}
    <div class="space-y-4">
      <div class="card space-y-4 animate-in fade-in">
        <div class="space-y-4">
          <div class="text-center py-4">
            <Icon icon="ic:baseline-terrain" class="text-6xl text-primary mx-auto mb-2" />
            <h3 class="text-title text-content">Climbing Tracker</h3>
            <p class="text-body text-content-subtle mt-1">Version 1.0.0</p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">Impressum</h4>
            <p class="text-caption text-content-muted leading-relaxed">
              Developer: Climbing Tracker Team<br/>
              Contact: support@climbingtracker.app<br/>
              <br/>
              Created with passion for the climbing community.
            </p>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">Credits & Dependencies</h4>
            <ul class="text-caption text-content-muted space-y-1 list-disc list-inside">
              <li>Built with Svelte & Capacitor</li>
              <li>Icons by Iconify (Material Icons)</li>
              <li>Charts powered by Chart.js</li>
            </ul>
          </div>

          <div class="space-y-2 pt-4 border-t border-border">
            <h4 class="text-section uppercase text-content-muted">License</h4>
            <p class="text-caption text-content-muted leading-relaxed">
              MIT License. See full terms online.
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
