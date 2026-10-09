<script lang="ts">
  /**
   * How much the timer interrupts: one dial from silent to everything
   * (a shortcut over the switches in the cards below, which stay as they
   * are), and what happens to a podcast or audiobook playing meanwhile.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
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
    <h3 class="text-section uppercase text-content-muted px-1">How much it speaks up</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">From nothing to every cue. Takes effect straight away, also in a running session. The switches below fine-tune it.</p>
  </div>

  <div class="space-y-2">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-body font-bold text-content">{level === 'custom' ? 'Custom' : AUDIO_LEVEL_LABELS[level].label}</span>
      <span class="text-caption text-content-subtle">{level === 'custom' ? 'Set by the switches below' : ''}</span>
    </div>
    <div class={level === 'custom' ? 'opacity-50' : ''}>
      <RangeSlider value={level === 'custom' ? 3 : AUDIO_LEVELS.indexOf(level)} min={0} max={3} step={1} label="How much the timer speaks up" onchange={choose} />
    </div>
    <div class="flex justify-between px-1 text-caption text-content-subtle">
      {#each AUDIO_LEVELS as l (l)}<span>{AUDIO_LEVEL_LABELS[l].label}</span>{/each}
    </div>
    {#if level !== 'custom'}
      <p class="text-caption text-content-subtle px-1">{AUDIO_LEVEL_LABELS[level].hint}</p>
    {/if}
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
