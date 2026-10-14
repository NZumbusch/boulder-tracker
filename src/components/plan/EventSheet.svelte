<script lang="ts">
  /**
   * One event from the phone's calendar, read-only, laid out like the calendar app's own detail page: the title
   * with the event's colour, when, which calendar, where (with a button to open it in Maps) and the notes.
   * Nothing here leaves the phone.
   */
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import type { DeviceEvent } from '../../lib/calendar/deviceEvents';
  import type { NativeCalendar } from '../../lib/native/deviceCalendar';
  import { formatEventWhen, mapsUrl } from '../../lib/calendar/eventText';

  let { event, calendar, onClose }: { event: DeviceEvent; calendar?: NativeCalendar; onClose: () => void } = $props();

  backWhile(() => true, () => onClose());
  const dot = $derived(event.color ?? calendar?.color ?? 'var(--color-content-subtle)');
</script>

<div class="fixed inset-0 pb-safe z-[130] flex items-end sm:items-center justify-center bg-black/40" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="bg-surface w-full max-w-md max-h-[88vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl shadow-card p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onClose()} role="dialog" aria-modal="true" aria-label={event.title}>
    <div class="flex items-start gap-3">
      <h3 class="flex-1 min-w-0 text-title text-content break-words">{event.title}</h3>
      <span class="mt-1.5 w-3.5 h-3.5 rounded-full shrink-0" style="background: {dot};" aria-hidden="true"></span>
      <button onclick={onClose} class="tap p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
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
            <a href={mapsUrl(event.location)} target="_blank" rel="noopener" class="inline-flex items-center gap-1 mt-1 text-label font-bold text-primary">Find on map <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
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
  </div>
</div>
