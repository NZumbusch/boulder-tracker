<script lang="ts">
  /**
   * One chip per phone calendar under the calendar's header: tap to show or hide it (the same choice as Settings ->
   * Phone calendar; the ones that are on come first), so a crowded timetable can be switched off for a clean look at the sessions. Nothing when the
   * phone calendar is off or has a single calendar. Scrolls sideways when there are many.
   */
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';

  /** The calendars that are on first, the ones that are off after them - each group in the phone's own order. */
  const ordered = $derived([
    ...deviceCalendar.calendars.filter((c) => deviceCalendar.selected.includes(c.id)),
    ...deviceCalendar.calendars.filter((c) => !deviceCalendar.selected.includes(c.id)),
  ]);
  const show = $derived(deviceCalendar.supported && deviceCalendar.enabled && deviceCalendar.granted && deviceCalendar.calendars.length > 1);
</script>

{#if show}
  <!-- The sideways scroll must not page the calendar. -->
  <div class="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" data-no-swipe role="group" aria-label="Phone calendars">
    <span class="shrink-0 self-center text-caption text-content-subtle pr-0.5">Phone calendars</span>
    {#each ordered as cal (cal.id)}
      {@const on = deviceCalendar.selected.includes(cal.id)}
      <button
        onclick={() => deviceCalendar.toggle(cal.id)}
        aria-pressed={on}
        class="shrink-0 max-w-44 flex items-center gap-1.5 pl-2.5 pr-3 min-h-9 rounded-full text-caption transition-colors {on ? 'bg-surface-elevated text-content' : 'text-content-subtle hover:bg-surface-elevated/50'}"
      >
        <span class="w-2 h-2 rounded-full shrink-0 {on ? '' : 'opacity-40'}" style="background: {deviceCalendar.calendarColor(cal.id) ?? 'var(--color-content-subtle)'}"></span>
        <span class="truncate {on ? '' : 'line-through decoration-content-subtle/40'}">{cal.name}</span>
      </button>
    {/each}
  </div>
{/if}
