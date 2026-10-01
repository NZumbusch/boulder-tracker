<script lang="ts">
  /**
   * Settings -> Widgets (Android): put the home-screen widgets on the home
   * screen from here instead of hunting through the launcher's picker, and
   * choose what they show. They redraw whenever the app saves and keep the
   * day and a running session's clock right on their own
   * (`lib/widget/widgetSync.svelte.ts`, `plugins/home-widget`).
   */
  import { trainingState } from '../../lib/state.svelte';
  import { pinWidget, type WidgetKind } from '../../lib/widget/widgetSync.svelte';
  import { toast } from '../../lib/toast.svelte';
  import type { WidgetReadinessDetail } from '../../lib/preferences/migrate';
  import Icon from '@iconify/svelte';

  const WIDGETS: { kind: WidgetKind; icon: string; title: string; size: string; hint: string }[] = [
    { kind: 'today', icon: 'ic:baseline-view-agenda', title: 'Today', size: '4×2', hint: 'Readiness, today\'s session or the running one, Start and Log. Stretch it taller for the next days.' },
    { kind: 'week', icon: 'ic:baseline-view-week', title: 'This week', size: '4×1', hint: 'The week day by day - done, missed, planned. Stretch it for the totals.' },
    { kind: 'load', icon: 'ic:baseline-bar-chart', title: 'Week load', size: '2×2', hint: 'The week\'s load, how much of the plan is done, and the ACWR zone.' },
    { kind: 'quicklog', icon: 'ic:baseline-add-circle-outline', title: 'Quick log', size: '4×1', hint: 'Pain, bodyweight, send, benchmark - each opens its own form. Which ones follows Settings → Appearance → Home.' },
    { kind: 'readiness', icon: 'ic:baseline-donut-large', title: 'Readiness', size: '2×2', hint: 'Today\'s score - tap it to log metrics. Stretch it tall for the factors or today\'s numbers.' },
  ];

  const DETAILS: { id: WidgetReadinessDetail; label: string; hint: string }[] = [
    { id: 'none', label: 'Clean', hint: 'Just the ring and its label.' },
    { id: 'factors', label: 'Factors', hint: 'What moved the score: fatigue, load, sleep, HRV and pain, as points lost (✓ = cost nothing).' },
    { id: 'metrics', label: 'Numbers', hint: 'Today\'s logged sleep, HRV, resting heart rate, and your latest weight.' },
  ];

  async function add(kind: WidgetKind) {
    if (!(await pinWidget(kind))) {
      toast.show('This launcher can\'t add it from here - long-press the home screen → Widgets → Boulder Tracker', { durationMs: 6000 });
    }
  }
</script>

<div class="space-y-4">
  <div class="card space-y-2 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted">Home-screen widgets</h3>
      <p class="text-caption text-content-subtle leading-relaxed">They update whenever the app saves, and keep the day and a running session's clock right on their own. Resize one on the home screen and it shows more.</p>
    </div>
    <div class="divide-y divide-border">
      {#each WIDGETS as w (w.kind)}
        <button onclick={() => add(w.kind)} class="w-full flex items-center justify-between gap-3 py-2.5 group">
          <div class="flex items-center gap-3 min-w-0">
            <Icon icon={w.icon} class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
            <div class="text-left min-w-0">
              <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">{w.title} <span class="text-caption font-normal text-content-subtle">{w.size}</span></p>
              <p class="text-caption text-content-subtle">{w.hint}</p>
            </div>
          </div>
          <span class="text-label text-primary shrink-0">Add</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="card animate-in fade-in">
    <label class="flex items-center justify-between gap-3 cursor-pointer">
      <div class="min-w-0">
        <p class="text-body text-content">Show readiness on widgets</p>
        <p class="text-caption text-content-subtle mt-0.5">Off keeps the score off your home screen - the ring stays empty and a tap still logs your metrics.</p>
      </div>
      <input type="checkbox" checked={trainingState.widgetShowReadiness} onchange={(e) => trainingState.setWidgetShowReadiness(e.currentTarget.checked)} class="w-5 h-5 rounded accent-primary shrink-0" />
    </label>
  </div>

  <div class="card space-y-3 animate-in fade-in">
    <div class="space-y-1 px-1">
      <p class="text-body text-content">Readiness widget, stretched tall</p>
      <p class="text-caption text-content-subtle">What goes under the ring once you make it taller than two rows.</p>
    </div>
    <div class="seg p-1">
      {#each DETAILS as d (d.id)}
        <button onclick={() => trainingState.setWidgetReadinessDetail(d.id)} class="seg-item flex-1 py-1.5 text-label {trainingState.widgetReadinessDetail === d.id ? 'seg-on' : 'hover:text-content'}">{d.label}</button>
      {/each}
    </div>
    <p class="text-caption text-content-subtle px-1">{DETAILS.find((d) => d.id === trainingState.widgetReadinessDetail)?.hint}</p>
  </div>
</div>
