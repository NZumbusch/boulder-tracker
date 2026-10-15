<script lang="ts">
  /**
   * How much the timer interrupts: one dial from silent to everything
   * (a shortcut over the switches in the cards below, which stay as they
   * are), and what happens to a podcast or audiobook playing meanwhile.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { AUDIO_LEVELS, AUDIO_LEVEL_LABELS, audioStateOf, levelOf, settingsFor, type AudioLevel } from '../../lib/timer/audioLevel';

  const isNative = Capacitor.isNativePlatform();
  const cues = $derived(trainingState.timerCues);
  const current = $derived(audioStateOf(trainingState.timerBeepEnabled, trainingState.timerCountdownTicks, trainingState.timerWarnBeforeEnd, cues));
  const level = $derived(levelOf(current));

  function choose(index: number) {
    const next = settingsFor(AUDIO_LEVELS[index], current);
    trainingState.setTimerBeepEnabled(next.beep);
    trainingState.setTimerCountdownTicks(next.ticks);
    trainingState.setTimerWarnBeforeEnd(next.warn);
    trainingState.setTimerCues({ announce: { enabled: next.announce } });
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">How much it speaks up</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">From nothing to every cue. Takes effect straight away, also in a running session. The switches below fine-tune it.</p>
  </div>

  <div class="space-y-2">
    <!-- Four named levels in a row: each one a plain tap, always lined up with its name. -->
    <div class="flex bg-surface-elevated/50 p-1 rounded-control" role="group" aria-label="How much the timer speaks up">
      {#each AUDIO_LEVELS as l, i (l)}
        <button
          onclick={() => choose(i)}
          aria-pressed={level === l}
          class="flex-1 py-2 text-label rounded-control transition-all {level === l ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
        >{AUDIO_LEVEL_LABELS[l].label}</button>
      {/each}
    </div>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">{level === 'custom' ? 'Custom: set by the switches below.' : AUDIO_LEVEL_LABELS[level].hint}</p>
  </div>

  {#if isNative}
    <div class="pt-3 border-t border-border space-y-2">
      <p class="text-body text-content flex items-center gap-3"><Icon icon="ic:baseline-headphones" class="text-lg text-content-muted" /> Podcast or audiobook playing</p>
      <div class="flex bg-surface-elevated/50 p-1 rounded-control">
        <button
          onclick={() => trainingState.setTimerCues({ otherAudio: 'lower' })}
          aria-pressed={cues.otherAudio === 'lower'}
          class="flex-1 py-2 text-label rounded-control transition-all {cues.otherAudio === 'lower' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
        >Make it quieter</button>
        <button
          onclick={() => trainingState.setTimerCues({ otherAudio: 'mix' })}
          aria-pressed={cues.otherAudio === 'mix'}
          class="flex-1 py-2 text-label rounded-control transition-all {cues.otherAudio === 'mix' ? 'bg-primary text-white shadow-md' : 'text-content-muted hover:text-content'}"
        >Play over it</button>
      </div>
      <p class="text-caption text-content-subtle px-1 leading-relaxed">
        {#if cues.otherAudio === 'lower'}
          Your player is asked to lower its volume for each cue and come back. Some players pause instead of lowering - if yours does, try "Play over it".
        {:else}
          The cue plays on top at full strength and your player is never asked to do anything, so it can't stop. It won't get quieter either.
        {/if}
      </p>
    </div>
  {/if}
</div>
