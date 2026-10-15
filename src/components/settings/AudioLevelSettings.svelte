<script lang="ts">
  /**
   * How much the timer interrupts: one dial from silent to everything
   * (a shortcut over the switches in the cards below, which stay as they
   * are), and what happens to a podcast or audiobook playing meanwhile.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import { AUDIO_LEVELS, AUDIO_LEVEL_LABELS, audioStateOf, levelOf, settingsFor } from '../../lib/timer/audioLevel';
  import Segmented from '../ui/Segmented.svelte';

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
    <p class="text-caption text-content-subtle px-1 leading-relaxed">From nothing to every cue. This sets the beep, 3-2-1, 15 s warning and voice switches further down the page, and takes effect straight away, also in a running session. You can still fine-tune each of them.</p>
  </div>

  <div class="space-y-2">
    <Segmented
      variant="setting"
      full
      label="How much the timer speaks up"
      value={level}
      onChange={(l) => choose(AUDIO_LEVELS.indexOf(l as (typeof AUDIO_LEVELS)[number]))}
      options={AUDIO_LEVELS.map((l) => ({ value: l, label: AUDIO_LEVEL_LABELS[l].label }))}
    />
    <p class="text-caption text-content-subtle px-1 leading-relaxed">{level === 'custom' ? 'Custom: set by the switches below.' : AUDIO_LEVEL_LABELS[level].hint}</p>
  </div>

  {#if isNative}
    <div class="pt-3 border-t border-border space-y-2">
      <p class="text-body text-content flex items-center gap-3"><Icon icon="ic:baseline-headphones" class="text-lg text-content-muted" /> Podcast or audiobook playing</p>
      <Segmented
        variant="setting"
        full
        label="Podcast or audiobook playing"
        value={cues.otherAudio}
        onChange={(v) => trainingState.setTimerCues({ otherAudio: v })}
        options={[{ value: 'lower', label: 'Make it quieter' }, { value: 'mix', label: 'Play over it' }]}
      />
      <p class="text-caption text-content-subtle px-1 leading-relaxed">
        {#if cues.otherAudio === 'lower'}
          Your player is asked to lower its volume for each cue and come back. Some players pause instead of lowering. If yours does, try "Play over it".
        {:else}
          The cue plays on top at full strength and your player is never asked to do anything, so it can't stop. It won't get quieter either.
        {/if}
      </p>
    </div>
  {/if}
</div>
