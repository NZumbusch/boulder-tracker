<script lang="ts">
  /**
   * How the timer sounds: beeps on or off, which style, how loud (and
   * whether that moves the phone's media volume), and vibration.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import { rovingRadios } from './rovingRadios';
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
  /** A moved volume is heard when the finger lifts (or a key is released), not on every step of the drag. */
  function playAfterVolume() {
    setTimeout(() => play(cues.sound), 0);
  }
</script>

<div class="card space-y-2 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Sound &amp; vibration</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The cues for go, rest, the 3-2-1 and the end.</p>
  </div>

  <div class="divide-y divide-border">
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-volume-up" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={trainingState.timerBeepEnabled} onChange={(v) => trainingState.setTimerBeepEnabled(v)} label="Audible beep" />
      </div>
    </div>

    {#if trainingState.timerBeepEnabled}
      <div class="py-3 space-y-2">
        <p id="beep-sound-label" class="text-label text-content-subtle">Beep style</p>
        <div class="divide-y divide-border rounded-control border border-border overflow-hidden" role="radiogroup" aria-labelledby="beep-sound-label" use:rovingRadios>
          {#each SOUND_PRESETS as preset (preset)}
            {@const selected = cues.sound === preset}
            <div class="flex items-center gap-1 pr-1 {selected ? 'bg-primary/5' : ''}">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                tabindex={selected ? 0 : -1}
                onclick={() => { trainingState.setTimerCues({ sound: preset }); play(preset); }}
                class="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-11 text-left {selected ? 'text-primary' : 'text-content'}"
              >
                <Icon icon={selected ? 'ic:baseline-radio-button-checked' : 'ic:baseline-radio-button-unchecked'} class="text-xl shrink-0 {selected ? '' : 'text-content-subtle'}" />
                <span class="min-w-0">
                  <span class="block text-body font-bold">{SOUND_PRESET_LABELS[preset].label}</span>
                  <span class="block text-caption text-content-subtle">{SOUND_PRESET_LABELS[preset].hint}</span>
                </span>
              </button>
              <button type="button" onclick={() => play(preset)} class="btn-icon shrink-0" aria-label="Play {SOUND_PRESET_LABELS[preset].label}">
                <Icon icon="ic:baseline-play-arrow" class="text-2xl" />
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="py-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-body text-content">Volume</span>
          <span class="text-label text-content-muted tabular-nums">{Math.round(cues.volume * 100)}%</span>
        </div>
        <div onpointerup={playAfterVolume} onkeyup={playAfterVolume} role="presentation">
          <RangeSlider value={Math.round(cues.volume * 100)} min={0} max={100} step={5} label="Cue volume" unit="%" onchange={(v) => trainingState.setTimerCues({ volume: v / 100 })} />
        </div>
        <p class="text-caption text-content-subtle">0% is muted. You hear a beep when you let go. The same volume is used on the timer and circuit screens (the speaker icon at the top mutes and unmutes).</p>
      </div>

      {#if isNative}
        <Toggle
          checked={cues.volumeSetsMedia}
          onChange={(v) => trainingState.setTimerCues({ volumeSetsMedia: v })}
          label="Volume also sets the phone's media volume"
          hint="While a cue plays, the media volume goes to this level and is put back afterwards. Louder over music, but it moves the volume your music uses"
        />
      {/if}
    {/if}

    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-vibration" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={trainingState.timerVibrateEnabled} onChange={(v) => trainingState.setTimerVibrateEnabled(v)} label="Vibrate with the timer cues" />
      </div>
    </div>
  </div>
</div>
