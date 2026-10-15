<script lang="ts">
  /**
   * Phone calendar (Android): connect, choose which calendars. How it works:
   * `lib/calendar/deviceCalendar.svelte.ts`.
   */
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';
  import Icon from '@iconify/svelte';
  import ActionRow from './ActionRow.svelte';
  import Toggle from '../ui/Toggle.svelte';
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
      <h2 class="text-section uppercase text-content-muted">Phone calendar</h2>
      <p class="text-caption text-content-subtle leading-relaxed">
        Shows the events from your phone's calendars (Google, Samsung, any account it syncs) beside your sessions on the Plan calendar, so you can plan around them. Read-only: nothing is written to your calendar. The events stay on this phone - never in backups or sync. The AI coach sees their titles and times only if you switch that on under What the AI sees (off by default).
      </p>
    </div>

    {#if !deviceCalendar.enabled}
      <ActionRow icon="ic:baseline-edit-calendar" title="Show my calendar" hint="Asks to read your calendars" onclick={() => deviceCalendar.connect()} />
    {:else if !deviceCalendar.granted}
      <p class="text-caption text-status-caution px-1" role="alert">Calendar access was taken away. Allow it again in the phone's settings for this app, then reopen this page.</p>
      <button onclick={() => deviceCalendar.connect()} class="btn btn-primary">Ask again</button>
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
                    <div class="flex-1 min-w-0"><Toggle checked={deviceCalendar.selected.includes(cal.id)} onChange={() => deviceCalendar.toggle(cal.id)} label={cal.name} /></div>
                    <button
                      onclick={() => (picking = picking === cal.id ? null : cal.id)}
                      class="shrink-0 grid place-items-center min-w-11 min-h-11"
                      aria-expanded={picking === cal.id}
                      aria-label="Colour of {cal.name}"
                    ><span class="block w-6 h-6 rounded-full ring-1 ring-border-strong" style="background: {deviceCalendar.calendarColor(cal.id) ?? cal.color}"></span></button>
                  </div>
                  {#if picking === cal.id}
                    <div class="flex flex-wrap items-center gap-2 pt-3 pl-7">
                      {#each EVENT_PALETTE as hex, n (hex)}
                        <button onclick={() => deviceCalendar.setColor(cal.id, hex)} class="w-10 h-10 rounded-full ring-offset-2 ring-offset-surface {picked === hex ? 'ring-2 ring-content' : ''}" style="background: {hex}" aria-label="Colour {n + 1} of {EVENT_PALETTE.length}" aria-pressed={picked === hex}></button>
                      {/each}
                      <label class="relative w-10 h-10 rounded-full overflow-hidden ring-1 ring-border-strong flex items-center justify-center cursor-pointer" title="Any colour">
                        <Icon icon="ic:baseline-plus" class="text-base text-content-subtle" />
                        <input type="color" class="absolute inset-0 opacity-0 cursor-pointer" value={picked ?? cal.color} oninput={(e) => deviceCalendar.setColor(cal.id, e.currentTarget.value)} aria-label="Pick any colour for {cal.name}" />
                      </label>
                      {#if picked}<button onclick={() => deviceCalendar.setColor(cal.id, null)} class="btn-quiet px-2 text-label text-primary">Use the calendar's own colour</button>{/if}
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
      <button onclick={() => deviceCalendar.disconnect()} class="btn btn-secondary">Stop showing phone calendar events</button>
    {/if}

    {#if deviceCalendar.error}
      <p class="text-caption text-status-caution px-1" role="alert">{deviceCalendar.error}</p>
    {/if}
  </div>
{/if}
