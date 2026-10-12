<script lang="ts">
  /**
   * Mounts the Timer sheet and, once one is started, the runner for it -
   * app-wide, so a timer works with no session at all (and alongside one).
   * Nothing is logged: a quick timer is for the moment. A run survives the
   * app being closed, like any other.
   */
  import { onMount } from 'svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { quickTimer, endQuickRun, startQuickRun } from '../../lib/timer/quickTimer.svelte';
  import { soloRun, SOLO_GROUP_ID } from '../../lib/timer/soloRun';
  import { variantOf } from '../../lib/timer/presets';
  import { live } from '../../lib/native/liveNotification.svelte';
  import { toast } from '../../lib/toast.svelte';
  import CircuitRunner, { CIRCUIT_RUN_KEY, forgetCircuitRun } from './CircuitRunner.svelte';
  import CircuitPill from './CircuitPill.svelte';
  import QuickTimerSheet from './QuickTimerSheet.svelte';
  import { generateId } from '../../lib/utils';
  import type { ExerciseSlot, ExerciseValues } from '../../lib/types';

  const QUICK_KEY = 'quick';
  const QUICK_GROUP = `solo-${QUICK_KEY}`;

  // A run that was going when the app closed is picked up again (the runner restores its own state).
  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CIRCUIT_RUN_KEY) ?? 'null');
      if (stored?.sessionKey === QUICK_KEY && stored.groupId === QUICK_GROUP && stored.cfg?.members?.[0]) {
        const values = stored.cfg.members[0].values;
        startQuickRun({ title: stored.cfg.group?.name || 'Timer', variant: variantOf(values), values, leadIn: stored.cfg.leadIn ?? 0 });
      }
    } catch { /* nothing to resume */ }
  });

  const run = $derived(quickTimer.run);
  const made = $derived.by(() => {
    if (!run) return null;
    const s = soloRun(run.values, { name: run.title, leadIn: run.leadIn, setRest: trainingState.tunable('timer.setRest') });
    const slot: ExerciseSlot = { id: QUICK_KEY, typeId: QUICK_KEY, prescribed: s.values };
    return { solo: s, group: { ...s.group, id: QUICK_GROUP }, slot };
  });

  function finish() {
    forgetCircuitRun();
    endQuickRun();
  }

  /** The numbers waiting for a name. */
  let naming = $state<{ values: ExerciseValues; leadIn: number; name: string } | null>(null);
  function askName(values: ExerciseValues, leadIn: number) {
    if (run) naming = { values: $state.snapshot(values) as ExerciseValues, leadIn, name: run.title };
  }
  function savePreset() {
    const n = naming;
    const name = n?.name.trim();
    if (!run || !n || !name) return;
    trainingState.saveTimerPreset({ id: generateId(), name, variant: variantOf(n.values), values: n.values, leadIn: n.leadIn });
    toast.show(`Saved "${name}"`);
    naming = null;
  }
  // Only one run owns the notification at a time.
  $effect(() => {
    if (quickTimer.sheetOpen && live.circuitRunning && !run) {
      quickTimer.sheetOpen = false;
      toast.show('Finish the timer that is running first');
    }
  });
</script>

{#if quickTimer.sheetOpen}
  <QuickTimerSheet />
{/if}

{#if run && made}
  <CircuitPill visible={quickTimer.minimized} bottomClass="bottom-[91px]" onOpen={() => (quickTimer.minimized = false)} />
  {#key run.key}
    <CircuitRunner
      sessionKey={QUICK_KEY}
      group={made.group}
      slots={[made.slot]}
      variant={made.solo.kind === 'pacer' ? 'pacer' : made.solo.kind}
      autoStart={false}
      leadIn={made.solo.leadIn}
      title={run.title}
      logLabel="Done"
      baseValues={run.values}
      visible={!quickTimer.minimized}
      onLog={finish}
      onClose={finish}
      onMinimize={() => (quickTimer.minimized = true)}
      onSavePreset={askName}
    />
  {/key}
{/if}

{#if naming}
  <div class="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center">
    <div class="absolute inset-0" onclick={() => (naming = null)} role="presentation"></div>
    <form onsubmit={(e) => { e.preventDefault(); savePreset(); }} class="relative w-full max-w-lg bg-surface rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 pb-8 space-y-3 shadow-2xl">
      <label class="block space-y-1.5">
        <span class="text-label text-content-subtle">Name this preset</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input autofocus bind:value={naming.name} maxlength="40" class="w-full px-3 py-3 bg-surface-elevated text-content rounded-control border border-border-strong text-body outline-none focus:border-primary/50" />
      </label>
      <button type="submit" disabled={!naming.name.trim()} class="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-control text-label font-bold disabled:opacity-40">Save</button>
    </form>
  </div>
{/if}
