<script lang="ts">
  /**
   * The calendar's view options, one tap from the header instead of buttons and a row of chips above the grid: how the
   * week is laid out, focus on sessions (phone events grey, sessions coloured by type) and which phone calendars show
   * (the same choice as Settings -> Phone calendar).
   */
  import Sheet from '../ui/Sheet.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { deviceCalendar } from '../../lib/calendar/deviceCalendar.svelte';

  let {
    mode,
    agenda,
    focusSessions,
    onLayout,
    onFocus,
    onClose,
  }: {
    mode: 'day' | 'week' | 'month';
    agenda: boolean;
    focusSessions: boolean;
    onLayout: (layout: 'grid' | 'list') => void;
    onFocus: (on: boolean) => void;
    onClose: () => void;
  } = $props();

  const phoneCalendars = $derived(deviceCalendar.supported && deviceCalendar.enabled && deviceCalendar.granted ? deviceCalendar.calendars : []);
</script>

<Sheet title="View" subtitle="What the calendar shows" {onClose}>
  <div class="space-y-4">
    {#if mode === 'week'}
      <div class="space-y-1.5">
        <p class="text-label text-content-subtle px-1">Week layout</p>
        <Segmented
          label="Week layout"
          full
          options={[{ value: 'grid', label: 'Hour columns' }, { value: 'list', label: 'List' }]}
          value={agenda ? 'list' : 'grid'}
          onChange={onLayout}
        />
      </div>
    {/if}

    <Toggle checked={focusSessions} onChange={onFocus} label="Focus on sessions" hint="Phone-calendar events turn grey, so the sessions stand out: blue to do, green done, red missed" />

    {#if phoneCalendars.length > 0}
      <div class="space-y-0.5">
        <p class="text-label text-content-subtle px-1">Phone calendars</p>
        {#each phoneCalendars as cal (cal.id)}
          <Toggle
            checked={deviceCalendar.selected.includes(cal.id)}
            onChange={() => deviceCalendar.toggle(cal.id)}
            label={cal.name}
            dot={deviceCalendar.calendarColor(cal.id) ?? 'var(--color-content-subtle)'}
          />
        {/each}
      </div>
    {/if}
  </div>
</Sheet>
