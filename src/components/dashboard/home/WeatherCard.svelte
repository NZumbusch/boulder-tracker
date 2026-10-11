<script lang="ts">
  /** Home weather: now, what decides friction, recent rain, the best window today, and the week ahead. */
  import { trainingState } from '../../../lib/state.svelte';
  import { describeWeatherCode } from '../../../lib/weather/codes';
  import { formatTempDelta, temperatureUnit, displayWind, windUnit } from '../../../lib/units';
  import { bestWindow } from '../../../lib/weather/conditions';
  import { T, FRICTION_STYLE, currentFriction, dayFriction, frictionText, joinParts, formatRelativeAge } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let showFrictionReason = $state(false);
</script>

<div class="card space-y-3">
  <SectionHeader label="Weather" />
  {#if !trainingState.homeLocation}
    <p class="text-caption text-content-subtle italic">Set a home location in Settings to see conditions here.</p>
  {:else if trainingState.homeWeather.unavailable}
    <p class="text-caption text-content-subtle italic">Weather is currently unavailable.</p>
  {:else if trainingState.homeWeather.snapshot}
    {@const w = trainingState.homeWeather.snapshot}
    {@const code = describeWeatherCode(w.currentWeatherCode)}
    {@const friction = currentFriction(w)}
    {@const showWord = trainingState.homeDetails['weather.frictionWord']}
    {@const showNumber = trainingState.homeDetails['weather.frictionNumber']}
    <div class="flex items-center gap-3">
      <Icon icon={code.icon} class="text-3xl text-primary shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="text-metric text-content tabular-nums">{T(w.currentTempC)}{temperatureUnit(trainingState.units.temperature).slice(1)}</p>
        <p class="text-caption text-content-subtle truncate">{code.label} · {trainingState.homeLocation.name}</p>
      </div>
      {#if showWord || showNumber}
        <button
          onclick={() => showFrictionReason = !showFrictionReason}
          class="px-2.5 py-1 rounded-full border text-label tabular-nums shrink-0 {FRICTION_STYLE[friction.label].badge}"
          aria-expanded={showFrictionReason}
          title="Climbing conditions - tap for why"
        >
          {frictionText(friction)}
        </button>
      {/if}
    </div>
    {#if showFrictionReason && (showWord || showNumber)}
      <p class="text-caption text-content-subtle">
        {[
          friction.reason ? `${friction.reason}.` : 'Nothing holding conditions back.',
          w.dewPointC !== undefined && `Air is ${formatTempDelta(Math.max(0, w.currentTempC - w.dewPointC), trainingState.units.temperature)} above its dew point.`,
        ].filter(Boolean).join(' ')}
      </p>
    {/if}

    <!-- Humidity and wind sit beside the temperature because they are
         what decide whether rock has any friction - a dry 8°C day and a
         humid one are not the same session. Each is rendered only if
         the snapshot carries it: a cached snapshot from before these
         were fetched still shows the temperature rather than a row of
         blanks. -->
    {#if trainingState.homeDetails['weather.details'] && (w.feelsLikeC !== undefined || w.dewPointC !== undefined || w.humidityPercent !== undefined || w.windSpeedKmh !== undefined || (w.precipitationMm ?? 0) > 0)}
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        {#if w.feelsLikeC !== undefined}
          <span class="text-caption text-content-subtle tabular-nums">Feels {T(w.feelsLikeC)}</span>
        {/if}
        {#if w.humidityPercent !== undefined}
          <span class="text-caption text-content-subtle tabular-nums">{Math.round(w.humidityPercent)}% humidity</span>
        {/if}
        {#if w.dewPointC !== undefined}
          <span class="text-caption text-content-subtle tabular-nums">Dew {T(w.dewPointC)}</span>
        {/if}
        {#if w.windSpeedKmh !== undefined}
          <span class="text-caption text-content-subtle tabular-nums">{Math.round(displayWind(w.windSpeedKmh, trainingState.units.wind))}{w.windGustsKmh !== undefined && w.windGustsKmh > w.windSpeedKmh + 5 ? `–${Math.round(displayWind(w.windGustsKmh, trainingState.units.wind))}` : ''} {windUnit(trainingState.units.wind)} wind</span>
        {/if}
        {#if w.uvIndex !== undefined && w.uvIndex >= 3}
          <span class="text-caption text-content-subtle tabular-nums">UV {Math.round(w.uvIndex)}</span>
        {/if}
        {#if (w.precipitationMm ?? 0) > 0}
          <span class="text-caption text-primary tabular-nums">{w.precipitationMm} mm rain</span>
        {/if}
      </div>
    {/if}

    {#if trainingState.homeDetails['weather.rain'] && w.recentRain}
      {@const rain = w.recentRain}
      <p class="text-caption text-content-subtle flex items-center gap-1.5 tabular-nums">
        <Icon icon="ic:baseline-water-drop" class="text-sm shrink-0 {rain.last72hMm > 0 ? 'text-primary' : ''}" />
        {#if rain.last72hMm === 0}
          No rain in the last 3 days
        {:else}
          {rain.last72hMm} mm in the last 3 days{rain.last24hMm > 0 ? ` (${rain.last24hMm} in 24 h)` : ''}{rain.hoursSinceRain !== undefined ? ` · last rain ${rain.hoursSinceRain} h ago` : ''}
        {/if}
      </p>
    {/if}

    {#if trainingState.homeDetails['weather.window'] && w.localTime}
      {@const today = w.localTime.slice(0, 10)}
      {@const sunset = w.daily.find((d) => d.date === today)?.sunset}
      {@const best = w.hours ? bestWindow(w.hours, today, sunset, w.recentRain?.last24hMm, trainingState.frictionConfig) : undefined}
      {@const sunsetAhead = sunset !== undefined && sunset > w.localTime}
      {#if best || sunsetAhead}
        <p class="text-caption text-content-subtle flex items-center gap-1.5 tabular-nums">
          <Icon icon="ic:baseline-schedule" class="text-sm shrink-0" />
          {joinParts(
            best && `Best ${best.start}–${best.end}`,
            best && `${T(best.avgTempC)} dry`,
            sunsetAhead && `sunset ${sunset!.slice(11, 16)}`,
          )}
        </p>
      {/if}
    {/if}

    <!-- The week ahead. This was always in the snapshot - the trip card
         has always rendered it - the home card just never showed
         it. Today is labelled rather than given its weekday name, since
         "Mon" beside a live temperature reads as a different day. -->
    {#if w.daily.length > 0 && trainingState.homeDetails['weather.forecast']}
      <div class="flex gap-3 overflow-x-auto no-scrollbar pt-1 border-t border-border/60">
        {#each w.daily as day, i}
          {@const dayCode = describeWeatherCode(day.weatherCode)}
          <div class="flex flex-col items-center gap-1 shrink-0 w-12 pt-2">
            <span class="text-caption {i === 0 ? 'text-content-muted' : 'text-content-subtle'}">
              {i === 0 ? 'Today' : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span title={dayCode.label} class="flex"><Icon icon={dayCode.icon} class="text-lg text-primary" aria-label={dayCode.label} /></span>
            <span class="text-caption text-content tabular-nums">{T(day.tempMaxC)}</span>
            <span class="text-caption text-content-subtle tabular-nums">{T(day.tempMinC)}</span>
            <!-- Every day or none (a setting), so the rows line up. -->
            {#if trainingState.homeDetails['weather.rainChance']}
              {@const chance = day.precipitationChance}
              <span class="text-caption tabular-nums leading-none {chance !== undefined && chance >= 20 ? 'text-primary/80' : 'text-content-subtle/70'}" title="Chance of rain">{chance !== undefined ? `${Math.round(chance)}%` : '–'}</span>
            {/if}
            {#if trainingState.homeDetails['weather.dayFriction']}
              {@const df = dayFriction(day)}
              {#if trainingState.homeDetails['weather.frictionNumber']}
                <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
              {:else}
                <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if trainingState.homeWeather.stale && trainingState.homeWeather.fetchedAt}
      <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(trainingState.homeWeather.fetchedAt)}</p>
    {/if}
  {:else}
    <p class="text-caption text-content-subtle italic">Loading conditions…</p>
  {/if}
</div>
