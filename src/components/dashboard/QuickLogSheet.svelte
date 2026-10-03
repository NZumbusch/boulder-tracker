<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  import { localIsoDate } from '../../lib/dateUtils';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * Home's header "+": one sheet for the quick things logged outside a
   * session - pain, bodyweight, an outdoor send, a benchmark. Pain and
   * bodyweight show their history too, to edit or delete; sends and
   * benchmarks reuse the existing forms so there's one way to enter each.
   */
  import { trainingState } from '../../lib/state.svelte';
  import BodyweightLog from '../health/BodyweightLog.svelte';
  import PainIssues from '../health/PainIssues.svelte';
  import BenchmarkForm from '../common/BenchmarkForm.svelte';
  import SendForm from '../sends/SendForm.svelte';
  import { isOngoing } from '../../lib/goals/goals';
  import Icon from '@iconify/svelte';

  type Kind = 'pain' | 'bodyweight' | 'send' | 'benchmark';
  let { onClose, initialKind = null }: { onClose: () => void; initialKind?: Kind | null } = $props();

  // svelte-ignore state_referenced_locally
  let kind = $state<Kind | null>(initialKind);

  const ALL_ACTIONS: { kind: Kind; icon: string; label: string; hint: string }[] = [
    { kind: 'pain', icon: 'ic:baseline-healing', label: 'Pain', hint: 'Open issues, check in, or a new one' },
    { kind: 'bodyweight', icon: 'ic:baseline-monitor-weight', label: 'Bodyweight', hint: 'Today\'s weight' },
    { kind: 'send', icon: 'ic:baseline-terrain', label: 'Outdoor send', hint: 'Problem, grade, crag' },
    { kind: 'benchmark', icon: 'ic:baseline-straighten', label: 'Benchmark', hint: 'A test result this week' },
  ];
  // In the order, and with the visibility, chosen under Settings -> Home.
  const ACTIONS = $derived(
    trainingState.quickLogActions
      .filter((a) => a.visible)
      .map((a) => ALL_ACTIONS.find((x) => x.kind === a.id)!)
      .filter(Boolean),
  );

  const todayIso = () => localIsoDate();

  // --- Send: during a trip, its place is the default crag ---
  const ongoingTrip = $derived(
    trainingState.goals.find((g) => g.kind === 'trip' && g.location && isOngoing(g, todayIso())),
  );

  const title = $derived(kind ? ALL_ACTIONS.find((a) => a.kind === kind)!.label : 'Quick log');

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1" aria-label="Close"></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={() => onClose()}>
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        {#if kind}
          <button onclick={() => kind = null} class="p-1 -ml-1 text-content-subtle hover:text-content" aria-label="Back">
            <Icon icon="ic:baseline-arrow-back" class="text-xl" />
          </button>
        {/if}
        <h3 class="text-title text-content truncate">{title}</h3>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    {#if kind === null}
      <div class="grid grid-cols-2 gap-2">
        {#each ACTIONS as action}
          <button onclick={() => kind = action.kind} class="p-4 rounded-card border border-border-strong/50 bg-surface-elevated/40 hover:border-primary/40 text-left transition-colors">
            <Icon icon={action.icon} class="text-2xl text-primary" />
            <p class="text-body font-bold text-content mt-2">{action.label}</p>
            <p class="text-caption text-content-subtle">{action.hint}</p>
          </button>
        {/each}
      </div>
    {:else if kind === 'pain'}
      <PainIssues />
    {:else if kind === 'bodyweight'}
      <BodyweightLog />
    {:else if kind === 'send'}
      <SendForm defaults={{ crag: ongoingTrip?.location?.name }} onDone={onClose} />
    {:else if kind === 'benchmark'}
      <BenchmarkForm weekId={trainingState.currentWeekId} onSave={onClose} onCancel={() => kind = null} />
    {/if}
  </div>
</div>
