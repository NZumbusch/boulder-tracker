<script lang="ts">
  /**
   * A session at a glance, as the calendar app shows an event: its name and whether it is done, when, where (with the
   * place's price and hours, and the forecast there when the weather knows the place), the note about what it is for,
   * and its exercises by name. Open takes you into the full session; Start begins it.
   */
  import { formatClock } from '../../lib/timeFormat';
  import { untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import { trainingState } from '../../lib/state.svelte';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import type { CalendarSession } from '../../lib/planning/calendarEvents';
  import { workoutItems } from '../../lib/exercise/groups';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { hasCoordinates, placeByName, placeLine } from '../../lib/places/places';
  import { mapsUrl } from '../../lib/calendar/eventText';
  import { describeWeatherCode } from '../../lib/weather/codes';
  import { displayTemp, temperatureUnit } from '../../lib/units';

  let { session, onOpen, onClose }: { session: CalendarSession; onOpen: () => void; onClose: () => void } = $props();

  const w = $derived(session.workout);
  const hhmm = (min: number) => formatClock(min, trainingState.clock12);
  const dayText = $derived(formatDay(dayIndexToIso(session.day), { weekday: 'short' }));
  const whenText = $derived(
    session.startMin !== undefined
      ? `${dayText} · ${hhmm(session.startMin)} – ${hhmm(session.startMin + session.minutes)}`
      : `${dayText} · ${session.minutes} min`,
  );
  const lengthText = $derived(`${session.minutes} min${session.plannedMinutes ? ` (${session.plannedMinutes} planned)` : ''}`);

  const place = $derived(w.location ? placeByName(trainingState.places, w.location) : undefined);
  const forecast = $derived(w.location ? trainingState.forecastAt(w.location, dayIndexToIso(session.day)) : null);
  // The weather is read when Home opens; a preview on a fresh start reads it once for the place it needs.
  // Once per preview (reading the weather changes what this effect reads - asking again each time would never settle).
  let weatherAsked = false;
  $effect(() => {
    if (weatherAsked) return;
    if (place && hasCoordinates(place) && !forecast) {
      weatherAsked = true;
      untrack(() => void trainingState.refreshWeather());
    }
  });
  const tempUnit = $derived(temperatureUnit(trainingState.units.temperature));
  const forecastText = $derived.by(() => {
    if (!forecast) return '';
    const info = describeWeatherCode(forecast.weatherCode);
    const hi = Math.round(displayTemp(forecast.tempMaxC, trainingState.units.temperature));
    const lo = Math.round(displayTemp(forecast.tempMinC, trainingState.units.temperature));
    return `${info.label}, ${lo}–${hi} ${tempUnit}${forecast.precipitationChance !== undefined ? ` · ${forecast.precipitationChance}% rain` : ''}`;
  });

  /** The exercises by name; a circuit as one line with its members. */
  const overview = $derived(
    workoutItems({ exercises: w.exercises, groups: w.groups }).map((item) =>
      item.kind === 'slot'
        ? { text: slotTypeName(item.slot, trainingState.exerciseTypes), circuit: false }
        : { text: `${item.group.name || 'Circuit'}: ${item.members.map((m) => slotTypeName(m.slot, trainingState.exerciseTypes)).join(', ')}`, circuit: true },
    ),
  );
  const note = $derived((w.description ?? '').trim());
  const running = $derived(trainingState.sessionStore.isRunning(w.id));
  const canStart = $derived(!session.done && (!trainingState.isSessionActive || running));
</script>

<Sheet title="Session" icon="ic:baseline-event" {onClose}>
  <div class="min-w-0">
    <h3 class="text-title text-content break-words">{w.notes || 'Session'}</h3>
    <p class="text-caption text-content-subtle mt-0.5">
      {#if session.done}<span class="text-success font-bold">Done</span><span class="mx-1">·</span>{/if}{#if w.planB}Plan B<span class="mx-1">·</span>{/if}{lengthText}
    </p>
  </div>

  <div class="divide-y divide-border/60 [&>div]:py-3.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
    <div class="flex gap-4">
      <Icon icon="ic:baseline-schedule" class="text-2xl text-content-subtle shrink-0" />
      <p class="text-body text-content min-w-0">{whenText}</p>
    </div>
    {#if w.location}
      <div class="flex gap-4">
        <Icon icon="ic:baseline-place" class="text-2xl text-content-subtle shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-body text-content break-words">{w.location}</p>
          {#if place}
            <p class="text-caption text-content-subtle">{placeLine(place)}</p>
            {#if place.notes}<p class="text-caption text-content-muted mt-1 whitespace-pre-wrap">{place.notes}</p>{/if}
          {/if}
          {#if forecastText}<p class="text-caption text-content-muted mt-1">{forecastText}</p>{/if}
          <a href={mapsUrl(place && hasCoordinates(place) ? `${place.latitude},${place.longitude}` : w.location)} target="_blank" rel="noopener" class="btn-quiet gap-1 text-label font-bold text-primary">Find on map <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
        </div>
      </div>
    {/if}
    {#if note || overview.length > 0}
      <div class="flex gap-4">
        <Icon icon="ic:baseline-subject" class="text-2xl text-content-subtle shrink-0" />
        <div class="min-w-0 flex-1 space-y-2">
          {#if note}<p class="text-body text-content whitespace-pre-wrap break-words line-clamp-6">{note}</p>{/if}
          {#if overview.length > 0}
            <ul class="space-y-1">
              {#each overview as line}
                <li class="text-label text-content-muted flex gap-2 items-baseline"><span class="w-1 h-1 rounded-full bg-content-subtle shrink-0 translate-y-[-3px]" aria-hidden="true"></span><span class="min-w-0 break-words">{line.text}</span></li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <!-- Start is the main action wherever a session can be started (as on Home); Open takes the lead when it cannot. -->
    {#if canStart}
      <button onclick={onOpen} class="btn btn-secondary">Open</button>
      <button onclick={() => { trainingState.startSession(w); onClose(); }} class="btn btn-primary flex-1">
        <Icon icon="ic:baseline-play-arrow" class="text-lg" />{running ? 'Resume' : 'Start'}
      </button>
    {:else}
      <button onclick={onOpen} class="btn btn-primary flex-1">Open</button>
    {/if}
  {/snippet}
</Sheet>
