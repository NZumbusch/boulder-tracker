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

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Sessions</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      When you add an exercise part-way through a running session, what should it count as?
    </p>
  </div>

  <div class="divide-y divide-border">
    {#each OPTIONS as option}
      {@const selected = trainingState.addedExerciseTarget === option.value}
      <button
        onclick={() => trainingState.setAddedExerciseTarget(option.value)}
        aria-pressed={selected}
        class="w-full flex items-start justify-between gap-3 py-3 text-left transition-colors {selected ? 'text-primary' : 'text-content'}"
      >
        <Icon icon={option.icon} class="text-xl shrink-0 mt-0.5" />
        <div class="min-w-0 flex-1">
          <p class="text-body font-bold">{option.title}</p>
          <p class="text-caption text-content-subtle mt-0.5 leading-relaxed">{option.detail}</p>
        </div>
        <Icon icon={selected ? 'ic:baseline-radio-button-checked' : 'ic:baseline-radio-button-unchecked'} class="text-xl shrink-0 mt-0.5 {selected ? '' : 'text-content-subtle'}" />
      </button>
    {/each}
  </div>
</div>
