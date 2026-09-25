<script lang="ts">
  /** Your crags: current conditions per crag, their forecast, and a nudge when a planned session day looks prime. */
  import { trainingState } from '../../../lib/state.svelte';
  import type { HomeData } from './homeData.svelte';
  import type { DayOfWeek } from '../../../lib/types';
  import { getWeekId } from '../../../lib/dateUtils';
  import { describeWeatherCode } from '../../../lib/weather/codes';
  import { outdoorSuggestion } from '../../../lib/weather/suggestion';
  import { T, FRICTION_STYLE, currentFriction, dayFriction, frictionText, formatRelativeAge } from './format';
  import SectionHeader from './SectionHeader.svelte';
  import Icon from '@iconify/svelte';

  let { data }: { data: HomeData } = $props();

  const todayIso = $derived(data.todayIso);
  let openCrag = $state<number | null>(null);
  const DAY_NAME_OF: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const cragSuggestion = $derived.by(() => {
    const forecasts = trainingState.crags
      .map((c, i) => ({ name: c.name, days: trainingState.cragWeather[i]?.snapshot?.daily ?? [] }))
      .filter((c) => c.days.length > 0);
    if (forecasts.length === 0) return undefined;
    return outdoorSuggestion(forecasts, todayIso, (date) => {
      const d = new Date(`${date}T12:00:00Z`);
      const day = DAY_NAME_OF[d.getUTCDay()];
      return trainingState.getPlannedWorkoutsForWeek(getWeekId(d)).filter((w) => w.dayOfWeek === day);
    }, trainingState.frictionConfig);
  });
</script>

{#if trainingState.crags.length > 0}
  <div class="card space-y-1">
    <SectionHeader label="Crags" />
    <div class="divide-y divide-border">
    {#each trainingState.crags as crag, i (crag.name)}
      {@const state = trainingState.cragWeather[i]}
      {@const snap = state?.snapshot}
      <div>
        <button onclick={() => openCrag = openCrag === i ? null : i} class="w-full flex items-center gap-3 py-2.5 text-left" aria-expanded={openCrag === i}>
          <span class="text-body font-semibold text-content flex-1 truncate">{crag.name}</span>
          {#if snap}
            {@const f = currentFriction(snap)}
            <span class="text-label text-content tabular-nums">{T(snap.currentTempC)}</span>
            {#if trainingState.homeDetails['weather.frictionWord'] || trainingState.homeDetails['weather.frictionNumber']}
              <span class="px-2 py-0.5 rounded-full border text-caption tabular-nums {FRICTION_STYLE[f.label].badge}">
                {frictionText(f)}
              </span>
            {/if}
          {:else if state?.unavailable}
            <span class="text-caption text-content-subtle italic">unavailable</span>
          {:else}
            <span class="text-caption text-content-subtle italic">loading…</span>
          {/if}
          <Icon icon="ic:baseline-chevron-right" class="text-content-subtle transition-transform {openCrag === i ? 'rotate-90' : ''}" />
        </button>
        {#if openCrag === i && snap}
          <div class="pb-2.5 space-y-2">
            {#if snap.recentRain && snap.recentRain.last72hMm > 0}
              <p class="text-caption text-content-subtle tabular-nums">{snap.recentRain.last72hMm} mm rain in the last 3 days{snap.recentRain.hoursSinceRain !== undefined ? ` · last ${snap.recentRain.hoursSinceRain} h ago` : ''}</p>
            {/if}
            <div class="flex gap-3 overflow-x-auto no-scrollbar">
              {#each snap.daily as day, d}
                {@const code = describeWeatherCode(day.weatherCode)}
                {@const df = dayFriction(day)}
                <div class="flex flex-col items-center gap-1 shrink-0 w-11">
                  <span class="text-caption text-content-subtle">{d === 0 ? 'Today' : new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span title={code.label} class="flex"><Icon icon={code.icon} class="text-lg text-primary" aria-label={code.label} /></span>
                  <span class="text-caption text-content tabular-nums">{T(day.tempMaxC)}</span>
                  {#if trainingState.homeDetails['weather.frictionNumber']}
                    <span class="text-caption tabular-nums leading-none {FRICTION_STYLE[df.label].text}" title={df.label}>{df.score.toFixed(0)}</span>
                  {:else}
                    <span class="w-2 h-2 rounded-full {FRICTION_STYLE[df.label].dot}" title={df.label}></span>
                  {/if}
                </div>
              {/each}
            </div>
            {#if state.stale && state.fetchedAt}
              <p class="text-caption text-warning">Stale - last updated {formatRelativeAge(state.fetchedAt)}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
    </div>
    {#if cragSuggestion && trainingState.homeDetails['crags.suggestion']}
      {@const when = cragSuggestion.date === todayIso ? 'Today' : new Date(`${cragSuggestion.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long' })}
      <p class="text-caption text-content-muted flex items-start gap-1.5 pt-1">
        <Icon icon="ic:outline-lightbulb" class="text-sm text-primary shrink-0 mt-px" />
        <span>{when} looks prime at {cragSuggestion.cragName} - you have "{cragSuggestion.sessionName}" planned.</span>
      </p>
    {/if}
  </div>
{/if}
