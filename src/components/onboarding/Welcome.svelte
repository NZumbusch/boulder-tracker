<script lang="ts">
  /**
   * First-run setup on a fresh install: training level (which starter
   * templates the phases get), units, an optional home location, and on an
   * iPhone in Safari the "Add to Home Screen" steps. Ends by offering the
   * tour. Everything here can be changed later in Settings, and every step
   * but the first can be skipped.
   *
   * On an iPhone in Safari, or inside another app's browser, nothing is set up
   * first: the Home Screen app (and the real browser) keep their own storage, so
   * setup done here would be thrown away. Those visitors get only the install
   * (or "open in…") step, with a way to carry on in the browser anyway.
   */
  import Icon from '@iconify/svelte';
  import { settingsPath } from '../../lib/settings/tree';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import { isAndroidWeb, isInAppBrowser, isIOS, readBrowserInfo, shouldOfferIOSInstall } from '../../lib/pwa/platform';
  import { untrack } from 'svelte';
  import { showUndo } from '../../lib/toast.svelte';
  import { copyPageLink } from '../../lib/pwa/copyLink';
  import { unitsFromLocale } from '../../lib/onboarding/units';
  import { firstPlanWeek, previewOf, starterPlanOptions } from '../../lib/planning/starterPlan';
  import { blockFirstWeekId } from '../../lib/planning/trainingBlocks';
  import { tour } from '../../lib/tour/tour.svelte';
  import LocationEditor from '../settings/LocationEditor.svelte';
  import IOSInstallSteps from './IOSInstallSteps.svelte';
  import PlatformTable from './PlatformTable.svelte';
  import IntroSlides from './IntroSlides.svelte';
  import RadioCards from './RadioCards.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { driveSync } from '../../lib/sync/driveSync.svelte';
  import { defaultPlanChoice, focusToProfile, type Discipline, type StartGoal } from '../../lib/onboarding/focus';
  import type { WeatherLocation } from '../../lib/preferences/migrate';

  type Step = 'intro' | 'returning' | 'platforms' | 'focus' | 'level' | 'plan' | 'units' | 'location' | 'install' | 'done';
  const native = Capacitor.isNativePlatform();
  const info = readBrowserInfo(native);
  const inApp = isInAppBrowser(info);
  const offerInstall = shouldOfferIOSInstall(info);
  const browserName = isIOS(info) ? 'Safari' : 'Chrome';
  /** Install (or switch browser) before any setup. "Use it in the browser" drops it. */
  let gate = $state(offerInstall || inApp);
  /** "I already use Boulder Tracker": restore a backup or sign in to Drive instead of the setup. */
  let returning = $state(false);
  const steps = $derived<Step[]>(
    returning ? ['intro', 'returning']
    : gate ? ['intro', 'install']
    : ['intro', ...(native ? [] : (['platforms'] as Step[])), 'focus', 'level', 'plan', 'units', 'location', 'done'],
  );

  let index = $state(0);
  const step = $derived(steps[index]);
  let level = $state('getting-started');
  let applying = $state(false);

  // The first weeks of a plan, so Plan and Home aren't empty. Nothing is written until "Use this plan".
  const planOptions = starterPlanOptions(firstPlanWeek(new Date()));
  let planChoice = $state<string>(planOptions[0].id);
  /** The blocks saved from an earlier pick of this step (going back and choosing again replaces them). */
  let planBlockIds = $state<string[]>([]);
  const planStart = new Date(`${planOptions[0].blocks[0].startDate}T00:00:00Z`);
  const planStartLabel = planStart?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  async function choosePlan() {
    applying = true;
    try {
      const option = planOptions.find((o) => o.id === planChoice) ?? null;
      planBlockIds = await trainingState.replaceStarterPlan(planBlockIds, option);
    } finally {
      applying = false;
    }
    next();
  }

  // --- Returning users ---
  let restoring = $state(false);
  async function restoreBackup(event: Event) {
    restoring = true;
    try {
      if (await trainingState.importData(event)) trainingState.setWelcomeDone(true);
    } finally {
      restoring = false;
    }
  }
  let connecting = $state(false);
  async function connectDrive() {
    connecting = true;
    try {
      await driveSync.connect();
    } finally {
      connecting = false;
    }
    // Connected means the first sync has pulled whatever Drive holds; a choice
    // between merging and replacing only arises when this device has data.
    if (driveSync.connected) trainingState.setWelcomeDone(true);
  }

  // --- What they climb, and what for ---
  let discipline = $state<Discipline | null>(null);
  let goal = $state<StartGoal | null>(null);
  async function chooseFocus() {
    const profile = focusToProfile(discipline, goal, trainingState.athleteProfile);
    if (profile) await trainingState.saveAthleteProfile(profile);
    planChoice = defaultPlanChoice(goal);
    next();
  }

  const next = () => (index = Math.min(index + 1, steps.length - 1));
  const back = () => {
    if (returning && index <= 1) returning = false;
    index = Math.max(index - 1, 0);
  };
  function useBrowserAnyway() {
    gate = false;
    index = 1;
  }
  const copyLink = () => copyPageLink(browserName);

  async function chooseLevel() {
    applying = true;
    try {
      await trainingState.applyStarterSet(level);
    } finally {
      applying = false;
    }
    next();
  }

  function setMetric(metric: boolean) {
    trainingState.setUnit('weight', metric ? 'kg' : 'lb');
    trainingState.setUnit('temperature', metric ? 'C' : 'F');
    trainingState.setUnit('wind', metric ? 'kmh' : 'mph');
  }
  const metric = $derived(trainingState.units.weight === 'kg');

  // The Units step starts on what the phone's region uses, but only while nothing was chosen yet (all units at their defaults).
  let unitsPreselected = $state(false);
  let unitsGuessed = false;
  $effect(() => {
    if (step !== 'units' || unitsGuessed) return;
    unitsGuessed = true;
    untrack(() => {
      const u = trainingState.units;
      if (u.weight !== 'kg' || u.temperature !== 'C' || u.wind !== 'kmh' || u.grades !== 'font') return;
      const guess = unitsFromLocale(typeof navigator !== 'undefined' ? navigator.language : null);
      if (guess.metric && guess.grades === 'font') return;
      setMetric(guess.metric);
      trainingState.setUnit('grades', guess.grades);
      unitsPreselected = true;
    });
  });

  const FOCUS_DISCIPLINES: { value: Discipline; label: string }[] = [
    { value: 'boulder', label: 'Bouldering' },
    { value: 'routes', label: 'Routes (sport and lead)' },
    { value: 'both', label: 'Both' },
  ];
  const FOCUS_GOALS: { value: StartGoal; label: string; hint: string }[] = [
    { value: 'stronger', label: 'Get stronger', hint: 'A plan that builds up steadily.' },
    { value: 'trip', label: 'Peak for a trip or competition', hint: 'You can add its date to Plan afterwards.' },
    { value: 'log', label: 'Just keep track', hint: 'No plan to start with.' },
  ];
  const planCards = $derived([
    ...planOptions.map((o) => ({
      value: o.id as string,
      label: o.name,
      hint: o.description,
      lines: previewOf(o, trainingState.templates, trainingState.phaseDefs).map((l) => `${l.phase}, ${l.weeks} ${l.weeks === 1 ? 'week' : 'weeks'}${l.sessions.length ? `: ${l.sessions.join(', ')}` : ''}`),
    })),
    { value: 'none', label: "I'll plan it myself", hint: 'Start with an empty plan.', lines: [] as string[] },
  ]);
  function finish(startTour: boolean) {
    trainingState.setWelcomeDone(true);
    const ids = planBlockIds;
    // Plan opens on the plan's first week, not on an empty current one.
    if (ids.length) trainingState.selectedWeekId = blockFirstWeekId(planOptions[0].blocks[0]);
    if (ids.length) showUndo('Starter plan added to Plan', async () => { await trainingState.replaceStarterPlan(ids, null); });
    if (startTour) void tour.start();
  }
</script>

<div class="fixed inset-0 z-[180] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Welcome">
  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="w-full max-w-md mx-auto px-5 pt-10 pb-6 space-y-6">
      {#if step !== 'intro' && !gate && !returning}
        <div class="space-y-2">
          <p class="text-caption text-content-subtle tabular-nums">Step {index} of {steps.length - 1}</p>
          <div class="flex gap-1.5" aria-hidden="true">
            {#each steps.slice(1) as _, i}
              <div class="h-1 flex-1 rounded-full {i < index ? 'bg-primary' : 'bg-surface-elevated'}"></div>
            {/each}
          </div>
        </div>
      {/if}

      {#if step === 'intro'}
        <div class="space-y-5 pt-4">
          <div class="flex items-center gap-3">
            <img src="./icons/icon-192.png" alt="" class="w-12 h-12 rounded-xl shrink-0" />
            <h1 class="font-bold text-content leading-tight whitespace-nowrap" style="font-size: clamp(1.5rem, 8vw, 2.1rem)">Boulder Tracker</h1>
          </div>
          <p class="text-body text-content-muted leading-relaxed">Plan your climbing training, log sessions as you go, and see how your load, fatigue and grades develop.</p>
          <IntroSlides />
          <p class="flex items-center gap-2.5 text-caption text-content-subtle"><Icon icon="ic:baseline-lock" class="text-base text-primary shrink-0" />No account: your data stays on this device.</p>
        </div>

      {:else if step === 'returning'}
        <div class="space-y-2 pt-6">
          <h2 class="text-title text-content">Welcome back</h2>
          <p class="text-body text-content-muted leading-relaxed">Bring your data over and skip the setup.</p>
        </div>
        <div class="space-y-2.5">
          <label class="block w-full text-left p-4 min-h-11 rounded-card border border-border bg-surface hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/50 transition-colors cursor-pointer {restoring ? 'opacity-60 pointer-events-none' : ''}">
            <p class="text-body font-bold text-content">{restoring ? 'Restoring…' : 'Restore a backup file'}</p>
            <p class="text-caption text-content-subtle mt-1 leading-relaxed">The .json file from {settingsPath('sync')} on your other device, or the weekly backup in Documents/BoulderTracker.</p>
            <!-- Visually hidden, not display:none: the file picker stays reachable by keyboard (the label shows the focus). -->
            <input type="file" accept=".json,application/json" class="sr-only" onchange={restoreBackup} />
          </label>
          {#if driveSync.available}
            <button onclick={connectDrive} disabled={connecting} class="w-full text-left p-4 min-h-11 rounded-card border border-border bg-surface hover:border-border-strong transition-colors disabled:opacity-60">
              <p class="text-body font-bold text-content">{connecting ? 'Connecting…' : 'Connect Google Drive'}</p>
              <p class="text-caption text-content-subtle mt-1 leading-relaxed">Sign in with the account you synced with before; your data comes back from your private app folder.</p>
            </button>
            {#if driveSync.error}<p class="text-caption text-status-caution px-1" role="alert">{driveSync.error}</p>{/if}
          {/if}
        </div>

      {:else if step === 'platforms'}
        <div class="space-y-2">
          <h2 class="text-title text-content">What works where</h2>
          <p class="text-body text-content-muted leading-relaxed">You're using the web version. It has everything for planning, logging and charts. Some things need the Android app.</p>
        </div>
        <PlatformTable />
        <p class="text-caption text-content-subtle leading-relaxed">Your data stays in this browser, so save a backup file now and then ({settingsPath('sync')}).{#if isAndroidWeb(info)} The Android app is a separate install; there's a link on Home.{/if}</p>

      {:else if step === 'focus'}
        <div class="space-y-2">
          <h2 class="text-title text-content">What do you climb?</h2>
          <p class="text-body text-content-muted leading-relaxed">The sessions and grades here are built around bouldering. Your answer goes to the AI coach, so its advice fits.</p>
        </div>
        <RadioCards label="What you climb" options={FOCUS_DISCIPLINES} value={discipline} onChange={(v) => (discipline = v)} compact />
        <div class="space-y-2 pt-2">
          <h2 class="text-title text-content">What are you after?</h2>
        </div>
        <RadioCards label="Your goal" options={FOCUS_GOALS} value={goal} onChange={(v) => (goal = v)} compact />
        <p class="text-caption text-content-subtle leading-relaxed">Both go into "About me" and your standing goal for the AI coach ({settingsPath('coach')}), where you can change them. Skippable.</p>

      {:else if step === 'level'}
        <div class="space-y-2">
          <h2 class="text-title text-content">How do you train?</h2>
          <p class="text-body text-content-muted leading-relaxed">This picks the sessions each training phase starts with. You can edit them, or switch, any time under {settingsPath('phases')}.</p>
        </div>
        <RadioCards label="Training level" options={DEFAULT_TEMPLATE_LIBRARY.map((s) => ({ value: s.id, label: s.name, hint: s.description }))} value={level} onChange={(v) => (level = v)} />

      {:else if step === 'plan'}
        <div class="space-y-2">
          <h2 class="text-title text-content">Your first weeks</h2>
          <p class="text-body text-content-muted leading-relaxed">So Plan isn't empty. Pick a shape; it starts on {planStartLabel}. You can change or delete it any time.</p>
        </div>
        <RadioCards label="Starter plan" options={planCards} value={planChoice} onChange={(v) => (planChoice = v)} />

      {:else if step === 'units'}
        <div class="space-y-2">
          <h2 class="text-title text-content">Units</h2>
          <p class="text-body text-content-muted leading-relaxed">For weights and the weather. Grades and each unit on its own are under {settingsPath('units')}.</p>
        </div>
        <RadioCards
          label="Units"
          options={[{ value: true, label: 'Metric', hint: 'kg · °C · km/h' }, { value: false, label: 'Imperial', hint: 'lb · °F · mph' }]}
          value={metric}
          onChange={setMetric}
        />
        <div class="space-y-2">
          <p class="text-label text-content-subtle">Boulder grades</p>
          <Segmented
            label="Boulder grades"
            variant="setting"
            full
            value={trainingState.units.grades}
            onChange={(v) => trainingState.setUnit('grades', v)}
            options={[{ value: 'font', label: 'Font (6A, 7B+)' }, { value: 'v', label: 'V-scale (V3, V8)' }]}
          />
        </div>
        {#if unitsPreselected}<p class="text-caption text-content-subtle leading-relaxed">Chosen from your phone's region. Change it if it is wrong.</p>{/if}

      {:else if step === 'location'}
        <div class="space-y-2">
          <h2 class="text-title text-content">Home location</h2>
          <p class="text-body text-content-muted leading-relaxed">Optional. Home then shows the weather and whether it's good conditions for climbing outside. Only the place's coordinates are sent to the weather service (Open-Meteo).</p>
        </div>
        <div class="card">
          <LocationEditor
            label="Home location"
            location={trainingState.homeLocation}
            onSet={(loc: WeatherLocation) => trainingState.setHomeLocation(loc)}
            onClear={() => trainingState.setHomeLocation(null)}
          />
        </div>

      {:else if step === 'install'}
        {#if inApp}
          <div class="space-y-2">
            <h2 class="text-title text-content">Open it in {browserName} first</h2>
            <p class="text-body text-content-muted leading-relaxed">You're in a browser built into another app. It can't put Boulder Tracker on your Home Screen, and what you enter here would stay behind when you switch to {browserName}.</p>
          </div>
          <ol class="space-y-2 text-body text-content list-decimal list-inside leading-relaxed">
            <li>Tap <strong>Copy link</strong>.</li>
            <li>Open {browserName} and paste it into the address bar.</li>
            {#if offerInstall}<li>Then add it to your Home Screen from there.</li>{/if}
          </ol>
          <button onclick={copyLink} class="btn btn-primary w-full">Copy link</button>
        {:else}
          <div class="space-y-2">
            <h2 class="text-title text-content">Put it on your Home Screen</h2>
            <p class="text-body text-content-muted leading-relaxed">It then opens full screen like an app and works without signal. It also keeps your data safe: Safari may clear a website's data after a week without a visit, but not an app's on the Home Screen.</p>
          </div>
          <IOSInstallSteps />
          <p class="text-caption text-content-subtle leading-relaxed">The Home Screen app starts fresh and keeps its own data, so set it up there, not here.</p>
        {/if}
        <div class="rounded-card bg-surface-elevated/60 p-4 space-y-2">
          <p class="text-label text-content">Rather stay in the browser?</p>
          <p class="text-caption text-content-subtle leading-relaxed">That works too. Just know the browser can erase this app's data (Safari does after about a week unused), and it won't have notifications, widgets or sync. Back up now and then. The button below carries on in the browser.</p>
        </div>

      {:else if step === 'done'}
        <div class="space-y-4 pt-6">
          <Icon icon="ic:baseline-check-circle" class="text-5xl text-success" />
          <h2 class="text-title text-content">You're set up</h2>
          <p class="text-body text-content-muted leading-relaxed">Want a quick tour? It shows every screen filled with example training, so you can see what each part does. Nothing from it is saved.</p>
          <p class="text-caption text-content-subtle leading-relaxed">You can take it later from {settingsPath('about')}.</p>
        </div>
      {/if}
    </div>
  </div>

  <div class="w-full max-w-md mx-auto px-5 pb-5 pt-3 flex gap-2 {step === 'intro' ? 'flex-col' : ''}">
    {#if step === 'intro'}
      <button onclick={next} class="btn btn-primary w-full">Get started</button>
      {#if !gate}
        <button onclick={() => { returning = true; index = 1; }} class="btn btn-ghost w-full">I already use Boulder Tracker</button>
      {/if}
    {:else if step === 'done'}
      <button onclick={() => finish(true)} class="btn btn-primary flex-1">Take the tour</button>
      <button onclick={() => finish(false)} class="btn btn-secondary">Later</button>
    {:else}
      <button onclick={back} class="btn btn-secondary px-5" aria-label="Back">
        <Icon icon="ic:baseline-arrow-back" class="text-lg" />
      </button>
      {#if step === 'install'}
        <!-- Always in reach: below the install steps it could sit under the fold. -->
        <button onclick={useBrowserAnyway} class="btn btn-secondary flex-1">Use it in the browser</button>
      {:else if step === 'returning'}
        <!-- Nothing to continue to: the way on is the choice above. -->
      {:else if step === 'plan'}
        <button onclick={choosePlan} disabled={applying} class="btn btn-primary flex-1">{planChoice === 'none' ? 'Continue without a plan' : 'Use this plan'}</button>
      {:else if step === 'focus'}
        <button onclick={chooseFocus} class="btn btn-primary flex-1">{discipline || goal ? 'Continue' : 'Skip'}</button>
      {:else if step === 'level'}
        <button onclick={chooseLevel} disabled={applying} class="btn btn-primary flex-1">Continue</button>
      {:else}
        <button onclick={next} class="btn btn-primary flex-1">
          {step === 'location' && !trainingState.homeLocation ? 'Skip' : 'Continue'}
        </button>
      {/if}
    {/if}
  </div>
</div>
