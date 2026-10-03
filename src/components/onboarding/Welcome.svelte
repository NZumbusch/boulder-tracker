<script lang="ts">
  /**
   * First-run setup on a fresh install: training level (which starter
   * templates the phases get), units, an optional home location, and on an
   * iPhone in Safari the "Add to Home Screen" steps. Ends by offering the
   * tour. Everything here can be changed later in Settings, and every step
   * but the first can be skipped. Decided with the user 2026-09-26.
   *
   * On an iPhone in Safari, or inside another app's browser, nothing is set up
   * first: the Home Screen app (and the real browser) keep their own storage, so
   * setup done here would be thrown away. Those visitors get only the install
   * (or "open in…") step, with a way to carry on in the browser anyway.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { DEFAULT_TEMPLATE_LIBRARY } from '../../lib/constants';
  import { isAndroidWeb, isInAppBrowser, isIOS, readBrowserInfo, shouldOfferIOSInstall } from '../../lib/pwa/platform';
  import { toast } from '../../lib/toast.svelte';
  import { tour } from '../../lib/tour/tour.svelte';
  import LocationEditor from '../settings/LocationEditor.svelte';
  import IOSInstallSteps from './IOSInstallSteps.svelte';
  import PlatformTable from './PlatformTable.svelte';
  import type { WeatherLocation } from '../../lib/preferences/migrate';

  type Step = 'intro' | 'platforms' | 'level' | 'units' | 'location' | 'install' | 'done';
  const native = Capacitor.isNativePlatform();
  const info = readBrowserInfo(native);
  const inApp = isInAppBrowser(info);
  const offerInstall = shouldOfferIOSInstall(info);
  const browserName = isIOS(info) ? 'Safari' : 'Chrome';
  /** Install (or switch browser) before any setup. "Use it in the browser" drops it. */
  let gate = $state(offerInstall || inApp);
  const steps = $derived<Step[]>(
    gate ? ['intro', 'install'] : ['intro', ...(native ? [] : (['platforms'] as Step[])), 'level', 'units', 'location', 'done'],
  );

  let index = $state(0);
  const step = $derived(steps[index]);
  let level = $state('getting-started');
  let applying = $state(false);

  const next = () => (index = Math.min(index + 1, steps.length - 1));
  const back = () => (index = Math.max(index - 1, 0));
  function useBrowserAnyway() {
    gate = false;
    index = 1;
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split('#')[0]);
      toast.show(`Link copied. Paste it into ${browserName}.`);
    } catch {
      toast.show(`Couldn't copy. Use the app's menu → "Open in browser".`);
    }
  }

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

  function finish(startTour: boolean) {
    trainingState.setWelcomeDone(true);
    if (startTour) void tour.start();
  }
</script>

<div class="fixed inset-0 z-[180] safe-y bg-app-bg flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Welcome">
  <div class="flex-1 overflow-y-auto no-scrollbar">
    <div class="w-full max-w-md mx-auto px-5 pt-10 pb-6 space-y-6">
      {#if step !== 'intro' && !gate}
        <div class="flex gap-1.5" aria-hidden="true">
          {#each steps.slice(1) as _, i}
            <div class="h-1 flex-1 rounded-full {i < index ? 'bg-primary' : 'bg-surface-elevated'}"></div>
          {/each}
        </div>
      {/if}

      {#if step === 'intro'}
        <div class="space-y-5 pt-8">
          <img src="./icons/icon-192.png" alt="" class="w-20 h-20 rounded-2xl" />
          <div class="space-y-2">
            <h1 class="text-display text-content leading-tight">Boulder Tracker</h1>
            <p class="text-body text-content-muted leading-relaxed">Plan your climbing training, log sessions as you go, and see how your load, fatigue and grades develop.</p>
          </div>
          <ul class="space-y-2.5">
            {#each [['ic:baseline-calendar-month', 'Plan weeks by training phase'], ['ic:baseline-timer', 'Live sessions with timers'], ['ic:baseline-show-chart', 'Load, fatigue and progress charts'], ['ic:baseline-lock', 'No account: your data stays on this device']] as [icon, text]}
              <li class="flex items-center gap-3 text-body text-content"><Icon {icon} class="text-lg text-primary shrink-0" />{text}</li>
            {/each}
          </ul>
        </div>

      {:else if step === 'level'}
        <div class="space-y-2">
          <h2 class="text-title text-content">How do you train?</h2>
          <p class="text-body text-content-muted leading-relaxed">This picks the sessions each training phase starts with. You can edit them, or switch, any time under Settings → Customization.</p>
        </div>
        <div class="space-y-2.5" role="radiogroup" aria-label="Training level">
          {#each DEFAULT_TEMPLATE_LIBRARY as set}
            <button
              role="radio"
              aria-checked={level === set.id}
              onclick={() => (level = set.id)}
              class="w-full text-left p-4 rounded-card border transition-colors {level === set.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-border-strong'}"
            >
              <p class="text-body font-bold text-content">{set.name}</p>
              {#if set.description}<p class="text-caption text-content-subtle mt-1 leading-relaxed">{set.description}</p>{/if}
            </button>
          {/each}
        </div>

      {:else if step === 'units'}
        <div class="space-y-2">
          <h2 class="text-title text-content">Units</h2>
          <p class="text-body text-content-muted leading-relaxed">For weights and the weather. Grades and each unit on its own are under Settings → Appearance & Behaviour → General.</p>
        </div>
        <div class="space-y-2.5" role="radiogroup" aria-label="Units">
          {#each [[true, 'Metric', 'kg · °C · km/h'], [false, 'Imperial', 'lb · °F · mph']] as [isMetric, name, detail]}
            <button
              role="radio"
              aria-checked={metric === isMetric}
              onclick={() => setMetric(isMetric as boolean)}
              class="w-full text-left p-4 rounded-card border transition-colors {metric === isMetric ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-border-strong'}"
            >
              <p class="text-body font-bold text-content">{name}</p>
              <p class="text-caption text-content-subtle mt-1">{detail}</p>
            </button>
          {/each}
        </div>
        <div class="space-y-2">
          <p class="text-label text-content-subtle">Grades</p>
          <div class="seg">
            <button class="seg-item flex-1 {trainingState.units.grades === 'font' ? 'seg-on' : ''}" onclick={() => trainingState.setUnit('grades', 'font')}>Font (6A, 7B+)</button>
            <button class="seg-item flex-1 {trainingState.units.grades === 'v' ? 'seg-on' : ''}" onclick={() => trainingState.setUnit('grades', 'v')}>V-scale (V3, V8)</button>
          </div>
        </div>

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

      {:else if step === 'platforms'}
        <div class="space-y-2">
          <h2 class="text-title text-content">What works where</h2>
          <p class="text-body text-content-muted leading-relaxed">You're using the web version. It has everything for planning, logging and charts. Some things need the Android app.</p>
        </div>
        <PlatformTable />
        <p class="text-caption text-content-subtle leading-relaxed">Your data stays in this browser, so save a backup file now and then (Settings → Data & Exports).{#if isAndroidWeb(info)} The Android app is a separate install; there's a link on Home.{/if}</p>

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
          <button onclick={copyLink} class="w-full py-3 bg-primary text-white text-body font-bold rounded-control">Copy link</button>
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
          <p class="text-caption text-content-subtle leading-relaxed">That works too. Just know the browser can erase this app's data (Safari does after about a week unused), and it won't have notifications, widgets or sync. Back up now and then.</p>
          <button onclick={useBrowserAnyway} class="w-full py-2.5 border border-border-strong text-label text-content rounded-control hover:bg-surface-elevated">Use it in the browser</button>
        </div>

      {:else if step === 'done'}
        <div class="space-y-4 pt-6">
          <Icon icon="ic:baseline-check-circle" class="text-5xl text-success" />
          <h2 class="text-title text-content">You're set up</h2>
          <p class="text-body text-content-muted leading-relaxed">Want a quick tour? It shows every screen filled with example training, so you can see what each part does. Nothing from it is saved.</p>
          <p class="text-caption text-content-subtle leading-relaxed">You can take it later from Settings → About & Help.</p>
        </div>
      {/if}
    </div>
  </div>

  <div class="w-full max-w-md mx-auto px-5 pb-5 pt-3 flex gap-2">
    {#if step === 'intro'}
      <button onclick={next} class="flex-1 py-3 bg-primary text-white text-body font-bold rounded-control">Get started</button>
    {:else if step === 'done'}
      <button onclick={() => finish(false)} class="px-5 py-3 bg-surface-elevated text-content-muted text-body font-bold rounded-control">Later</button>
      <button onclick={() => finish(true)} class="flex-1 py-3 bg-primary text-white text-body font-bold rounded-control">Take the tour</button>
    {:else}
      <button onclick={back} class="px-5 py-3 bg-surface-elevated text-content-muted text-body font-bold rounded-control" aria-label="Back">
        <Icon icon="ic:baseline-arrow-back" class="text-lg" />
      </button>
      {#if step === 'install'}
        <!-- Nothing to continue to: the way on is the install itself, or the choice above. -->
      {:else if step === 'level'}
        <button onclick={chooseLevel} disabled={applying} class="flex-1 py-3 bg-primary text-white text-body font-bold rounded-control disabled:opacity-50">Continue</button>
      {:else}
        <button onclick={next} class="flex-1 py-3 bg-primary text-white text-body font-bold rounded-control">
          {step === 'location' && !trainingState.homeLocation ? 'Skip' : 'Continue'}
        </button>
      {/if}
    {/if}
  </div>
</div>
