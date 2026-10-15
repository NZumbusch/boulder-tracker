<script lang="ts">
  /**
   * One event from the phone's calendar, read-only, laid out like the calendar app's own detail page: the title
   * with the event's colour, when, which calendar, where (with a button to open it in Maps) and the notes.
   * Nothing here leaves the phone.
   */
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { NativeCalendar } from '../../lib/native/deviceCalendar';
  import { formatEventWhen, mapsUrl } from '../../lib/calendar/eventText';

  let { event, calendar, onClose }: { event: DeviceEvent; calendar?: NativeCalendar; onClose: () => void } = $props();

  const dot = $derived(event.color ?? calendar?.color ?? 'var(--color-content-subtle)');
</script>

<Sheet title="Calendar event" icon="ic:baseline-event" {onClose}>
  <div class="flex items-start gap-3">
    <h3 class="flex-1 min-w-0 text-title text-content break-words">{event.title}</h3>
    <span class="mt-1.5 w-3.5 h-3.5 rounded-full shrink-0" style="background: {dot};" aria-hidden="true"></span>
  </div>

  <div class="divide-y divide-border/60 [&>div]:py-3.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
    <div class="flex gap-4">
      <Icon icon="ic:baseline-schedule" class="text-2xl text-content-subtle shrink-0" />
      <p class="text-body text-content min-w-0">{formatEventWhen(event)}</p>
    </div>
    {#if event.location}
      <div class="flex gap-4">
        <Icon icon="ic:baseline-place" class="text-2xl text-content-subtle shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-body text-content break-words">{event.location}</p>
          <a href={mapsUrl(event.location)} target="_blank" rel="noopener" class="btn-quiet gap-1 text-label font-bold text-primary">Find on map <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
        </div>
      </div>
    {/if}
    {#if calendar}
      <div class="flex gap-4 items-center">
        <Icon icon="ic:baseline-event" class="text-2xl text-content-subtle shrink-0" />
        <p class="text-body text-content-muted min-w-0 truncate">{calendar.name}</p>
      </div>
    {/if}
    {#if event.notes}
      <div class="flex gap-4">
        <Icon icon="ic:baseline-subject" class="text-2xl text-content-subtle shrink-0" />
        <p class="text-body text-content whitespace-pre-wrap break-words min-w-0">{event.notes}</p>
      </div>
    {/if}
  </div>
  <p class="text-caption text-content-subtle">From your phone's calendar. Read-only, and it stays on this phone.</p>
</Sheet>
