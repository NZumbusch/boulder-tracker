<script lang="ts">
  /**
   * How the timer sounds: beeps on or off, which style, how loud (and
   * whether that moves the phone's media volume), and vibration.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import { CueSound, SOUND_PRESET_LABELS } from '../../lib/timer/cueSound';
  import { SOUND_PRESETS, type SoundPreset } from '../../lib/timer/timerCues';

  const isNative = Capacitor.isNativePlatform();
  const cues = $derived(trainingState.timerCues);

  // Previews play the page's own tones (the service plays the same table).
  const preview = new CueSound({ sound: () => true, vibrate: () => false, volume: () => trainingState.timerCues.volume });
  function play(preset: SoundPreset) {
    preview.unlock();
    preview.play('work', preset);
    setTimeout(() => preview.play('rest', preset), 700);
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Sound &amp; vibration</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The cues for go, rest, the 3-2-1 and the end.</p>
  </div>

  <div class="divide-y divide-border">
    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-volume-up" class="text-lg text-content-muted" />
        <span class="text-body text-content">Audible beep</span>
      </div>
      <input type="checkbox" checked={trainingState.timerBeepEnabled} onchange={(e) => trainingState.setTimerBeepEnabled(e.currentTarget.checked)} class="w-5 h-5 rounded accent-primary" />
    </label>

    {#if trainingState.timerBeepEnabled}
      <div class="py-3 space-y-2">
        <p class="text-label text-content-subtle">Sound</p>
        <div class="divide-y divide-border rounded-control border border-border overflow-hidden">
          {#each SOUND_PRESETS as preset (preset)}
            {@const selected = cues.sound === preset}
            <div class="flex items-center gap-2 pr-2 {selected ? 'bg-primary/5' : ''}">
              <button
                onclick={() => { trainingState.setTimerCues({ sound: preset }); play(preset); }}
                aria-pressed={selected}
                class="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left {selected ? 'text-primary' : 'text-content'}"
              >
                <Icon icon={selected ? 'ic:baseline-radio-button-checked' : 'ic:baseline-radio-button-unchecked'} class="text-xl shrink-0 {selected ? '' : 'text-content-subtle'}" />
                <span class="min-w-0">
                  <span class="block text-body font-bold">{SOUND_PRESET_LABELS[preset].label}</span>
                  <span class="block text-caption text-content-subtle">{SOUND_PRESET_LABELS[preset].hint}</span>
                </span>
              </button>
              <button onclick={() => play(preset)} class="shrink-0 p-2 text-content-subtle hover:text-primary transition-colors" aria-label="Play {SOUND_PRESET_LABELS[preset].label}">
                <Icon icon="ic:baseline-play-arrow" class="text-2xl" />
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="py-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-body text-content">Volume</span>
          <span class="text-label text-content-muted tabular-nums">{Math.round(cues.volume * 100)} %</span>
        </div>
        <RangeSlider value={Math.round(cues.volume * 100)} min={10} max={100} step={5} label="Cue volume" onchange={(v) => trainingState.setTimerCues({ volume: v / 100 })} />
        <p class="text-caption text-content-subtle">Also on the timer and circuit screens (the speaker icon at the top).</p>
      </div>

      {#if isNative}
        <label class="w-full flex items-center justify-between py-3 cursor-pointer gap-3">
          <div>
            <span class="block text-body text-content">Volume also sets the phone's media volume</span>
            <span class="block text-caption text-content-subtle">While a cue plays, the media volume goes to this level and is put back afterwards - louder over music, but it moves the volume your music uses</span>
          </div>
          <input type="checkbox" checked={cues.volumeSetsMedia} onchange={(e) => trainingState.setTimerCues({ volumeSetsMedia: e.currentTarget.checked })} class="w-5 h-5 rounded accent-primary shrink-0" />
        </label>
      {/if}
    {/if}

    <label class="w-full flex items-center justify-between py-3 cursor-pointer">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-vibration" class="text-lg text-content-muted" />
        <span class="text-body text-content">Vibrate with the cues</span>
      </div>
      <input type="checkbox" checked={trainingState.timerVibrateEnabled} onchange={(e) => trainingState.setTimerVibrateEnabled(e.currentTarget.checked)} class="w-5 h-5 rounded accent-primary" />
    </label>
  </div>
</div>
