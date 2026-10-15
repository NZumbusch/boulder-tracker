<script lang="ts">
  /** Settings -> Pain check-ins: where the "still there?" questions appear, and when an issue counts as gone quiet. */
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import Icon from '@iconify/svelte';
  import Toggle from '../ui/Toggle.svelte';

  const prefs = $derived(trainingState.painCheckIns);
  const native = Capacitor.isNativePlatform();
  const numberClass = 'field !w-20 text-center tabular-nums';
  /** A cleared box is left alone (an empty field is not 0 days); anything else is clamped by the store. */
  const daysFrom = (el: HTMLInputElement): number | null => (el.value.trim() === '' ? null : Number(el.value));
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-1 px-1">
    <h2 class="text-section uppercase text-content-muted">Pain check-ins</h2>
    <p class="text-caption text-content-subtle leading-relaxed">While a pain issue is open, the app asks how it is (gone, better, same or worse), so its course and the day it ended are recorded without you having to remember.</p>
  </div>

  <div class="divide-y divide-border">
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-home" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={prefs.home} onChange={(v) => trainingState.setPainCheckIns({ home: v })} label="On Home" hint="Asks once a day about issues not checked in yet" />
      </div>
    </div>
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-check-circle" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={prefs.session} onChange={(v) => trainingState.setPainCheckIns({ session: v })} label="After a session" hint="In the rating sheet: how did each open issue take it?" />
      </div>
    </div>
    <div class="flex items-center justify-between gap-3 py-2">
      <label for="pain-stale-days" class="flex items-center gap-3 min-w-0">
        <Icon icon="ic:baseline-help-outline" class="text-lg text-content-muted shrink-0" />
        <span>
          <span class="block text-body text-content">Ask whether it is over after</span>
          <span class="block text-caption text-content-subtle">Days without a check-in before Home asks "still an issue?"</span>
        </span>
      </label>
      <span class="flex items-center gap-1.5 shrink-0">
        <input id="pain-stale-days" type="number" inputmode="numeric" min="1" max="60" value={prefs.staleDays} onchange={(e) => { const n = daysFrom(e.currentTarget); if (n === null) e.currentTarget.value = String(prefs.staleDays); else trainingState.setPainCheckIns({ staleDays: n }); }} class={numberClass} />
        <span class="text-caption text-content-subtle">days</span>
      </span>
    </div>
    {#if native}
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-notifications" class="text-lg text-content-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <Toggle checked={prefs.reminder} onChange={(v) => trainingState.setPainCheckIns({ reminder: v })} label="Reminder notification" hint="When an open issue hasn't been checked in for a while" />
        </div>
      </div>
      {#if prefs.reminder}
        <div class="flex flex-wrap items-center justify-between gap-3 py-2 pl-9">
          <label for="pain-reminder-days" class="text-body text-content">Remind me after</label>
          <span class="flex items-center gap-1.5">
            <input id="pain-reminder-days" type="number" inputmode="numeric" min="1" max="60" value={prefs.reminderDays} onchange={(e) => { const n = daysFrom(e.currentTarget); if (n === null) e.currentTarget.value = String(prefs.reminderDays); else trainingState.setPainCheckIns({ reminderDays: n }); }} class={numberClass} />
            <span class="text-caption text-content-subtle">days, at</span>
            <input type="time" aria-label="Reminder time" value={prefs.reminderTime} onchange={(e) => trainingState.setPainCheckIns({ reminderTime: e.currentTarget.value })} class="field !w-auto tabular-nums" />
          </span>
        </div>
      {/if}
    {/if}
  </div>
</div>
