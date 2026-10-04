<script lang="ts">
  /**
   * How loud the timer's cues are, and what the timer says aloud: the
   * exercise when a set starts (optionally ahead of it), what is next when a
   * rest begins and, for the long rests, again before it ends - so a routine
   * can be followed with the phone down or the screen off.
   */
  import Icon from '@iconify/svelte';
  import { Capacitor } from '@capacitor/core';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import { speakText } from '../../lib/timer/speech';

  const isNative = Capacitor.isNativePlatform();
  const cues = $derived(trainingState.timerCues);
  const a = $derived(cues.announce);

  const LEADS = [0, 2, 3, 5, 10, 15, 20, 30];
  const DELAYS = [0, 1, 2, 3, 5, 10];
  const ENDS = [0, 5, 10, 15, 20, 30, 45, 60];
  const label = (s: number, zero: string) => (s === 0 ? zero : `${s} s`);
  const selectClass = 'bg-surface-elevated text-content rounded-control border border-border-strong text-label px-2 py-1.5 outline-none';
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Cues &amp; announcements</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">How loud the beeps are, and what the timer says out loud during a circuit.</p>
  </div>

  <div class="divide-y divide-border">
    <div class="py-3 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <span class="flex items-center gap-3">
          <Icon icon="ic:baseline-volume-up" class="text-lg text-content-muted" />
          <span class="text-body text-content">Cue volume</span>
        </span>
        <span class="text-label text-content-muted tabular-nums">{Math.round(cues.volume * 100)} %</span>
      </div>
      <RangeSlider value={Math.round(cues.volume * 100)} min={10} max={100} step={5} label="Cue volume" onchange={(v) => trainingState.setTimerCues({ volume: v / 100 })} />
    </div>

    {#if isNative}
      <label class="w-full flex items-center justify-between py-3 cursor-pointer gap-3">
        <div>
          <span class="block text-body text-content">Also set the phone's media volume</span>
          <span class="block text-caption text-content-subtle">While a cue plays, the media volume goes to this level and is put back afterwards - louder over music, but it moves the volume your music uses</span>
        </div>
        <input type="checkbox" checked={cues.volumeSetsMedia} onchange={(e) => trainingState.setTimerCues({ volumeSetsMedia: e.currentTarget.checked })} class="w-5 h-5 rounded accent-primary shrink-0" />
      </label>
    {/if}

    <label class="w-full flex items-center justify-between py-3 cursor-pointer gap-3">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-record-voice-over" class="text-lg text-content-muted shrink-0" />
        <div>
          <span class="block text-body text-content">Speak the exercises</span>
          <span class="block text-caption text-content-subtle">Circuits: says which exercise is on or next, also with the screen off</span>
        </div>
      </div>
      <input type="checkbox" checked={a.enabled} onchange={(e) => trainingState.setTimerCues({ announce: { enabled: e.currentTarget.checked } })} class="w-5 h-5 rounded accent-primary shrink-0" />
    </label>

    {#if a.enabled}
      <div class="py-3 space-y-3">
        <label class="flex items-center justify-between gap-3 cursor-pointer">
          <span class="text-body text-content">Name the exercise when a set starts</span>
          <input type="checkbox" checked={a.work} onchange={(e) => trainingState.setTimerCues({ announce: { work: e.currentTarget.checked } })} class="w-5 h-5 rounded accent-primary shrink-0" />
        </label>
        {#if a.work}
          <label class="flex items-center justify-between gap-3 pl-3">
            <span class="text-label text-content-subtle">Say it</span>
            <select class={selectClass} value={a.workLead} onchange={(e) => trainingState.setTimerCues({ announce: { workLead: Number(e.currentTarget.value) } })}>
              {#each LEADS as s}<option value={s}>{s === 0 ? 'as it starts' : `${s} s before it starts`}</option>{/each}
            </select>
          </label>
        {/if}

        <label class="flex items-center justify-between gap-3 cursor-pointer">
          <span class="text-body text-content">Say what's next when a rest begins</span>
          <input type="checkbox" checked={a.restStart} onchange={(e) => trainingState.setTimerCues({ announce: { restStart: e.currentTarget.checked } })} class="w-5 h-5 rounded accent-primary shrink-0" />
        </label>
        {#if a.restStart}
          <label class="flex items-center justify-between gap-3 pl-3">
            <span class="text-label text-content-subtle">Say it</span>
            <select class={selectClass} value={a.restStartDelay} onchange={(e) => trainingState.setTimerCues({ announce: { restStartDelay: Number(e.currentTarget.value) } })}>
              {#each DELAYS as s}<option value={s}>{s === 0 ? 'as the rest begins' : `${s} s after it begins`}</option>{/each}
            </select>
          </label>
        {/if}

        <label class="flex items-center justify-between gap-3">
          <span>
            <span class="block text-body text-content">Say it again before a rest ends</span>
            <span class="block text-caption text-content-subtle">For the long rests; skipped when the rest is too short for it</span>
          </span>
          <select class={selectClass} value={a.restEnd} onchange={(e) => trainingState.setTimerCues({ announce: { restEnd: Number(e.currentTarget.value) } })}>
            {#each ENDS as s}<option value={s}>{s === 0 ? 'Off' : `${s} s before`}</option>{/each}
          </select>
        </label>

        <button onclick={() => speakText('Rest. Next: Front lever progressions', cues.volume)} class="text-label font-bold text-primary hover:text-primary-hover transition-colors">
          Try it
        </button>
      </div>
    {/if}
  </div>
</div>
