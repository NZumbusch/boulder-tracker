<script lang="ts">
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  /**
   * The shareable week card: a week's plan (and what's done of it) as an
   * image, from the planner. Same rules as the session card
   * (WorkoutShareImage.svelte): header / body / footer with the body the
   * only flexible part, and literal colours inside the captured node so
   * the image looks the same whatever the theme.
   */
  import type { Workout } from '../../lib/types';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekDateRange } from '../../lib/dateUtils';
  import { WEEK_DAYS } from '../../lib/constants';
  import { sortWorkoutsBySchedule } from '../../lib/planning/sortWorkouts';
  import { sessionDuration } from '../../lib/planning/sessionDuration';
  import { formatMinutes } from '../../lib/session/formatSession';
  import { slotTypeName } from '../../lib/exerciseSlot';
  import { canCopyImages } from '../../lib/share/imageShare';
  import { copyCard, shareCard } from '../../lib/share/cardShare';
  import Icon from '@iconify/svelte';

  let { weekId, onClose }: { weekId: string; onClose: () => void } = $props();

  let containerNode: HTMLElement | null = $state(null);
  let busy = $state<null | 'copy' | 'share'>(null);

  const workouts = $derived(sortWorkoutsBySchedule(trainingState.getWorkoutsForWeek(weekId)));
  const block = $derived(trainingState.getDominantBlockForWeek(weekId));
  const phaseName = $derived(block ? trainingState.phaseDefs.find((p) => p.id === block.phaseId)?.name : undefined);
  const weekNumber = $derived(weekId.split('-W')[1]);
  const days = $derived(
    [...WEEK_DAYS.map((day) => ({ label: day.slice(0, 3), sessions: workouts.filter((w) => w.dayOfWeek === day) })),
     { label: '—', sessions: workouts.filter((w) => !w.dayOfWeek) }]
      .filter((d, i) => i < 7 || d.sessions.length > 0),
  );
  const doneCount = $derived(workouts.filter((w) => w.status === 'completed').length);
  const minutes = $derived(workouts.reduce((sum, w) => sum + sessionDuration(w), 0));
  // One scale per number: the rated load of what's done once anything is,
  // otherwise the plan's own estimate - never the two added together.
  const load = $derived(
    doneCount > 0
      ? { value: Math.round(workouts.reduce((sum, w) => sum + (w.status === 'completed' ? w.loadFactor || 0 : 0), 0)), label: 'Load' }
      : { value: Math.round(workouts.reduce((sum, w) => sum + (w.plannedLoad || 0), 0)), label: 'Planned load' },
  );

  function exercisesLine(w: Workout): string {
    const names = w.exercises.map((e) => slotTypeName(e, trainingState.exerciseTypes));
    return names.slice(0, 3).join(' · ') + (names.length > 3 ? ` +${names.length - 3}` : '');
  }

  async function handleCopy() {
    if (!containerNode || busy) return;
    busy = 'copy';
    try { await copyCard(containerNode); } finally { busy = null; }
  }

  async function handleShare() {
    if (!containerNode || busy) return;
    busy = 'share';
    try {
      await shareCard(containerNode, {
        fileName: `climbing-week-${weekId}.png`,
        title: `Week ${weekNumber}`,
        text: `Week ${weekNumber}${phaseName ? ` · ${phaseName}` : ''} - ${workouts.length} session${workouts.length === 1 ? '' : 's'}`,
      });
    } finally {
      busy = null;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in overflow-y-auto no-scrollbar">
  <div class="flex flex-col items-center gap-5 w-full max-w-sm my-auto">
    <div
      bind:this={containerNode}
      class="w-full aspect-[4/5] rounded-[32px] p-7 flex flex-col relative overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.1)]"
      style="background: linear-gradient(to bottom right, #18181b, #000000);"
    >
      <div
        class="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
        style="background: radial-gradient(circle, rgba(37,99,235,0.38) 0%, rgba(37,99,235,0.12) 45%, rgba(37,99,235,0) 72%);"
      ></div>

      <!-- Header -->
      <div class="relative z-10 shrink-0">
        <div class="flex items-center gap-2 mb-1.5">
          <div class="w-2 h-2 bg-[#2563eb] rounded-full"></div>
          <span class="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.2em]">{getWeekDateRange(weekId)}</span>
        </div>
        <h2 class="text-3xl font-black text-white tracking-tighter leading-tight">Week {weekNumber}</h2>
        {#if phaseName || block}
          <p class="text-xs font-bold text-[rgba(255,255,255,0.6)] mt-0.5 truncate">{[block?.name, phaseName].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ')}</p>
        {/if}
      </div>

      <!-- Body: one row per day -->
      <div class="relative z-10 flex-1 min-h-0 overflow-hidden my-4 space-y-2">
        {#each days as day}
          <div class="flex gap-3 border-b border-[rgba(255,255,255,0.08)] pb-2">
            <span class="w-8 shrink-0 text-[10px] font-black uppercase tracking-widest text-[#3b82f6] pt-0.5">{day.label}</span>
            <div class="min-w-0 flex-1 space-y-1">
              {#each day.sessions as w}
                <div class="min-w-0">
                  <p class="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    {#if w.status === 'completed'}<span class="text-[#22c55e]">✓</span>{/if}
                    <span class="truncate">{w.notes || 'Session'}</span>
                    {#if w.startTime}<span class="text-[10px] font-mono text-[rgba(255,255,255,0.45)] shrink-0">{w.startTime}</span>{/if}
                  </p>
                  {#if w.exercises.length > 0}
                    <p class="text-[10px] text-[rgba(255,255,255,0.5)] truncate">{exercisesLine(w)}</p>
                  {/if}
                </div>
              {:else}
                <p class="text-[10px] font-bold uppercase tracking-widest text-[rgba(255,255,255,0.25)] pt-0.5">Rest</p>
              {/each}
            </div>
          </div>
        {/each}
        <div class="absolute bottom-0 left-0 right-0 h-6 pointer-events-none" style="background: linear-gradient(to bottom, rgba(6,6,7,0), #060607);"></div>
      </div>

      <!-- Footer -->
      <div class="relative z-10 shrink-0 flex justify-between items-end border-t border-[rgba(255,255,255,0.1)] pt-4">
        <div class="flex items-end gap-5">
          <div>
            <p class="text-3xl font-black text-white tracking-tighter leading-none">{doneCount > 0 ? `${doneCount}/${workouts.length}` : workouts.length}</p>
            <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1.5">{doneCount > 0 ? 'Done' : 'Sessions'}</p>
          </div>
          <div>
            <p class="text-3xl font-black text-white tracking-tighter leading-none">{formatMinutes(minutes)}</p>
            <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1.5">Time</p>
          </div>
          {#if load.value > 0}
            <div>
              <p class="text-3xl font-black text-white tracking-tighter leading-none">{load.value}</p>
              <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1.5">{load.label}</p>
            </div>
          {/if}
        </div>
        <p class="text-[10px] font-black text-[rgba(255,255,255,0.3)] tracking-widest uppercase">Boulder Tracker</p>
      </div>
    </div>

    <div class="flex gap-2.5 w-full">
      <button
        onclick={onClose}
        disabled={busy !== null}
        class="shrink-0 px-5 py-4 bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors border border-border"
      >Close</button>
      {#if canCopyImages()}
        <button
          onclick={handleCopy}
          disabled={busy !== null}
          class="shrink-0 px-5 py-4 bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors border border-border flex items-center justify-center gap-2"
        >
          <Icon icon="ic:baseline-content-copy" class="text-sm" />
          {busy === 'copy' ? '...' : 'Copy'}
        </button>
      {/if}
      <button
        onclick={handleShare}
        disabled={busy !== null}
        class="flex-1 min-w-0 py-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        <Icon icon="ic:baseline-ios-share" class="text-sm" />
        {busy === 'share' ? 'Preparing...' : 'Share'}
      </button>
    </div>
  </div>
</div>
