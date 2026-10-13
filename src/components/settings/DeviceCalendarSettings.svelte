<script lang="ts">
  /**
   * Phone calendar (Android): connect, choose which calendars. How it works:
   * `lib/calendar/deviceCalendar.svelte.ts`.
   */
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';
  import Icon from '@iconify/svelte';

  $effect(() => {
    if (deviceCalendar.supported && deviceCalendar.enabled) void deviceCalendar.refreshStatus();
  });

  /** Calendars grouped by the account they sync with. */
  const byAccount = $derived.by(() => {
    const groups = new Map<string, typeof deviceCalendar.calendars>();
    for (const c of deviceCalendar.calendars) groups.set(c.account, [...(groups.get(c.account) ?? []), c]);
    return [...groups];
  });
</script>

{#if deviceCalendar.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted">Phone calendar</h3>
      <p class="text-caption text-content-subtle leading-relaxed">
        Shows the events from your phone's calendars (Google, Samsung, any account it syncs) beside your sessions on the Plan calendar, so you can plan around them. Read-only: nothing is written to your calendar. The events stay on this phone - never in backups, sync or AI prompts.
      </p>
    </div>

    {#if !deviceCalendar.enabled}
      <button onclick={() => deviceCalendar.connect()} class="w-full flex items-center justify-between py-2 transition-colors group">
        <div class="flex items-center gap-3">
          <Icon icon="ic:baseline-edit-calendar" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
          <div class="text-left">
            <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Show my calendar</p>
            <p class="text-caption text-content-subtle">Asks to read your calendars</p>
          </div>
        </div>
        <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
      </button>
    {:else if !deviceCalendar.granted}
      <p class="text-caption text-status-caution px-1">Calendar access was taken away. Allow it again in the phone's settings for this app, then reopen this page.</p>
      <button onclick={() => deviceCalendar.connect()} class="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-label font-semibold rounded-control">Ask again</button>
    {:else}
      <div class="space-y-3">
        {#each byAccount as [account, list] (account)}
          <div>
            <p class="text-caption text-content-subtle px-1 pb-1 truncate">{account}</p>
            <div class="divide-y divide-border">
              {#each list as cal (cal.id)}
                <label class="flex items-center gap-3 py-2 px-1 cursor-pointer">
                  <input type="checkbox" class="accent-primary" checked={deviceCalendar.selected.includes(cal.id)} onchange={() => deviceCalendar.toggle(cal.id)} />
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {cal.color}"></span>
                  <span class="text-body text-content truncate">{cal.name}</span>
                </label>
              {/each}
            </div>
          </div>
        {:else}
          <p class="text-caption text-content-subtle px-1">No calendars found on this phone.</p>
        {/each}
      </div>
      <button onclick={() => deviceCalendar.disconnect()} class="px-3.5 py-2 rounded-control border border-danger/40 text-label font-semibold text-danger hover:bg-danger/10 transition-colors">Hide calendar events</button>
    {/if}

    {#if deviceCalendar.error}
      <p class="text-caption text-status-caution px-1">{deviceCalendar.error}</p>
    {/if}
  </div>
{/if}
