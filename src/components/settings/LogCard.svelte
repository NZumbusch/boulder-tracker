<script lang="ts">
  /**
   * Settings -> About & Help: the app's one log (lib/log; docs/logging.md) -
   * what it is, how much is in it, the newest problems, the full view, and
   * whether errors pop up as they happen.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { formatClockDate } from '../../lib/timeFormat';
  import { readLog, onLog, isProblem, readAlertLevel, setAlertLevel, type AlertLevel, type LogEntry, type LogFilter } from '../../lib/log';
  import LogView from './LogView.svelte';
  import { dayOf, dayHeading } from '../../lib/log/when';
  import Icon from '@iconify/svelte';
  import Segmented from '../ui/Segmented.svelte';

  let entries = $state<LogEntry[]>([]);
  let alertLevel = $state<AlertLevel>(readAlertLevel());
  let viewing = $state<LogFilter | null>(null);

  const load = async () => { entries = [...(await readLog())]; };
  $effect(() => {
    void load();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const stop = onLog(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = undefined; void load(); }, 2000);
    });
    return () => { stop(); if (pending) clearTimeout(pending); };
  });

  const problems = $derived(entries.filter(isProblem));
  const latest = $derived(problems.slice(-3).reverse());
  /** The time, with the day when it isn't today. */
  const when = (at: string) => {
    const day = dayHeading(dayOf(at));
    const clock = formatClockDate(new Date(at), trainingState.clock12);
    return day === 'Today' ? clock : `${day} ${clock}`;
  };

  function chooseAlert(level: AlertLevel) {
    alertLevel = level;
    setAlertLevel(level);
  }
</script>

<section class="card space-y-4 animate-in fade-in" aria-labelledby="about-log">
  <div class="space-y-1">
    <h2 id="about-log" class="text-section uppercase text-content-muted">Log</h2>
    <p class="text-caption text-content-subtle">
      What the app did and everything that went wrong - saves and what they changed, sync, sessions, screens, backups, errors - kept on this device, apart from your data. When something goes missing or breaks, share it.
    </p>
  </div>

  {#if entries.length}
    <p class="text-caption text-content-subtle tabular-nums">
      {entries.length.toLocaleString()} entries since {when(entries[0].at)}{problems.length ? ` · ${problems.length.toLocaleString()} problem${problems.length === 1 ? '' : 's'}` : ' · no problems'}
    </p>
  {/if}

  {#if latest.length}
    <ul class="divide-y divide-border">
      {#each latest as e (e.at + e.msg)}
        <li class="py-2 flex gap-2.5">
          <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 {e.level === 'error' ? 'bg-danger' : 'bg-warning'}"><span class="sr-only">{e.level}</span></span>
          <span class="min-w-0 flex-1">
            <span class="block text-caption text-content-subtle tabular-nums">{when(e.at)} · {e.area}{e.n && e.n > 1 ? ` · ×${e.n}` : ''}</span>
            <span class="block text-caption text-content break-words line-clamp-2">{e.msg}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button onclick={() => (viewing = 'activity')} class="btn btn-secondary flex-1 gap-1.5">
      <Icon icon="ic:baseline-terminal" class="text-base" /> Open the log
    </button>
    {#if problems.length}
      <button onclick={() => (viewing = 'problems')} class="btn btn-ghost gap-1.5">Problems only</button>
    {/if}
  </div>

  <div class="space-y-2">
    <span class="text-label text-content-subtle block">Pop up a message for</span>
    <Segmented
      variant="setting"
      full
      label="Pop up a message for"
      value={alertLevel}
      onChange={(v) => chooseAlert(v)}
      options={[{ value: 'off', label: 'Nothing' }, { value: 'errors', label: 'Errors' }, { value: 'all', label: 'Warnings too' }]}
    />
    <p class="text-caption text-content-subtle">For errors the app catches (crashes, failed calls). A save that didn't reach the phone's storage and a refused change always say so.</p>
  </div>
</section>

{#if viewing}
  <LogView initialFilter={viewing} onClose={() => (viewing = null)} />
{/if}
