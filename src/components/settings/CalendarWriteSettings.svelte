<script lang="ts">
  /**
   * Sessions in your calendar (Android): pick a calendar the sessions are written into, and what goes in. How it works:
   * `lib/calendarSync/calendarSync.svelte.ts`.
   */
  import { calendarSync } from '../../lib/calendarSync/calendarSync.svelte';
  import { ALL_WEEKS, WEEKS_AHEAD_CHOICES, WEEKS_BACK_CHOICES } from '../../lib/calendarSync/events';
  import { showConfirm } from '../../lib/utils';
  import ActionRow from './ActionRow.svelte';
  import Toggle from '../ui/Toggle.svelte';

  /** The calendar list is open (choosing the first calendar, or another one). */
  let picking = $state(false);

  $effect(() => {
    if (calendarSync.supported && calendarSync.enabled) void calendarSync.loadCalendars();
  });

  const byAccount = $derived.by(() => {
    const groups = new Map<string, typeof calendarSync.writable>();
    for (const c of calendarSync.writable) groups.set(c.account, [...(groups.get(c.account) ?? []), c]);
    return [...groups];
  });

  async function openPicker() {
    if (await calendarSync.loadCalendars(true)) picking = true;
  }

  async function pick(cal: (typeof calendarSync.writable)[number]) {
    if (calendarSync.enabled && calendarSync.calendarId && calendarSync.calendarId !== cal.id) {
      const ok = await showConfirm('Write into another calendar?', `New events go to "${cal.name}". What was written into "${calendarSync.calendarName ?? 'the old calendar'}" stays there - turn off with "remove the events" first to clear it.`, { ok: 'Switch', cancel: 'Cancel' });
      if (!ok) return;
    }
    picking = false;
    calendarSync.choose(cal);
  }

  async function turnOff() {
    const remove = await showConfirm(
      'Stop writing sessions?',
      `Remove the session events from "${calendarSync.calendarName ?? 'the calendar'}" too? Only events the app wrote are removed - your own stay.`,
      { ok: 'Remove them', cancel: 'Keep them' },
    );
    picking = false;
    await calendarSync.turnOff(remove);
  }

  const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const weeks = (n: number, all: string) => (n === ALL_WEEKS ? all : n === 0 ? 'none' : n === 52 ? 'a year' : n === 1 ? '1 week' : `${n} weeks`);
  const selectClass = 'field !w-auto max-w-[60%]';
</script>

{#if calendarSync.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h2 class="text-section uppercase text-content-muted">Sessions in your calendar</h2>
      <p class="text-caption text-content-subtle leading-relaxed">
        Writes your sessions into a calendar of your choice and keeps it up to date - moved, changed or deleted sessions follow. Best in an empty calendar of its own: make one (e.g. "Training") under a Google account in Google Calendar on the web, wait until it shows on the phone, then pick it here. The phone's Google sync takes the events to the cloud and to Samsung Calendar - free, no extra sign-in. One-way: edits made to these events in the calendar app are put back. Only events the app wrote are ever changed. Not shown again among the phone-calendar events on the Plan calendar.
      </p>
    </div>

    {#if calendarSync.enabled && !picking}
      <div class="space-y-1 px-1">
        <p class="text-body text-content">Writing into <span class="font-semibold">{calendarSync.calendarName ?? 'a calendar'}</span></p>
        <p class="text-caption text-content-subtle">
          {#if calendarSync.syncing}Writing…{:else if calendarSync.lastSyncAt}Last written {when(calendarSync.lastSyncAt)}{#if calendarSync.lastResult} · {calendarSync.lastResult.inserted} added, {calendarSync.lastResult.updated} changed, {calendarSync.lastResult.deleted} removed{/if}{:else}Not written yet{/if}.
        </p>
      </div>
      {#if calendarSync.missing}
        <p class="text-caption text-status-caution px-1" role="alert">"{calendarSync.calendarName}" is no longer on this phone (deleted, or its account removed). Pick another calendar or turn this off.</p>
      {/if}

      <div class="divide-y divide-border">
        <label class="flex items-center justify-between gap-3 min-h-11 py-2 px-1">
          <span class="text-body text-content">Weeks ahead</span>
          <select class={selectClass} value={calendarSync.options.weeksAhead} onchange={(e) => calendarSync.setOption('weeksAhead', Number(e.currentTarget.value))}>
            {#each WEEKS_AHEAD_CHOICES as n}<option value={n}>{weeks(n, 'whole plan')}</option>{/each}
          </select>
        </label>
        <label class="flex items-center justify-between gap-3 min-h-11 py-2 px-1">
          <span class="text-body text-content">Weeks back kept up to date</span>
          <select class={selectClass} value={calendarSync.options.weeksBack} onchange={(e) => calendarSync.setOption('weeksBack', Number(e.currentTarget.value))}>
            {#each WEEKS_BACK_CHOICES as n}<option value={n}>{weeks(n, 'all')}</option>{/each}
          </select>
        </label>
        <div class="px-1"><Toggle checked={calendarSync.options.includeDone} onChange={(v) => calendarSync.setOption('includeDone', v)} label="Done sessions" hint="Kept, at the time they happened, marked ✓" /></div>
        <div class="px-1"><Toggle checked={calendarSync.options.exercises} onChange={(v) => calendarSync.setOption('exercises', v)} label="Exercises in the description" /></div>
        <div class="px-1"><Toggle checked={calendarSync.options.planNotes} onChange={(v) => calendarSync.setOption('planNotes', v)} label="Plan notes in the description" /></div>
        <div class="px-1"><Toggle checked={calendarSync.options.howItWent} onChange={(v) => calendarSync.setOption('howItWent', v)} label={'"How it went" in the description'} hint="Your note after a done session" /></div>
      </div>
      <p class="text-caption text-content-subtle px-1">Older events stay as they were. No reminders are added.</p>

      <div class="flex flex-wrap gap-2">
        <button onclick={() => calendarSync.syncNow()} disabled={calendarSync.syncing} class="btn btn-primary">Sync now</button>
        <button onclick={openPicker} class="btn btn-secondary">Other calendar</button>
        <button onclick={turnOff} class="btn btn-danger">Turn off</button>
      </div>
    {:else if !picking}
      <ActionRow icon="ic:baseline-edit-calendar" title="Write sessions into a calendar" hint="Asks to read and write your calendars" onclick={openPicker} />
    {:else}
      <div class="space-y-3">
        <p class="text-caption text-content-subtle px-1">Pick the calendar the sessions go into:</p>
        {#each byAccount as [account, list] (account)}
          <div>
            <p class="text-caption text-content-subtle px-1 pb-1 truncate">{account}</p>
            <div class="divide-y divide-border">
              {#each list as cal (cal.id)}
                <button onclick={() => pick(cal)} class="w-full flex items-center gap-3 min-h-11 py-2 px-1 text-left">
                  <span class="w-3 h-3 rounded-full shrink-0" style="background: {cal.color}" aria-hidden="true"></span>
                  <span class="flex-1 min-w-0 text-body text-content truncate">{cal.name}</span>
                  {#if cal.id === calendarSync.calendarId}<span class="text-caption text-primary">in use</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <p class="text-caption text-content-subtle px-1">No calendar on this phone takes new events. Make one in Google Calendar on the web, let the phone sync, then come back.</p>
        {/each}
        <div class="flex flex-wrap gap-2">
          <button onclick={() => calendarSync.loadCalendars()} class="btn btn-secondary">Read the list again</button>
          <button onclick={() => (picking = false)} class="btn btn-quiet">Cancel</button>
        </div>
      </div>
    {/if}

    {#if calendarSync.error}
      <p class="text-caption text-status-caution px-1" role="alert">{calendarSync.error}</p>
    {/if}
  </div>
{/if}
