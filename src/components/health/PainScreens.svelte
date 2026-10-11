<script lang="ts">
  /** Mounted once in App: whichever pain screen `lib/pain/painUi` has open. */
  import { painUi, closePainScreens, openPainIssue } from '../../lib/pain/painUi.svelte';
  import PainIssueSheet from './PainIssueSheet.svelte';
  import PainReportSheet from './PainReportSheet.svelte';
</script>

{#if painUi.issueId}
  {#key painUi.issueId}
    <PainIssueSheet issueId={painUi.issueId} onClose={closePainScreens} />
  {/key}
{:else if painUi.reporting}
  <PainReportSheet onClose={closePainScreens} onSaved={(id) => setTimeout(() => openPainIssue(id), 0)} />
{/if}
