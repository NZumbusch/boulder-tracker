<script lang="ts" module>
  export type AppearanceTopic = 'general' | 'home' | 'plan' | 'sessions' | 'charts' | 'weather' | 'notifications';

  /** The topic list - also what Settings' header uses to title an open topic. */
  export const APPEARANCE_TOPICS: { id: AppearanceTopic; label: string; hint: string; icon: string }[] = [
    { id: 'general', label: 'General', hint: 'Theme, text size, motion', icon: 'ic:baseline-palette' },
    { id: 'home', label: 'Home', hint: 'Which cards show, their order and details', icon: 'ic:baseline-home' },
    { id: 'plan', label: 'Plan', hint: 'Week view', icon: 'ic:baseline-calendar-month' },
    { id: 'sessions', label: 'Sessions & Timer', hint: 'Live sessions, timer sounds and screen', icon: 'ic:baseline-timer' },
    { id: 'charts', label: 'History & Analytics', hint: 'Chart density, sends-by-grade counts', icon: 'ic:baseline-bar-chart' },
    { id: 'weather', label: 'Weather', hint: 'Home location and crags', icon: 'ic:baseline-cloud' },
    { id: 'notifications', label: 'Notifications', hint: 'Reminders', icon: 'ic:baseline-notifications' },
  ];
</script>

<script lang="ts">
  /**
   * "Appearance & Behaviour" tab, grouped by the part of the app each
   * setting affects: a short topic list, each opening its own page. The
   * open topic is owned by `Settings.svelte` (bound here) so its header's
   * back arrow can return to this list before leaving the tab.
   */
  import { trainingState } from '../../lib/state.svelte';
  import HomeLayoutSettings from './HomeLayoutSettings.svelte';
  import PlanDisplaySettings from './PlanDisplaySettings.svelte';
  import ChartSettings from './ChartSettings.svelte';
  import SessionSettings from './SessionSettings.svelte';
  import TimerSettings from './TimerSettings.svelte';
  import WeatherSettings from './WeatherSettings.svelte';
  import NotificationSettings from './NotificationSettings.svelte';
  import Icon from "@iconify/svelte";
  import { Capacitor } from '@capacitor/core';

  let { topic = $bindable(null) }: { topic?: AppearanceTopic | null } = $props();

  // Reminders are local notifications, which only exist in the Android
  // app - in the browser the topic would open an empty page.
  const topics = Capacitor.isNativePlatform() ? APPEARANCE_TOPICS : APPEARANCE_TOPICS.filter((t) => t.id !== 'notifications');
</script>

<div class="space-y-4">
  {#if topic === null}
    <div class="space-y-2 animate-in fade-in">
      {#each topics as t (t.id)}
        <button onclick={() => topic = t.id} class="w-full flex items-center justify-between p-4 bg-surface/50 hover:bg-surface-elevated border border-border rounded-card transition-all group shadow-card">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="p-2 bg-primary-hover/10 rounded-control text-primary shrink-0"><Icon icon={t.icon} class="text-xl" /></div>
            <div class="text-left min-w-0">
              <p class="text-body font-bold text-content">{t.label}</p>
              <p class="text-caption text-content-subtle mt-0.5 truncate">{t.hint}</p>
            </div>
          </div>
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle group-hover:text-content text-xl shrink-0" />
        </button>
      {/each}
    </div>
  {:else if topic === 'general'}
  <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Theme</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Configure interface themes and high-contrast settings to optimize visibility across diverse lighting conditions.</p>
    </div>
    <div class="space-y-3">
      <button
        onclick={() => trainingState.setTheme('dark')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-dark-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">Dark Theme (Default)</p>
          </div>
        </div>
        {#if trainingState.theme === 'dark'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('light')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-light-mode" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">Light Theme</p>
          </div>
        </div>
        {#if trainingState.theme === 'light'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>

      <button
        onclick={() => trainingState.setTheme('contrast')}
        class="w-full flex items-center justify-between p-4 rounded-card border transition-all {trainingState.theme === 'contrast' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-contrast" class="text-xl" />
          <div class="text-left">
            <p class="text-body font-bold">High Contrast</p>
            <p class="text-caption opacity-80 mt-1">Maximized contrast ratio for optimal outdoor readability.</p>
          </div>
        </div>
        {#if trainingState.theme === 'contrast'}
          <Icon icon="ic:baseline-check-circle" class="text-xl" />
        {/if}
      </button>
    </div>
  </div>

    <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Text Size</h3>
    </div>
    <div class="flex bg-surface-elevated/50 p-1 rounded-control">
      <button onclick={() => trainingState.setTextScale('sm')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'sm' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Small</button>
      <button onclick={() => trainingState.setTextScale('md')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'md' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Default</button>
      <button onclick={() => trainingState.setTextScale('lg')} class="flex-1 py-2.5 text-label rounded-control transition-all {trainingState.textScale === 'lg' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}">Large</button>
    </div>
  </div>

    <div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
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

  {:else if topic === 'home'}
    <HomeLayoutSettings />
  {:else if topic === 'plan'}
    <PlanDisplaySettings />
  {:else if topic === 'sessions'}
    <SessionSettings />
    <TimerSettings />
  {:else if topic === 'charts'}
    <ChartSettings />
  {:else if topic === 'weather'}
    <WeatherSettings />
  {:else if topic === 'notifications'}
    <NotificationSettings />
  {/if}
</div>
