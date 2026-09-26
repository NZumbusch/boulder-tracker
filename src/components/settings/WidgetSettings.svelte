<script lang="ts">
  /** Android: put the Today / Readiness widgets on the home screen from here, instead of hunting through the launcher's picker. */
  import { pinWidget, widgetsAvailable } from '../../lib/widget/widgetSync.svelte';
  import { toast } from '../../lib/toast.svelte';
  import Icon from '@iconify/svelte';

  const WIDGETS = [
    { kind: 'today' as const, icon: 'ic:baseline-view-agenda', title: 'Today', hint: 'Readiness, today\'s session, Start and Log (4×2)' },
    { kind: 'readiness' as const, icon: 'ic:baseline-donut-large', title: 'Readiness', hint: 'Today\'s score - tap it to log metrics (2×2)' },
  ];

  async function add(kind: 'today' | 'readiness') {
    if (!(await pinWidget(kind))) {
      toast.show('This launcher can\'t add it from here - long-press the home screen → Widgets → Boulder Tracker', { durationMs: 6000 });
    }
  }
</script>

{#if widgetsAvailable()}
  <div class="card space-y-2 animate-in fade-in">
    <div class="space-y-1 px-1">
      <h3 class="text-section uppercase text-content-muted">Home-screen widgets</h3>
      <p class="text-caption text-content-subtle leading-relaxed">They update whenever the app saves, and keep the day and a running session's clock right on their own.</p>
    </div>
    <div class="divide-y divide-border">
      {#each WIDGETS as w (w.kind)}
        <button onclick={() => add(w.kind)} class="w-full flex items-center justify-between gap-3 py-2.5 group">
          <div class="flex items-center gap-3 min-w-0">
            <Icon icon={w.icon} class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
            <div class="text-left min-w-0">
              <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">{w.title}</p>
              <p class="text-caption text-content-subtle">{w.hint}</p>
            </div>
          </div>
          <span class="text-label text-primary shrink-0">Add</span>
        </button>
      {/each}
    </div>
  </div>
{/if}
