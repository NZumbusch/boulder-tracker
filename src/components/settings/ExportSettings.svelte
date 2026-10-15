<script lang="ts">
  /** Settings -> Data & connections -> Calendar & PDF: getting the plan and history out - a calendar file and a printable PDF. */
  import { trainingState } from '../../lib/state.svelte';
  import { exportWorkoutsToICS, exportWeekIds } from '../../lib/ics';
  import PDFExportModal from './PDFExportModal.svelte';
  import ActionRow from './ActionRow.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { toast } from '../../lib/toast.svelte';

  let showPDFExport = $state(false);
  let includePast = $state(false);

  /** Weeks as the Plan shows them: weeks that still follow their phase and the side of a Plan B that counts included. */
  function exportCalendar() {
    const ids = exportWeekIds({
      currentWeekId: trainingState.currentWeekId,
      workouts: trainingState.workouts,
      blocks: trainingState.trainingBlocks,
      includePast,
    });
    const seen = new Map(ids.flatMap((id) => trainingState.getWorkoutsForWeek(id)).map((w) => [w.id, w]));
    if (seen.size === 0) {
      toast.show(includePast ? 'There are no sessions to export' : 'Nothing planned from this week on. Switch on "Include past sessions" to export what you logged.');
      return;
    }
    exportWorkoutsToICS([...seen.values()], { exerciseTypes: trainingState.exerciseTypes });
  }
</script>

<div class="space-y-4">
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h2 class="text-section uppercase text-content-muted px-1">Calendar file</h2>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Your planned sessions as an ICS file for any calendar app, each at its day and time with its exercises. Finished sessions are as long as they really took.</p>
    </div>
    <Toggle checked={includePast} onChange={(v) => (includePast = v)} label="Include past sessions" hint="Off: this week onwards only" />
    <ActionRow icon="ic:baseline-calendar-today" title="Export calendar (.ics)" hint={includePast ? 'Everything logged and planned' : 'This week onwards'} onclick={exportCalendar} />
  </div>

  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h2 class="text-section uppercase text-content-muted px-1">Printable training plan</h2><p class="text-caption text-content-subtle px-1 leading-relaxed">Generate a PDF of your workouts for any week range.</p></div>
    <ActionRow icon="ic:baseline-picture-as-pdf" title="Export PDF" hint="Select week range" onclick={() => (showPDFExport = true)} />
  </div>

</div>

{#if showPDFExport}
  <PDFExportModal onClose={() => showPDFExport = false} />
{/if}
