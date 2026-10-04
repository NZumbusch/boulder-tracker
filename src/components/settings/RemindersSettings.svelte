<script lang="ts">
  /**
   * Settings -> Reminders & nudges: the phone notifications (Android), the
   * nudges Home gives by itself, and a pointer to the reminders that belong
   * to a feature and so live with it (pain check-ins, the timer).
   */
  import { Capacitor } from '@capacitor/core';
  import NotificationSettings from './NotificationSettings.svelte';
  import TunablesSettings from './TunablesSettings.svelte';
  import NavRow from '../common/NavRow.svelte';
  import { findPage, type PageId } from '../../lib/settings/tree';

  let { onopen }: { onopen: (page: PageId) => void } = $props();
  const native = Capacitor.isNativePlatform();
  const elsewhere: { page: PageId; title: string; hint: string }[] = [
    { page: 'pain', title: 'Pain check-in reminder', hint: 'When an open issue has not been checked in for a while' },
    { page: 'timer', title: 'Timer alerts', hint: 'Notification and beeps while a timer runs in the background' },
  ];
</script>

<div class="space-y-4">
  <NotificationSettings />
  <TunablesSettings topic="layout" title="Nudges in the app" ids={['progress.retestWeeks', 'alerts.backupDays']} />
  <div class="card py-1 divide-y divide-border animate-in fade-in">
    <p class="text-caption text-content-subtle px-1 pt-3 pb-2 leading-relaxed">{native ? 'These reminders sit with the feature they belong to:' : 'Reminders on the phone need the Android app. These belong to a feature:'}</p>
    {#each elsewhere as e (e.page)}
      <NavRow icon={findPage(e.page).page.icon} title={e.title} hint={e.hint} onclick={() => onopen(e.page)} />
    {/each}
  </div>
</div>
