<script lang="ts">
  /**
   * Import an AI change set (or an older weekly/phase plan, converted).
   * Paste -> validate -> a reviewable list of every change, grouped by
   * exercises, phases and weeks, each with its before -> after lines,
   * warnings and a tick box. Unticking something re-plans the rest: any
   * change that relied on it is unticked too, with the reason shown. Apply
   * writes exactly what the ticked changes produce, in one go.
   */
  import { trainingState } from '../../lib/state.svelte';
  import { showAlert } from '../../lib/utils';
  import { parsePlanImport } from '../../lib/ai/planImportEntry';
  import { planWithSelection, allItemIds, type ChangeItem, type ChangeSection } from '../../lib/ai/changePlanner';
  import { groupIssues, formatIssuesForAI } from '../../lib/ai/issueSummary';
  import Icon from '@iconify/svelte';

  let { onClose }: { onClose: () => void } = $props();

  let pasteText = $state('');
  let applying = $state(false);
  let copiedErrors = $state(false);
  let showRepairs = $state(false);

  const parsed = $derived(
    pasteText.trim() ? parsePlanImport(pasteText, { exerciseTypes: trainingState.exerciseTypes, phaseDefs: trainingState.phaseDefs }) : null,
  );
  const changeSet = $derived(parsed?.result.valid ? parsed.result.data : null);
  const issues = $derived(parsed?.result.issues ?? []);
  const repairs = $derived(parsed?.result.repairs ?? []);
  const issueGroups = $derived(groupIssues(issues));

  // What the user has ticked. Reset to "everything" only when a new document
  // is pasted - not when the change set is merely re-derived after a data change.
  let requested = $state<Set<string>>(new Set());
  let tickedFor = '';
  $effect(() => {
    if (pasteText === tickedFor) return;
    tickedFor = pasteText;
    requested = changeSet ? allItemIds(changeSet) : new Set();
  });
  const plan = $derived(changeSet ? planWithSelection(changeSet, trainingState.plannerState, requested) : null);

  function toggle(id: string) {
    const next = new Set(requested);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    requested = next;
  }

  const SECTIONS: { id: ChangeSection; label: string; icon: string }[] = [
    { id: 'exercise', label: 'Exercises', icon: 'ic:baseline-fitness-center' },
    { id: 'phase', label: 'Phases', icon: 'ic:baseline-view-week' },
    { id: 'week', label: 'Weeks', icon: 'ic:baseline-calendar-month' },
  ];

  /** Why a ticked item didn't make it: its own errors, or an unticked change it needs. */
  function blockedReason(item: ChangeItem): string | undefined {
    if (!plan || !requested.has(item.id) || plan.selected.has(item.id)) return undefined;
    if (item.errors.length) return item.errors.join(' ');
    const missing = item.dependsOn.filter((d) => !plan.selected.has(d));
    const titles = missing.map((d) => plan.items.find((i) => i.id === d)?.title ?? d);
    return titles.length ? `Needs ${titles.join(', ')}, which isn't being applied.` : undefined;
  }

  const appliedCount = $derived(plan?.selected.size ?? 0);

  async function copyErrors() {
    await navigator.clipboard.writeText(formatIssuesForAI(issues));
    copiedErrors = true;
    setTimeout(() => (copiedErrors = false), 2000);
  }

  async function apply() {
    if (!changeSet || !plan || appliedCount === 0) return;
    applying = true;
    try {
      // Re-plan once more for the final writes, so ids are fresh and nothing stale is applied.
      const final = planWithSelection(changeSet, trainingState.plannerState, plan.selected);
      await trainingState.applyPlanWrites(final.writes);
      const skipped = final.items.length - final.selected.size;
      await showAlert('Plan updated', `Applied ${final.selected.size} change${final.selected.size === 1 ? '' : 's'}${skipped ? ` (${skipped} left out)` : ''}.`);
      onClose();
    } catch (err: any) {
      await showAlert('Import failed', err?.message || 'Something went wrong applying the changes.');
    } finally {
      applying = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300 p-0 sm:p-4 pb-[80px]">
  <div class="absolute inset-0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="0" aria-label="Close AI Import"></div>

  <div class="relative w-full sm:max-w-lg bg-surface border-t sm:border border-border-strong rounded-t-2xl sm:rounded-card shadow-2xl flex flex-col max-h-[85vh]">
    <div class="p-5 border-b border-border-strong flex items-center justify-between shrink-0">
      <div>
        <h2 class="text-title text-content flex items-center gap-2">
          <Icon icon="ic:baseline-auto-awesome" class="text-primary text-xl" />
          Import AI Plan
        </h2>
        <p class="text-caption text-content-subtle mt-1">Review every change - nothing is saved until you apply</p>
      </div>
      <button onclick={onClose} class="p-2 text-content-muted hover:text-content bg-surface-elevated/50 hover:bg-surface-elevated rounded-control transition-all" aria-label="Close"><Icon icon="ic:baseline-close" class="text-lg" /></button>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
      <textarea
        bind:value={pasteText}
        rows={changeSet ? 3 : 6}
        placeholder="Paste the JSON your AI replied with..."
        aria-label="AI reply"
        class="w-full bg-surface-elevated text-content p-3.5 rounded-control border border-border-strong outline-none text-xs font-mono resize-none"
      ></textarea>

      {#if pasteText.trim() && issues.length > 0}
        <div class="p-3.5 bg-danger/10 border border-danger/30 rounded-control space-y-3">
          <div class="flex items-start justify-between gap-3">
            <p class="text-label text-danger flex items-center gap-1.5">
              <Icon icon="ic:baseline-error-outline" class="text-sm" />
              {issueGroups.length} problem{issueGroups.length === 1 ? '' : 's'} to fix
            </p>
            <button onclick={copyErrors} class="shrink-0 text-label text-primary flex items-center gap-1 hover:underline">
              <Icon icon={copiedErrors ? 'ic:baseline-check' : 'ic:baseline-content-copy'} class="text-sm" />
              {copiedErrors ? 'Copied' : 'Copy fix request'}
            </button>
          </div>
          <ul class="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {#each issueGroups as group (group.label + group.message)}
              <li class="text-caption bg-surface/60 rounded-control px-3 py-2">
                <span class="font-mono text-content-muted">{group.label}</span>{group.count > 1 ? ` ×${group.count}` : ''} - <span class="text-content">{group.message}</span>
              </li>
            {/each}
          </ul>
          <p class="text-caption text-content-subtle leading-snug">"Copy fix request" puts a correction note on your clipboard - paste it into the same AI chat and it resends the corrected JSON.</p>
        </div>
      {/if}

      {#if changeSet && plan}
        {#if parsed?.legacyFormat}
          <p class="text-caption text-content-subtle flex items-start gap-1.5">
            <Icon icon="ic:baseline-info" class="text-sm shrink-0 mt-px" />
            <span>This is an older {parsed.legacyFormat === 'phase' ? 'phase-plan' : 'week-by-week'} reply - it has been converted to changes below.</span>
          </p>
        {/if}
        {#if changeSet.summary}
          <div class="p-3.5 rounded-control bg-primary/5 border border-primary/20">
            <p class="text-caption uppercase text-content-subtle mb-1">AI summary</p>
            <p class="text-body text-content leading-relaxed">{changeSet.summary}</p>
          </div>
        {/if}
        {#if repairs.length > 0}
          <button onclick={() => showRepairs = !showRepairs} class="text-caption text-warning flex items-center gap-1">
            <Icon icon="ic:baseline-auto-fix-high" class="text-sm" /> {repairs.length} small fix{repairs.length === 1 ? '' : 'es'} applied to the reply
          </button>
          {#if showRepairs}
            <ul class="text-caption text-content-subtle space-y-0.5 pl-5 list-disc">
              {#each repairs as r}<li><span class="font-mono">{r.path}</span>: {r.message}</li>{/each}
            </ul>
          {/if}
        {/if}

        {#each SECTIONS as section (section.id)}
          {@const items = plan.items.filter((i) => i.section === section.id)}
          {#if items.length > 0}
            <div class="space-y-2">
              <p class="text-section uppercase text-content-muted flex items-center gap-1.5 px-1">
                <Icon icon={section.icon} class="text-sm" /> {section.label}
              </p>
              {#each items as item (item.id)}
                {@const on = plan.selected.has(item.id)}
                {@const reason = blockedReason(item)}
                <div class="rounded-control border p-3 space-y-1.5 transition-colors {on ? 'border-border-strong/60 bg-surface-elevated/40' : 'border-border/60 bg-surface-elevated/10'}">
                  <label class="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onchange={() => toggle(item.id)}
                      class="w-4 h-4 mt-0.5 accent-primary shrink-0"
                      aria-label="Apply: {item.title}"
                    />
                    <span class="text-body font-bold {on ? 'text-content' : 'text-content-subtle line-through'}">{item.title}</span>
                  </label>
                  {#if item.details.length > 0}
                    <ul class="pl-6.5 space-y-0.5">
                      {#each item.details as line}
                        <li class="text-caption font-mono leading-snug break-words {line.startsWith('+') || line.includes(': +') ? 'text-status-good' : line.startsWith('−') || line.includes(': −') ? 'text-status-risk' : 'text-content-muted'}">{line}</li>
                      {/each}
                    </ul>
                  {/if}
                  {#each item.warnings as warning}
                    <p class="pl-6.5 text-caption text-warning flex items-start gap-1"><Icon icon="ic:baseline-warning-amber" class="text-sm shrink-0 mt-px" /><span>{warning}</span></p>
                  {/each}
                  {#if reason}
                    <p class="pl-6.5 text-caption text-danger flex items-start gap-1"><Icon icon="ic:baseline-block" class="text-sm shrink-0 mt-px" /><span>{reason}</span></p>
                  {:else if !on && item.errors.length}
                    <p class="pl-6.5 text-caption text-danger flex items-start gap-1"><Icon icon="ic:baseline-block" class="text-sm shrink-0 mt-px" /><span>{item.errors.join(' ')}</span></p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    {#if changeSet && plan}
      <div class="p-4 border-t border-border-strong shrink-0 flex gap-2">
        <button onclick={onClose} class="px-4 py-3 bg-surface-elevated text-content-muted text-sm font-bold rounded-control">Cancel</button>
        <button onclick={apply} disabled={applying || appliedCount === 0} class="flex-1 py-3 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-control disabled:opacity-40">
          {applying ? 'Applying…' : `Apply ${appliedCount} of ${plan.items.length} change${plan.items.length === 1 ? '' : 's'}`}
        </button>
      </div>
    {/if}
  </div>
</div>
