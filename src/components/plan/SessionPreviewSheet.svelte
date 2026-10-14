<script lang="ts">
  /**
   * A session at a glance, as the calendar app shows an event: its name and whether it is done, when, where (with the
   * place's price and hours, and the forecast there when the weather knows the place), the note about what it is for,
   * and its exercises by name. Open takes you into the full session; Start begins it.
   */
  import { untrack } from 'svelte';
  import Icon from '@iconify/svelte';
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { dayIndexToIso } from '../../lib/analytics/recoverySeries';
  import { DAY_MS, type CalendarSession } from '../../lib/planning/calendarEvents';
  import { workoutItems } from '../../lib/exercise/groups';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { hasCoordinates, placeByName, placeLine } from '../../lib/places/places';
  import { mapsUrl } from '../../lib/calendar/eventText';
  import { describeWeatherCode } from '../../lib/weather/codes';
  import { displayTemp, temperatureUnit } from '../../lib/units';

  let { session, onOpen, onClose }: { session: CalendarSession; onOpen: () => void; onClose: () => void } = $props();

  backWhile(() => true, () => onClose());

  const w = $derived(session.workout);
  const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const dayText = $derived(new Date(session.day * DAY_MS).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }));
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

<div class="fixed inset-0 pb-safe z-[130] flex items-end sm:items-center justify-center bg-black/40" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="bg-surface w-full max-w-md max-h-[88vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl shadow-card p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-200" use:sheetDrag={() => onClose()} role="dialog" aria-modal="true" aria-label={w.notes || 'Session'}>
    <div class="flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <h3 class="text-title text-content break-words">{w.notes || 'Session'}</h3>
        <p class="text-caption text-content-subtle mt-0.5">
          {#if session.done}<span class="text-success font-bold">Done</span><span class="mx-1">·</span>{/if}{#if w.planB}Plan B<span class="mx-1">·</span>{/if}{lengthText}
        </p>
      </div>
      <button onclick={onClose} class="tap p-1 -mr-1 text-content-subtle hover:text-content" aria-label="Close"><Icon icon="ic:baseline-close" class="text-xl" /></button>
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
            <a href={mapsUrl(place && hasCoordinates(place) ? `${place.latitude},${place.longitude}` : w.location)} target="_blank" rel="noopener" class="inline-flex items-center gap-1 mt-1 text-label font-bold text-primary">Find on map <Icon icon="ic:baseline-open-in-new" class="text-sm" /></a>
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

    <div class="flex gap-2">
      {#if canStart}
        <button onclick={() => { trainingState.startSession(w); onClose(); }} class="px-5 py-3 bg-surface-elevated/60 hover:bg-surface-elevated text-content text-label font-bold rounded-control border border-border-strong/50 flex items-center gap-1.5">
          <Icon icon="ic:baseline-play-arrow" class="text-lg" />{running ? 'Resume' : 'Start'}
        </button>
      {/if}
      <button onclick={onOpen} class="flex-1 py-3 bg-primary hover:bg-primary-hover text-white text-label font-bold rounded-control transition-all active:scale-[0.99]">Open</button>
    </div>
  </div>
</div>
