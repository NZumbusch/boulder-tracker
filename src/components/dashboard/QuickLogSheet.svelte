<script lang="ts">
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
  import Sheet from '../ui/Sheet.svelte';
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
    { kind: 'benchmark', icon: 'ic:baseline-straighten', label: 'Test result', hint: 'A result this week' },
  ];
  // In the order, and with the visibility, chosen under Settings -> Home.
  const ACTIONS = $derived(
    trainingState.quickLogActions
      .filter((a) => a.visible)
      .map((a) => ALL_ACTIONS.find((x) => x.kind === a.id)!)
      .filter(Boolean),
  );

  const todayIso = () => trainingState.todayIso;

  // --- Send: during a trip, its place is the default crag ---
  const ongoingTrip = $derived(
    trainingState.goals.find((g) => g.kind === 'trip' && g.location && isOngoing(g, todayIso())),
  );

  const title = $derived(kind ? ALL_ACTIONS.find((a) => a.kind === kind)!.label : 'Quick log');
</script>

<Sheet {title} {onClose}>
  {#snippet headerExtra()}
    {#if kind}
      <button onclick={() => kind = null} class="btn-icon" aria-label="Back to quick log">
        <Icon icon="ic:baseline-arrow-back" class="text-xl" />
      </button>
    {/if}
  {/snippet}

  {#if kind === null}
    <div class="grid grid-cols-2 gap-2">
      {#each ACTIONS as action}
        <button onclick={() => kind = action.kind} class="p-4 rounded-card bg-surface-elevated/40 hover:bg-surface-elevated/70 text-left transition-colors flex flex-col items-start justify-start gap-1">
          <Icon icon={action.icon} class="text-2xl text-primary" />
          <span class="text-body font-bold text-content mt-1">{action.label}</span>
          <span class="text-caption text-content-subtle">{action.hint}</span>
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
</Sheet>
