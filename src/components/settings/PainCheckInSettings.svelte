<script lang="ts">
  /** Settings -> Pain check-ins: where the "still there?" questions appear, and when an issue counts as gone quiet. */
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import Icon from '@iconify/svelte';

  const prefs = $derived(trainingState.painCheckIns);
  const native = Capacitor.isNativePlatform();
  const numberClass = 'w-16 px-2 py-1.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm text-center tabular-nums outline-none';
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1 px-1">
    <h3 class="text-section uppercase text-content-muted">Pain check-ins</h3>
    <p class="text-caption text-content-subtle leading-relaxed">While a pain issue is open, the app asks how it is - Gone, Better, Same or Worse - so its course and the day it ended are recorded without you having to remember.</p>
  </div>

  <div class="divide-y divide-border">
    <label class="w-full flex items-center justify-between gap-3 py-3 cursor-pointer">
      <span class="flex items-center gap-3">
        <Icon icon="ic:baseline-home" class="text-lg text-content-muted shrink-0" />
        <span>
          <span class="block text-body text-content">On Home</span>
          <span class="block text-caption text-content-subtle">Asks once a day about issues not checked in yet</span>
        </span>
      </span>
      <input type="checkbox" checked={prefs.home} onchange={(e) => trainingState.setPainCheckIns({ home: e.currentTarget.checked })} class="w-5 h-5 rounded accent-primary shrink-0" />
    </label>
    <label class="w-full flex items-center justify-between gap-3 py-3 cursor-pointer">
      <span class="flex items-center gap-3">
        <Icon icon="ic:baseline-check-circle" class="text-lg text-content-muted shrink-0" />
        <span>
          <span class="block text-body text-content">After a session</span>
          <span class="block text-caption text-content-subtle">In the rating sheet: how did each open issue take it?</span>
        </span>
      </span>
      <input type="checkbox" checked={prefs.session} onchange={(e) => trainingState.setPainCheckIns({ session: e.currentTarget.checked })} class="w-5 h-5 rounded accent-primary shrink-0" />
    </label>
    <div class="flex items-center justify-between gap-3 py-3">
      <span class="flex items-center gap-3">
        <Icon icon="ic:baseline-help-outline" class="text-lg text-content-muted shrink-0" />
        <span>
          <span class="block text-body text-content">Ask to close after</span>
          <span class="block text-caption text-content-subtle">Days without a check-in before Home asks "still an issue?"</span>
        </span>
      </span>
      <span class="flex items-center gap-1.5 shrink-0">
        <input type="number" min="1" max="60" value={prefs.staleDays} onchange={(e) => trainingState.setPainCheckIns({ staleDays: Number(e.currentTarget.value) })} class={numberClass} />
        <span class="text-caption text-content-subtle">days</span>
      </span>
    </div>
    {#if native}
      <label class="w-full flex items-center justify-between gap-3 py-3 cursor-pointer">
        <span class="flex items-center gap-3">
          <Icon icon="ic:baseline-notifications" class="text-lg text-content-muted shrink-0" />
          <span>
            <span class="block text-body text-content">Reminder notification</span>
            <span class="block text-caption text-content-subtle">When an open issue hasn't been checked in for a while</span>
          </span>
        </span>
        <input type="checkbox" checked={prefs.reminder} onchange={(e) => trainingState.setPainCheckIns({ reminder: e.currentTarget.checked })} class="w-5 h-5 rounded accent-primary shrink-0" />
      </label>
      {#if prefs.reminder}
        <div class="flex items-center justify-between gap-3 py-3 pl-9">
          <span class="text-body text-content">After</span>
          <span class="flex items-center gap-1.5">
            <input type="number" min="1" max="60" value={prefs.reminderDays} onchange={(e) => trainingState.setPainCheckIns({ reminderDays: Number(e.currentTarget.value) })} class={numberClass} />
            <span class="text-caption text-content-subtle">days, at</span>
            <input type="time" value={prefs.reminderTime} onchange={(e) => trainingState.setPainCheckIns({ reminderTime: e.currentTarget.value })} class="px-2 py-1.5 bg-surface-elevated text-content rounded-control border border-border-strong text-sm tabular-nums outline-none" />
          </span>
        </div>
      {/if}
    {/if}
  </div>
</div>
