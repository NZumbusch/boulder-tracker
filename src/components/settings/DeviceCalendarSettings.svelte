<script lang="ts">
  /**
   * Phone calendar (Android): connect, choose which calendars. How it works:
   * `lib/calendar/deviceCalendar.svelte.ts`.
   */
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';
  import Icon from '@iconify/svelte';
  import { EVENT_PALETTE } from '../../lib/calendar/eventColor';

  $effect(() => {
    if (deviceCalendar.supported && deviceCalendar.enabled) void deviceCalendar.refreshStatus();
  });

  /** Calendars grouped by the account they sync with. */
  const byAccount = $derived.by(() => {
    const groups = new Map<string, typeof deviceCalendar.calendars>();
    for (const c of deviceCalendar.calendars) groups.set(c.account, [...(groups.get(c.account) ?? []), c]);
    return [...groups];
  });
  /** The calendar whose colours are open. */
  let picking = $state<string | null>(null);
</script>

{#if deviceCalendar.supported}
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted">Phone calendar</h3>
      <p class="text-caption text-content-subtle leading-relaxed">
        Shows the events from your phone's calendars (Google, Samsung, any account it syncs) beside your sessions on the Plan calendar, so you can plan around them. Read-only: nothing is written to your calendar. The events stay on this phone - never in backups or sync. The AI coach sees their titles and times only if you switch that on under What the AI sees (off by default).
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
                {@const picked = deviceCalendar.colors[cal.id]}
                <div class="py-2 px-1">
                  <div class="flex items-center gap-3">
                    <input type="checkbox" class="accent-primary" id="cal-{cal.id}" checked={deviceCalendar.selected.includes(cal.id)} onchange={() => deviceCalendar.toggle(cal.id)} aria-label="Show {cal.name}" />
                    <label for="cal-{cal.id}" class="text-body text-content truncate flex-1 cursor-pointer">{cal.name}</label>
                    <button
                      onclick={() => (picking = picking === cal.id ? null : cal.id)}
                      class="tap shrink-0 w-6 h-6 rounded-full ring-1 ring-border-strong"
                      style="background: {deviceCalendar.calendarColor(cal.id) ?? cal.color}"
                      aria-expanded={picking === cal.id}
                      aria-label="Colour of {cal.name}"
                    ></button>
                  </div>
                  {#if picking === cal.id}
                    <div class="flex flex-wrap items-center gap-2 pt-3 pl-7">
                      {#each EVENT_PALETTE as hex (hex)}
                        <button onclick={() => deviceCalendar.setColor(cal.id, hex)} class="tap w-7 h-7 rounded-full ring-offset-2 ring-offset-surface {picked === hex ? 'ring-2 ring-content' : ''}" style="background: {hex}" aria-label="Use {hex}" aria-pressed={picked === hex}></button>
                      {/each}
                      <label class="relative w-7 h-7 rounded-full overflow-hidden ring-1 ring-border-strong flex items-center justify-center cursor-pointer" title="Any colour">
                        <Icon icon="ic:baseline-plus" class="text-base text-content-subtle" />
                        <input type="color" class="absolute inset-0 opacity-0 cursor-pointer" value={picked ?? cal.color} oninput={(e) => deviceCalendar.setColor(cal.id, e.currentTarget.value)} aria-label="Pick any colour for {cal.name}" />
                      </label>
                      {#if picked}<button onclick={() => deviceCalendar.setColor(cal.id, null)} class="text-caption text-primary px-1">Phone's colour</button>{/if}
                    </div>
                    <p class="pl-7 pt-2 text-caption text-content-subtle leading-relaxed">{picked ? 'Used exactly as picked.' : 'Greens and teals are turned slightly away from the sessions\' green so the two never look alike - a colour you pick yourself is used as chosen.'}</p>
                  {/if}
                </div>
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
