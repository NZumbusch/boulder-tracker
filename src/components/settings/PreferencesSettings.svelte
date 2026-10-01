<script lang="ts" module>
  export type AppearanceTopic = 'general' | 'home' | 'plan' | 'sessions' | 'charts' | 'model' | 'pain' | 'weather' | 'notifications';

  /** The topic list - also what Settings' header uses to title an open topic. */
  export const APPEARANCE_TOPICS: { id: AppearanceTopic; label: string; hint: string; icon: string }[] = [
    { id: 'general', label: 'General', hint: 'Theme, text size, motion, units', icon: 'ic:baseline-palette' },
    { id: 'home', label: 'Home', hint: 'Cards and their details, quick log, list lengths, reminders', icon: 'ic:baseline-home' },
    { id: 'plan', label: 'Plan', hint: 'Week view', icon: 'ic:baseline-calendar-month' },
    { id: 'sessions', label: 'Sessions & Timer', hint: 'Live sessions, timer sounds and screen', icon: 'ic:baseline-timer' },
    { id: 'charts', label: 'History & Analytics', hint: 'Analytics cards, recovery chart, sends chart', icon: 'ic:baseline-bar-chart' },
    { id: 'model', label: 'Training model', hint: 'Readiness, ACWR zones, fatigue recovery, rest-day alert', icon: 'ic:baseline-tune' },
    { id: 'pain', label: 'Pain check-ins', hint: 'Home, after sessions, reminder, when to ask to close', icon: 'ic:baseline-healing' },
    { id: 'weather', label: 'Weather & outdoor', hint: 'Locations, crags, conditions, trips', icon: 'ic:baseline-cloud' },
    { id: 'notifications', label: 'Notifications', hint: 'Reminders', icon: 'ic:baseline-notifications' },
  ];
</script>

<script lang="ts">
  import type { ThemePreference } from '../../lib/preferences/theme';
  /**
   * "Appearance & Behaviour" tab, grouped by the part of the app each
   * setting affects: a short topic list, each opening its own page. The
   * open topic is owned by `Settings.svelte` (bound here) so its header's
   * back arrow can return to this list before leaving the tab.
   */
  import PainCheckInSettings from './PainCheckInSettings.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import HomeLayoutSettings from './HomeLayoutSettings.svelte';
  import PlanDisplaySettings from './PlanDisplaySettings.svelte';
  import ChartSettings from './ChartSettings.svelte';
  import SessionSettings from './SessionSettings.svelte';
  import TimerSettings from './TimerSettings.svelte';
  import WeatherSettings from './WeatherSettings.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import TunablesSettings from './TunablesSettings.svelte';
  import UnitsSettings from './UnitsSettings.svelte';
  import OrderedListSettings from './OrderedListSettings.svelte';
  import NavRow from '../common/NavRow.svelte';
  import Icon from "@iconify/svelte";
  import { Capacitor } from '@capacitor/core';

  let { topic = $bindable(null) }: { topic?: AppearanceTopic | null } = $props();

  // Reminders are local notifications, which only exist in the Android
  // app - in the browser the topic would open an empty page.
  const topics = Capacitor.isNativePlatform() ? APPEARANCE_TOPICS : APPEARANCE_TOPICS.filter((t) => t.id !== 'notifications');
</script>

<div class="space-y-4">
  {#if topic === null}
    <div class="card py-1 divide-y divide-border animate-in fade-in">
      {#each topics as t (t.id)}
        <NavRow icon={t.icon} title={t.label} hint={t.hint} onclick={() => topic = t.id} />
      {/each}
    </div>
  {:else if topic === 'general'}
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Theme</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Auto follows your phone's light or dark mode. High contrast is pure black and white - easiest to read outdoors in bright sun.</p>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      {#each [['system', 'Auto', 'ic:baseline-brightness-auto'], ['light', 'Light', 'ic:baseline-light-mode'], ['dark', 'Dark', 'ic:baseline-dark-mode'], ['contrast', 'Contrast', 'ic:baseline-contrast']] as [id, label, icon]}
        <button
          onclick={() => trainingState.setTheme(id as ThemePreference)}
          aria-pressed={trainingState.theme === id}
          class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-label rounded-control transition-all {trainingState.theme === id ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
        >
          <Icon {icon} class="text-base" />{label}
        </button>
      {/each}
    </div>
  </div>

    <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Text Size</h3>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setTextScale('sm')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'sm' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Small</button>
      <button onclick={() => trainingState.setTextScale('md')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'md' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Default</button>
      <button onclick={() => trainingState.setTextScale('lg')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'lg' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Large</button>
    </div>
  </div>

    <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Bottom Bar</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Show the tab names under the icons.</p>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setNavLabels(false)} class="flex-1 py-2.5 text-label rounded-control transition-all {!trainingState.navLabels ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Icons only</button>
      <button onclick={() => trainingState.setNavLabels(true)} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.navLabels ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Icons + labels</button>
    </div>
  </div>

    <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Help Buttons</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">The (?) next to terms like load, ACWR and phases - tap one for what it means.</p>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setHelpButtons(true)} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.helpButtons ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Show</button>
      <button onclick={() => trainingState.setHelpButtons(false)} class="flex-1 py-2.5 text-label rounded-control transition-all {!trainingState.helpButtons ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Hide</button>
    </div>
  </div>

    <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Motion</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">"System" follows your device's reduced-motion setting automatically.</p>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setMotion('system')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'system' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">System</button>
      <button onclick={() => trainingState.setMotion('full')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'full' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Full</button>
      <button onclick={() => trainingState.setMotion('reduced')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.motion === 'reduced' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Reduced</button>
    </div>
  </div>

    <UnitsSettings />
  {:else if topic === 'home'}
    <HomeLayoutSettings />
    <OrderedListSettings
      list="quickLogActions"
      title="Quick log (+)"
      hint="What the + on Home offers, and in which order."
      labels={{ pain: 'Log pain', bodyweight: 'Bodyweight', send: 'Outdoor send', benchmark: 'Benchmark' }}
    />
    <TunablesSettings topic="layout" title="Lists & reminders" />
  {:else if topic === 'plan'}
    <PlanDisplaySettings />
  {:else if topic === 'sessions'}
    <SessionSettings />
    <TimerSettings />
  {:else if topic === 'charts'}
    <OrderedListSettings
      list="analyticsSections"
      title="Analytics cards"
      hint="Drag to reorder; untick to hide."
      labels={{ load: 'Rolling Load & ACWR', strain: 'Monotony & Strain', fingerLoad: 'Filtered Load', heatmap: 'Training Calendar', mix: 'Training Mix', fatigue: 'Fatigue', recoveryTrend: 'Recovery (HRV · Sleep · RHR · weight)', pain: 'Pain', outdoor: 'Outdoor Ascents', benchmarks: 'Benchmark Progress', benchmarkOverview: 'All Benchmarks' }}
    />
    <ChartSettings />
  {:else if topic === 'model'}
    <p class="text-caption text-content-subtle px-1 leading-relaxed">These tune how the app judges your training - readiness, load zones, fatigue and alerts. The defaults are sensible starting points; change them if they don't match how you respond.</p>
    <TunablesSettings topic="model" title="Training model" />
  {:else if topic === 'weather'}
    <WeatherSettings />
    <TunablesSettings topic="outdoor" title="Conditions & trips" />
  {:else if topic === 'pain'}
    <PainCheckInSettings />
  {:else if topic === 'notifications'}
    <NotificationSettings />
  {/if}
</div>
