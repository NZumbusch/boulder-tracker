<script lang="ts">
  /**
   * How live sessions behave: what the screen and the notification do while
   * one runs, haptics, and what an exercise added mid-session counts as.
   *
   * Both options are real and neither is a compromise, which is why this
   * is a preference rather than a decision made for the user - the honest
   * answer depends on whether the user treats the plan as a contract (an
   * unplanned extra is extra, and adherence should say so) or as a rough
   * intent (what was done *is* the session).
   */
  import { trainingState } from '../../lib/state.svelte';
  import type { AddedExerciseTarget } from '../../lib/preferences/migrate';
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import Toggle from '../ui/Toggle.svelte';
  import { rovingRadios } from './rovingRadios';

  const isNative = Capacitor.isNativePlatform();
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

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
    <h2 class="text-section uppercase text-content-muted px-1" id="added-exercise-heading">Exercises added mid-session</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">
      When you add an exercise part-way through a running session, what should it count as?
    </p>
  </div>

  <div class="divide-y divide-border" role="radiogroup" aria-labelledby="added-exercise-heading" use:rovingRadios>
    {#each OPTIONS as option}
      {@const selected = trainingState.addedExerciseTarget === option.value}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        tabindex={selected ? 0 : -1}
        onclick={() => trainingState.setAddedExerciseTarget(option.value)}
        class="w-full flex items-start justify-between gap-3 py-3 min-h-11 text-left transition-colors {selected ? 'text-primary' : 'text-content'}"
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

<div class="card space-y-2 animate-in fade-in">
  <h2 class="text-section uppercase text-content-muted px-1">Screen, notification and haptics</h2>

  <div class="divide-y divide-border">
    {#if wakeLockSupported}
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-lightbulb" class="text-lg text-content-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <Toggle
            checked={trainingState.sessionKeepAwake}
            onChange={(v) => trainingState.setSessionKeepAwake(v)}
            label="Keep the screen on during a session"
            hint="The whole time a session runs (not while paused)"
          />
        </div>
      </div>
    {/if}
    {#if isNative}
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-directions-run" class="text-lg text-content-muted shrink-0" />
        <div class="flex-1 min-w-0">
          <Toggle
            checked={trainingState.sessionNotification}
            onChange={(v) => trainingState.setSessionNotification(v)}
            label="Session notification"
            hint="Its clock, the current exercise and how far you are, with Pause and Resume"
          />
        </div>
      </div>
    {/if}
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-touch-app" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle
          checked={trainingState.hapticsEnabled}
          onChange={(v) => trainingState.setHapticsEnabled(v)}
          label="Haptic feedback"
          hint="A short buzz when an exercise or session is done, and on swipes and long-presses"
        />
      </div>
    </div>
  </div>
</div>
