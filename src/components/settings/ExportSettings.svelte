<script lang="ts">
  /** Settings -> Data & connections -> Calendar & PDF: getting the plan and history out - a calendar file and a printable PDF. */
  import { trainingState } from '../../lib/state.svelte';
  import { exportWorkoutsToICS, exportWeekIds } from '../../lib/ics';
  import PDFExportModal from './PDFExportModal.svelte';
  import Icon from "@iconify/svelte";

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
    exportWorkoutsToICS([...seen.values()], { exerciseTypes: trainingState.exerciseTypes });
  }
</script>

<div class="space-y-4">
  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2">
      <h3 class="text-section uppercase text-content-muted px-1">Calendar Integration</h3>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">Your planned sessions as an ICS file for any calendar app, each at its day and time with its exercises. Finished sessions are as long as they really took.</p>
    </div>
    <button
      onclick={exportCalendar}
      class="w-full flex items-center justify-between py-2 transition-colors group"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-calendar-today" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left">
          <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export Calendar (.ics)</p>
          <p class="text-caption text-content-subtle">{includePast ? 'Everything logged and planned' : 'This week onwards'}</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
    <label class="flex items-center gap-2 px-1 text-label text-content-muted cursor-pointer">
      <input type="checkbox" bind:checked={includePast} class="accent-primary" />
      Include past sessions
    </label>
  </div>

  <div class="card space-y-4 animate-in fade-in">
    <div class="space-y-2"><h3 class="text-section uppercase text-content-muted px-1">Printable Training Plan</h3><p class="text-caption text-content-subtle px-1 leading-relaxed">Generate a PDF of your workouts for any week range.</p></div>
    <button
      onclick={() => showPDFExport = true}
      class="w-full flex items-center justify-between py-2 transition-colors group"
    >
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-picture-as-pdf" class="text-xl text-content-subtle group-hover:text-primary transition-colors shrink-0" />
        <div class="text-left">
          <p class="text-body font-semibold text-content group-hover:text-primary transition-colors">Export PDF</p>
          <p class="text-caption text-content-subtle">Select week range</p>
        </div>
      </div>
      <Icon icon="ic:baseline-chevron-right" class="text-content-subtle text-xl" />
    </button>
  </div>

</div>

{#if showPDFExport}
  <PDFExportModal onClose={() => showPDFExport = false} />
{/if}
