<script lang="ts">
  /**
   * What the timer says aloud (circuits): which exercise, and when - on a
   * set's start (optionally ahead of it), when a rest begins and, for the
   * long rests, again before it ends - so a routine can be followed with the
   * phone down or the screen off. And how it sounds: the phone's own
   * text-to-speech engine and voice, speed and pitch.
   */
  import Icon from '@iconify/svelte';
  import { trainingState } from '../../lib/state.svelte';
  import RangeSlider from '../common/RangeSlider.svelte';
  import { speakText } from '../../lib/timer/speech';
  import { liveTimerAvailable, loadSpeechChoices, previewNativeSpeech, type SpeechChoices } from '../../lib/native/timerService';

  const cues = $derived(trainingState.timerCues);
  const a = $derived(cues.announce);
  const sp = $derived(cues.speech);
  const native = liveTimerAvailable();

  const LEADS = [0, 2, 3, 5, 10, 15, 20, 30];
  const DELAYS = [0, 1, 2, 3, 5, 10];
  const ENDS = [0, 5, 10, 15, 20, 30, 45, 60];
  const selectClass = 'bg-surface-elevated text-content rounded-control border border-border-strong text-label px-2 py-1.5 outline-none max-w-[60%]';

  // The phone's engines and the chosen engine's voices (Android only).
  let choices = $state<SpeechChoices | null>(null);
  let loading = $state(false);
  async function load(engine: string | null) {
    if (!native) return;
    loading = true;
    choices = await loadSpeechChoices(engine);
    loading = false;
  }
  $effect(() => {
    if (!a.enabled) return;
    void load(sp.engine);
  });

  // Hundreds of voices come with an engine: show the phone's language by default.
  const language = (typeof navigator !== 'undefined' ? navigator.language : 'en').split('-')[0].toLowerCase();
  let allLanguages = $state(false);
  const shownVoices = $derived(
    (choices?.voices ?? []).filter((v) => allLanguages || v.locale.split('-')[0].toLowerCase() === language || v.name === sp.voice),
  );

  /** "en-GB · en-gb-x-gba-local" - the locale first, so a long list reads in groups. */
  const voiceLabel = (v: { name: string; locale: string; network: boolean }) => `${v.locale} · ${v.name}${v.network ? ' (online)' : ''}`;

  function tryIt() {
    const text = 'Rest. Next: Front lever progressions';
    if (native) void previewNativeSpeech(text, $state.snapshot(sp), cues.volume, cues.volumeSetsMedia);
    else speakText(text, cues.volume, sp.rate, sp.pitch);
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h3 class="text-section uppercase text-content-muted px-1">Voice</h3>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The timer can say the exercises out loud during a circuit - also with the screen off.</p>
  </div>

  <div class="divide-y divide-border">
    <label class="w-full flex items-center justify-between py-3 cursor-pointer gap-3">
      <div class="flex items-center gap-3">
        <Icon icon="ic:baseline-record-voice-over" class="text-lg text-content-muted shrink-0" />
        <span class="text-body text-content">Speak the exercises</span>
      </div>
      <input type="checkbox" checked={a.enabled} onchange={(e) => trainingState.setTimerCues({ announce: { enabled: e.currentTarget.checked } })} class="w-5 h-5 rounded accent-primary shrink-0" />
    </label>

    {#if a.enabled}
      <div class="py-3 space-y-3">
        <p class="text-label text-content-subtle">When</p>
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
            <span class="block text-caption text-content-subtle">For the long rests; skipped when the rest is too short</span>
          </span>
          <select class={selectClass} value={a.restEnd} onchange={(e) => trainingState.setTimerCues({ announce: { restEnd: Number(e.currentTarget.value) } })}>
            {#each ENDS as s}<option value={s}>{s === 0 ? 'Off' : `${s} s before`}</option>{/each}
          </select>
        </label>
      </div>

      <div class="py-3 space-y-3">
        <p class="text-label text-content-subtle">How it sounds</p>
        {#if native}
          <label class="flex items-center justify-between gap-3">
            <span class="text-body text-content">Speech engine</span>
            <select class={selectClass} value={sp.engine ?? ''} disabled={!choices} onchange={(e) => trainingState.setTimerCues({ speech: { engine: e.currentTarget.value || null, voice: null } })}>
              <option value="">Phone default</option>
              {#each choices?.engines ?? [] as engine (engine.name)}<option value={engine.name}>{engine.label}</option>{/each}
            </select>
          </label>
          <label class="flex items-center justify-between gap-3">
            <span class="text-body text-content">Voice</span>
            <select class={selectClass} value={sp.voice ?? ''} disabled={!choices} onchange={(e) => trainingState.setTimerCues({ speech: { voice: e.currentTarget.value || null } })}>
              <option value="">{loading ? 'Loading…' : 'Engine default'}</option>
              {#each shownVoices as voice (voice.name)}<option value={voice.name}>{voiceLabel(voice)}</option>{/each}
            </select>
          </label>
          {#if choices && choices.voices.length > shownVoices.length || allLanguages}
            <label class="flex items-center justify-between gap-3 cursor-pointer">
              <span class="text-label text-content-subtle">Voices in all languages</span>
              <input type="checkbox" bind:checked={allLanguages} class="w-5 h-5 rounded accent-primary shrink-0" />
            </label>
          {/if}
          {#if !loading && !choices}
            <p class="text-caption text-content-subtle">Couldn't read the phone's speech engines - the default voice is used.</p>
          {/if}
        {/if}

        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-body text-content">Speed</span>
            <span class="text-label text-content-muted tabular-nums">{sp.rate.toFixed(2).replace(/0$/, '')}×</span>
          </div>
          <RangeSlider value={Math.round(sp.rate * 20)} min={10} max={40} step={1} label="Speaking speed" onchange={(v) => trainingState.setTimerCues({ speech: { rate: v / 20 } })} />
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-body text-content">Pitch</span>
            <span class="text-label text-content-muted tabular-nums">{sp.pitch.toFixed(2).replace(/0$/, '')}×</span>
          </div>
          <RangeSlider value={Math.round(sp.pitch * 20)} min={10} max={40} step={1} label="Voice pitch" onchange={(v) => trainingState.setTimerCues({ speech: { pitch: v / 20 } })} />
        </div>

        <button onclick={tryIt} class="flex items-center gap-1.5 text-label font-bold text-primary hover:text-primary-hover transition-colors">
          <Icon icon="ic:baseline-play-arrow" class="text-lg" /> Try it
        </button>
        <p class="text-caption text-content-subtle">Volume is the one under Sound &amp; vibration.</p>
      </div>
    {/if}
  </div>
</div>
