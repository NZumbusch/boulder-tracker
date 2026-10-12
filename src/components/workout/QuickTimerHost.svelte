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
  import CircuitRunner, { CIRCUIT_RUN_KEY, forgetCircuitRun } from './CircuitRunner.svelte';
  import CircuitPill from './CircuitPill.svelte';
  import QuickTimerSheet from './QuickTimerSheet.svelte';
  import PresetNameSheet from './PresetNameSheet.svelte';
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
  let naming = $state<{ values: ExerciseValues; leadIn: number } | null>(null);
  const askName = (values: ExerciseValues, leadIn: number) => (naming = { values: $state.snapshot(values) as ExerciseValues, leadIn });
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

{#if naming && run}
  <PresetNameSheet values={naming.values} leadIn={naming.leadIn} suggestion={run.title} onDone={() => (naming = null)} />
{/if}
