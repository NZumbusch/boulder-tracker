<script lang="ts">
  /**
   * History's Activities tab: runs, rides, walks and the rest imported from
   * Strava, Garmin or files, newest first by month, each with a small route
   * when it was recorded with GPS. A row says when it overlaps something
   * (a session you logged, one that was planned, the same activity from
   * another source); tapping it opens the details and the full route.
   */
  import ListRow from '../common/ListRow.svelte';
  import ActivityRoute from './ActivityRoute.svelte';
  import ActivitySheet from './ActivitySheet.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { formatDay } from '../../lib/dateUtils';
  import { startClock, summaryLine } from '../../lib/activity/format';
  import { overlapsFor, overlapTag } from '../../lib/activity/overlapView';
  import type { ExternalActivity } from '../../lib/types';
  import Icon from '@iconify/svelte';

  /** The activities to show - History's search and date filters already applied. */
  let { activities, filtered = false }: { activities: ExternalActivity[]; filtered?: boolean } = $props();

  const ACTIVE = 'text-primary border-primary/40 bg-primary/10';
  let type = $state('');
  let limit = $state(40);
  let openId = $state<string | null>(null);

  const types = $derived([...new Set(activities.map((a) => a.type))].sort());
  const shown = $derived(activities.filter((a) => !type || a.type === type));
  const visible = $derived(shown.slice(0, limit));
  const miles = $derived(trainingState.units.wind === 'mph');
  const open = $derived(openId ? trainingState.externalActivities.find((a) => a.id === openId) : undefined);

  const groups = $derived.by(() => {
    const out: { month: string; items: ExternalActivity[] }[] = [];
    for (const a of visible) {
      const month = a.date.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.month === month) last.items.push(a);
      else out.push({ month, items: [a] });
    }
    return out;
  });

  const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
</script>

{#if trainingState.externalActivities.length === 0}
  <div class="text-center py-12 space-y-3">
    <p class="text-caption text-content-subtle">No imported activities yet. Runs, rides and walks from a Strava or Garmin export show up here.</p>
    <button onclick={() => trainingState.uiStore.openSettingsPage('activityImport')} class="btn btn-secondary">Import activities</button>
  </div>
{:else}
  <div class="space-y-4">
    {#if types.length > 1}
      <div class="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Activity type">
        <button type="button" class="chip shrink-0 {type === '' ? ACTIVE : ''}" aria-pressed={type === ''} onclick={() => (type = '')}>All</button>
        {#each types as t (t)}
          <button type="button" class="chip shrink-0 {type === t ? ACTIVE : ''}" aria-pressed={type === t} onclick={() => (type = type === t ? '' : t)}>{t}</button>
        {/each}
      </div>
    {/if}

    {#each groups as group (group.month)}
      <div class="card space-y-1">
        <h3 class="text-section uppercase text-content-muted px-1">{monthLabel(group.month)} · {group.items.length}</h3>
        <div class="divide-y divide-border/50">
          {#each group.items as a (a.id)}
            {@const tag = overlapTag(overlapsFor(a))}
            <ListRow
              title={a.name}
              meta="{formatDay(a.date, { weekday: 'short' })} · {startClock(a)}"
              detail={summaryLine(a, miles)}
              onclick={() => (openId = a.id)}
            >
              {#snippet titleExtra()}
                {#if tag}<span class="text-caption font-normal text-primary whitespace-nowrap" data-testid="overlap-tag">· {tag}</span>{/if}
              {/snippet}
              {#snippet leading()}
                <div class="w-16 h-11 shrink-0 grid place-items-center rounded-lg bg-surface-sunken">
                  {#if a.track}
                    <ActivityRoute track={a.track} width={64} height={44} label="Route" />
                  {:else}
                    <Icon icon="ic:baseline-directions-run" class="text-xl text-content-subtle" />
                  {/if}
                </div>
              {/snippet}
            </ListRow>
          {/each}
        </div>
      </div>
    {:else}
      <div class="text-center py-12">
        <p class="text-caption text-content-subtle">{filtered || type ? 'No activities match these filters.' : 'Nothing here.'}</p>
      </div>
    {/each}

    {#if shown.length > limit}
      <button onclick={() => (limit += 40)} class="btn btn-ghost w-full text-primary">Show more ({visible.length} of {shown.length})</button>
    {/if}
  </div>
{/if}

{#if open}
  <ActivitySheet activity={open} onClose={() => (openId = null)} />
{/if}
