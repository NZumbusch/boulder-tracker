<script lang="ts">
  /** One imported activity: its route, the numbers, what it overlaps, and Remove. */
  import Sheet from '../ui/Sheet.svelte';
  import ActivityRoute from './ActivityRoute.svelte';
  import ActivityMap from './ActivityMap.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { lastMapStyle, MAP_PROVIDERS, providerOf, rememberMapStyle, type MapStyle } from '../../lib/activity/mapTiles';
  import { trainingState } from '../../lib/state.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import { formatDistance, formatDuration, formatPaceOrSpeed, SOURCE_LABELS, startClock } from '../../lib/activity/format';
  import { overlapsFor, overlapSentence } from '../../lib/activity/overlapView';
  import { showConfirm } from '../../lib/utils';
  import { showUndo } from '../../lib/toast.svelte';
  import { askAboutActivity } from '../../lib/ai/askAbout.svelte';
  import Icon from '@iconify/svelte';
  import type { ExternalActivity } from '../../lib/types';

  let { activity, onClose }: { activity: ExternalActivity; onClose: () => void } = $props();

  // The map is opt-in: off shows the plain route and fetches nothing. The setting makes the last-used map the default; the chips switch it here.
  let view = $state<'route' | MapStyle>(trainingState.tunableOn('activities.mapDefault') ? lastMapStyle() : 'route');
  function pick(next: 'route' | MapStyle) {
    view = next;
    if (next !== 'route') rememberMapStyle(next);
  }

  const miles = $derived(trainingState.units.wind === 'mph');
  const overlaps = $derived(overlapsFor(activity));
  const stats = $derived(
    [
      ['Time', formatDuration(activity.durationSec)],
      activity.movingSec && activity.movingSec < activity.durationSec * 0.98 ? ['Moving', formatDuration(activity.movingSec)] : null,
      activity.distanceM ? ['Distance', formatDistance(activity.distanceM, miles)] : null,
      formatPaceOrSpeed(activity, miles) ? [/run|walk|hike/i.test(activity.type) ? 'Pace' : 'Speed', formatPaceOrSpeed(activity, miles)!] : null,
      activity.elevationM ? ['Climb', `${Math.round(activity.elevationM)} m`] : null,
      activity.avgHr ? ['Avg heart rate', `${activity.avgHr} bpm`] : null,
      activity.maxHr ? ['Max heart rate', `${activity.maxHr} bpm`] : null,
      activity.calories ? ['Calories', `${activity.calories} kcal`] : null,
    ].filter((x): x is string[] => x !== null),
  );

  async function remove() {
    if (!(await showConfirm('Remove this activity?', 'It is removed from this app (and synced devices). Your own sessions are not touched. Importing the file again brings it back.', { ok: 'Remove', cancel: 'Keep' }))) return;
    const copy = $state.snapshot(activity) as ExternalActivity;
    await trainingState.removeExternalActivities([activity.id]);
    showUndo(`${copy.name} removed`, async () => { await trainingState.addExternalActivities([copy]); });
    onClose();
  }
</script>

<Sheet title={activity.name} subtitle="{formatDay(activity.date, { weekday: 'short' })} · {startClock(activity)} · {SOURCE_LABELS[activity.source]}" {onClose}>
  <div class="space-y-4">
    {#if activity.track}
      {#if view === 'route'}
        <div class="rounded-card bg-surface-sunken grid place-items-center py-2">
          <ActivityRoute track={activity.track} width={320} height={200} detail label="Route of {activity.name}" />
        </div>
      {:else}
        <ActivityMap track={activity.track} style={view} label="Map of {activity.name}" />
      {/if}
      <Segmented full label="Route background" options={[{ value: 'route', label: 'Route' }, ...MAP_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))]} value={view} onChange={(v) => pick(v)} />
      {#if view !== 'route'}
        <p class="text-caption text-content-subtle" data-testid="map-notice">The map pictures come from {providerOf(view).host}, which can see the area you are looking at. Choose Route for no internet use.</p>
      {/if}
    {/if}

    <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
      {#each stats as [k, v]}
        <div>
          <dt class="text-caption text-content-subtle">{k}</dt>
          <dd class="text-body font-semibold tabular-nums">{v}</dd>
        </div>
      {/each}
      <div>
        <dt class="text-caption text-content-subtle">Type</dt>
        <dd class="text-body font-semibold">{activity.type}</dd>
      </div>
    </dl>

    {#if overlaps.length}
      <div class="space-y-1" data-testid="activity-overlaps">
        <h3 class="text-section uppercase text-content-muted">Same time as</h3>
        <ul class="text-label text-content-subtle space-y-0.5">
          {#each overlaps as o (o.kind + o.id)}<li>{overlapSentence(o)}</li>{/each}
        </ul>
      </div>
    {/if}

    {#if activity.notes}<p class="text-label text-content-subtle whitespace-pre-line">{activity.notes}</p>{/if}

    <p class="text-caption text-content-subtle">Imported history: it does not count toward your load or plan.</p>
    <button onclick={() => askAboutActivity(activity.id)} class="btn btn-secondary w-full"><Icon icon="ic:baseline-auto-awesome" class="text-base" />Ask the AI about this</button>
    <button onclick={remove} class="btn btn-secondary w-full text-danger">Remove from the app</button>
  </div>
</Sheet>
