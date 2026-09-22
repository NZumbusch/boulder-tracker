<script lang="ts">
  /**
   * How live sessions behave. One setting so far: what an exercise added
   * mid-session counts as.
   *
   * Both options are real and neither is a compromise, which is why this
   * is a preference rather than a decision made for you - the honest
   * answer depends on whether you treat the plan as a contract (an
   * unplanned extra is extra, and adherence should say so) or as a rough
   * intent (what you did *is* the session).
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AddedExerciseTarget } from '../../lib/preferences/migrate';
  import Icon from '@iconify/svelte';

  const OPTIONS: { value: AddedExerciseTarget; icon: string; title: string; detail: string }[] = [
    {
      value: 'none',
      icon: 'ic:baseline-add-circle-outline',
      title: 'Count it as extra',
      detail: 'No target is recorded, so the exercise shows as extra work on top of the plan and adds nothing to planned load. Adherence still measures you against what was actually planned.',
    },
    {
      value: 'mirror',
      icon: 'ic:baseline-playlist-add-check',
      title: 'Treat it as planned',
      detail: 'What you did is copied in as the target too, so the exercise counts toward planned load and the session reports full adherence.',
    },
  ];
</script>

<div class="bg-surface border border-border rounded-card p-5 space-y-4 backdrop-blur-sm shadow-card animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Sessions</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      When you add an exercise part-way through a running session, what should it count as?
    </p>
  </div>

  <div class="space-y-3">
    {#each OPTIONS as option}
      {@const selected = trainingState.addedExerciseTarget === option.value}
      <button
        onclick={() => trainingState.setAddedExerciseTarget(option.value)}
        class="w-full flex items-start justify-between gap-3 p-4 rounded-card border transition-all text-left {selected
          ? 'bg-primary/10 border-primary text-primary'
          : 'bg-surface-elevated/30 border-border-strong/50 text-content'}"
      >
        <Icon icon={option.icon} class="text-xl shrink-0 mt-0.5" />
        <div class="min-w-0 flex-1">
          <p class="text-body font-bold">{option.title}</p>
          <p class="text-caption opacity-80 mt-1 leading-relaxed">{option.detail}</p>
        </div>
        {#if selected}
          <Icon icon="ic:baseline-check-circle" class="text-xl shrink-0 mt-0.5" />
        {/if}
      </button>
    {/each}
  </div>
</div>
