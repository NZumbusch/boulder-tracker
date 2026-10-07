<script lang="ts">
  import { sheetDrag } from '../../lib/ui/sheetDrag';
  /**
   * Export the plan as a PDF: pick a week range and what to include; the
   * document is laid out by `lib/export/planPdf.ts` (pdfmake - real text,
   * no screenshots) and saved or shared like every other export.
   */
  import { saveFile } from '../../lib/share/saveFile';
  import { backWhile } from '../../lib/navigation/backStack.svelte';
  import { trainingState } from '../../lib/state.svelte';
  import { getWeekId, getWeekIdRange, getWeekDates, localIsoDate } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import { slotTypeName, planNote, logNote } from '../../lib/exerciseSlot';
  import { getDominantBlockForWeek } from '../../lib/planning/trainingBlocks';
  import { sortWorkoutsBySchedule } from '../../lib/planning/sortWorkouts';
  import { summarizeSession } from '../../lib/planning/sessionSummary';
  import { planProgress } from '../../lib/planning/weekRecap';
  import { detailPairs } from '../../lib/session/slotDetails';
  import { groupSummary } from '../../lib/exercise/groups';
  import { buildPlanPdf, type PlanPdfWeek } from '../../lib/export/planPdf';
  import type { DayOfWeek, Workout } from '../../lib/types';
  import Icon from '@iconify/svelte';

  let { onClose }: { onClose: () => void } = $props();

  let startWeek = $state(trainingState.currentWeekId);
  let endWeek = $state(trainingState.currentWeekId);
  let includeExercises = $state(true);
  let includeNotes = $state(true);
  let isGenerating = $state(false);

  const weekOptions = $derived.by(() => {
    const opts = [];
    for (let i = -24; i <= 24; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i * 7);
      const id = getWeekId(d);
      opts.push({ id, label: `Week ${id.split('-W')[1]} (${d.getFullYear()})${i === 0 ? ' · this week' : ''}` });
    }
    return opts;
  });
  const weekIds = $derived(getWeekIdRange(startWeek, endWeek));

  const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** "21 Sep 2026" / "21 Sep" / "21" - fixed short months (the locale's own mix "Aug" with "Sept"). UTC dates. */
  const fmt = (d: Date, opts: { day?: unknown; month?: unknown; year?: unknown }) =>
    [opts.day ? d.getUTCDate() : '', opts.month ? MONTHS[d.getUTCMonth()] : '', opts.year ? d.getUTCFullYear() : ''].filter(Boolean).join(' ');

  /**
   * What an exercise asks for, as briefly as reads clearly: "75 min ·
   * Slab, Coordination · 6A–6C+ · 4 sets · 6 reps · Rest 180 s". A value
   * that explains itself (a unit, a grade, a style) goes without its label;
   * a bare number gets it after ("4 sets"); timings keep it in front.
   */
  function exerciseDetail(pairs: { label: string; value: string }[]): string | undefined {
    const parts = pairs.map(({ label, value }) => {
      if (/time|rest/i.test(label)) return `${label} ${value}`;
      if (/^-?\d+(\.\d+)?$/.test(value)) return `${value} ${label.toLowerCase()}`;
      return value;
    });
    return parts.join(' · ') || undefined;
  }

  /** "21–27 Sep 2026", or "28 Sep – 4 Oct 2026" across a month. */
  function weekDates(weekId: string): string {
    const range = getWeekDates(weekId);
    if (!range) return weekId;
    const { start, end } = range;
    if (start.getUTCMonth() === end.getUTCMonth()) return `${start.getUTCDate()}–${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  function dayLabel(w: Workout): string | undefined {
    const range = getWeekDates(w.weekId);
    if (!w.dayOfWeek || !range) return undefined;
    const day = new Date(range.start.getTime() + DAYS.indexOf(w.dayOfWeek) * 86_400_000);
    return `${w.dayOfWeek.slice(0, 3)} ${day.getUTCDate()}`;
  }

  function buildWeek(weekId: string): PlanPdfWeek {
    const workouts = sortWorkoutsBySchedule(trainingState.getWorkoutsForWeek(weekId));
    const block = getDominantBlockForWeek(trainingState.trainingBlocks, weekId);
    const phase = block ? trainingState.phaseDefs.find((p) => p.id === block.phaseId) : undefined;
    let plannedLoad = 0;
    const sessions = workouts.map((w) => {
      const summary = summarizeSession(w, trainingState.exerciseTypes);
      plannedLoad += summary.plannedLoad;
      const done = w.status === 'completed';
      return {
        day: dayLabel(w),
        name: w.notes || 'Session',
        meta: [summary.startTime, `${summary.estimated ? '~' : ''}${summary.minutes} min`, summary.plannedLoad > 0 ? `load ${summary.plannedLoad}` : undefined].filter(Boolean).join(' · '),
        ...(done ? { done: { load: w.loadFactor } } : {}),
        description: w.description,
        exercises: w.exercises.map((slot, i) => {
          const values = done ? slot.logged ?? slot.prescribed : slot.prescribed;
          const group = slot.groupId ? w.groups?.find((g) => g.id === slot.groupId) : undefined;
          const first = !!group && w.exercises[i - 1]?.groupId !== slot.groupId;
          return {
            ...(group ? { member: true } : {}),
            ...(group && first ? { circuit: [group.name || 'Circuit', groupSummary(group)].join(' · ') } : {}),
            name: slotTypeName(slot, trainingState.exerciseTypes),
            detail: exerciseDetail(detailPairs(slot, values)),
            notes: (done ? [planNote(slot), logNote(slot) && `How it went: ${logNote(slot)}`].filter(Boolean).join('\n') : values?.notes?.trim()) || undefined,
          };
        }),
      };
    });
    return {
      title: `Week ${weekId.split('-W')[1]}`,
      dates: weekDates(weekId),
      ...(phase ? { phase: { name: phase.name, color: phase.color } } : {}),
      note: trainingState.getWeekNote(weekId) || undefined,
      sessions,
      plannedLoad,
      progress: planProgress(workouts),
    };
  }

  async function handleExport() {
    if (weekIds.length === 0) {
      await showAlert('Check the weeks', 'The start week has to be before the end week.');
      return;
    }
    isGenerating = true;
    try {
      const first = getWeekDates(weekIds[0]);
      const last = getWeekDates(weekIds[weekIds.length - 1]);
      const range = first && last
        ? `${fmt(first.start, { day: 'numeric', month: 'short', ...(first.start.getUTCFullYear() !== last.end.getUTCFullYear() ? { year: 'numeric' } : {}) })} – ${fmt(last.end, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${weekIds[0]} – ${weekIds[weekIds.length - 1]}`;
      const doc = buildPlanPdf({
        range,
        generatedOn: fmt(new Date(`${localIsoDate()}T12:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric' }),
        weeks: weekIds.map(buildWeek),
        options: { exercises: includeExercises, notes: includeNotes },
      });
      // Loaded on export only.
      const { renderPdf } = await import('../../lib/export/planPdfRender');
      const pdf = await renderPdf(doc);
      const fileName = `training-plan-${startWeek}${weekIds.length > 1 ? `-to-${endWeek}` : ''}.pdf`;
      const outcome = await saveFile({ content: pdf, fileName, mimeType: 'application/pdf', title: 'Training plan (PDF)' });
      if (outcome === 'failed') throw new Error('The PDF could not be saved.');
      onClose();
    } catch (err) {
      console.error(err);
      await showAlert('Export failed', `The PDF couldn't be made: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isGenerating = false;
    }
  }

  // Back (phone key or browser) does what this overlay's own close does - see lib/navigation/backStack.
  backWhile(() => true, () => onClose());
</script>

<div class="fixed inset-0 pb-safe bg-app-bg/90 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[100] backdrop-blur-md">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1" aria-label="Close"></div>
  <div class="relative bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-card border-t sm:border border-border p-5 shadow-2xl space-y-4" use:sheetDrag={() => onClose()}>
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-picture-as-pdf" class="text-primary text-xl shrink-0" />
          Training plan as PDF
        </h3>
        <p class="text-caption text-content-subtle mt-0.5">A clean, printable overview - {weekIds.length || 0} week{weekIds.length === 1 ? '' : 's'}</p>
      </div>
      <button onclick={onClose} class="text-content-subtle hover:text-content transition-colors shrink-0" aria-label="Close">
        <Icon icon="ic:baseline-close" class="text-xl" />
      </button>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <label class="space-y-1">
        <span class="text-label text-content-subtle">From</span>
        <select bind:value={startWeek} class="w-full bg-surface-elevated/50 text-content px-3 py-2.5 rounded-control border border-border-strong outline-none text-sm">
          {#each weekOptions as opt (opt.id)}<option value={opt.id}>{opt.label}</option>{/each}
        </select>
      </label>
      <label class="space-y-1">
        <span class="text-label text-content-subtle">To</span>
        <select bind:value={endWeek} class="w-full bg-surface-elevated/50 text-content px-3 py-2.5 rounded-control border border-border-strong outline-none text-sm">
          {#each weekOptions as opt (opt.id)}<option value={opt.id}>{opt.label}</option>{/each}
        </select>
      </label>
    </div>

    <div class="divide-y divide-border">
      <label class="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
        <span class="min-w-0">
          <span class="block text-body text-content">Exercises</span>
          <span class="block text-caption text-content-subtle">Each session's exercises with sets, reps, weights</span>
        </span>
        <input type="checkbox" bind:checked={includeExercises} class="w-5 h-5 rounded accent-primary shrink-0" />
      </label>
      <label class="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
        <span class="min-w-0">
          <span class="block text-body text-content">Notes</span>
          <span class="block text-caption text-content-subtle">Week, session and exercise notes</span>
        </span>
        <input type="checkbox" bind:checked={includeNotes} class="w-5 h-5 rounded accent-primary shrink-0" />
      </label>
    </div>

    <button
      onclick={handleExport}
      disabled={isGenerating || weekIds.length === 0}
      class="w-full py-3 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-control disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
    >
      {#if isGenerating}
        <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Making the PDF…
      {:else}
        <Icon icon="ic:baseline-download" class="text-lg" /> Create PDF
      {/if}
    </button>
    {#if weekIds.length === 0}<p class="text-caption text-status-caution">"From" has to be before "To".</p>{/if}
  </div>
</div>
