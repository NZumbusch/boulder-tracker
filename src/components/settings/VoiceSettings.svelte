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
  import Toggle from '../ui/Toggle.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { speakText } from '../../lib/timer/speech';
  import { SPEECH_PAUSE } from '../../lib/timer/announcePlan';
  import { liveTimerAvailable, loadSpeechChoices, previewNativeSpeech, type SpeechChoices } from '../../lib/native/timerService';

  const cues = $derived(trainingState.timerCues);
  const a = $derived(cues.announce);
  const sp = $derived(cues.speech);
  const native = liveTimerAvailable();

  const LEADS = [0, 2, 3, 5, 10, 15, 20, 30];
  const DELAYS = [0, 1, 2, 3, 5, 10];
  const ENDS = [0, 5, 10, 15, 20, 30, 45, 60];
  const selectClass = 'field !w-auto max-w-[60%]';

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
    const text = `Rest. Next${SPEECH_PAUSE}Front lever progressions, 6 reps`;
    if (native) void previewNativeSpeech(text, $state.snapshot(sp), cues.volume, cues.volumeSetsMedia);
    else speakText(text, cues.volume, sp.rate, sp.pitch);
  }
  /** Speed and pitch are heard when the finger lifts (or a key is released). */
  function tryAfterRelease() {
    setTimeout(tryIt, 0);
  }
</script>

<div class="card space-y-4 animate-in fade-in">
  <div class="space-y-2">
    <h2 class="text-section uppercase text-content-muted px-1">Voice</h2>
    <p class="text-caption text-content-subtle px-1 leading-relaxed">The timer can say the exercises out loud during a circuit, also with the screen off.</p>
  </div>

  <div class="divide-y divide-border">
    <div class="flex items-center gap-3">
      <Icon icon="ic:baseline-record-voice-over" class="text-lg text-content-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <Toggle checked={a.enabled} onChange={(v) => trainingState.setTimerCues({ announce: { enabled: v } })} label="Speak the exercises" />
      </div>
    </div>

    {#if a.enabled}
      <div class="py-3 space-y-2">
        <p class="text-label text-content-subtle">When</p>
        <Segmented
          variant="setting"
          full
          label="When to speak"
          value={a.mode}
          onChange={(v) => trainingState.setTimerCues({ announce: { mode: v } })}
          options={[{ value: 'auto', label: 'Automatic' }, { value: 'custom', label: 'Custom' }]}
        />
        {#if a.mode === 'auto'}
          <p class="text-caption text-content-subtle leading-relaxed">
            The timer fits the announcements to each rest: it estimates how long the words take, says what's next (with the reps or time) early enough to finish before the set,
            shortens it on short rests, says it again near the end of a long rest, and keeps clear of the countdown beeps.
          </p>
        {/if}
      </div>
      {#if a.mode === 'custom'}
      <div class="py-3 space-y-3">
        <Toggle checked={a.work} onChange={(v) => trainingState.setTimerCues({ announce: { work: v } })} label="Name the exercise when a set starts" />
        {#if a.work}
          <label class="flex items-center justify-between gap-3 pl-3">
            <span class="text-label text-content-subtle">Name it</span>
            <select class={selectClass} value={a.workLead} onchange={(e) => trainingState.setTimerCues({ announce: { workLead: Number(e.currentTarget.value) } })}>
              {#each LEADS as s}<option value={s}>{s === 0 ? 'as it starts' : `${s} s before it starts`}</option>{/each}
            </select>
          </label>
        {/if}

        <Toggle checked={a.restStart} onChange={(v) => trainingState.setTimerCues({ announce: { restStart: v } })} label="Say what's next when a rest begins" />
        {#if a.restStart}
          <label class="flex items-center justify-between gap-3 pl-3">
            <span class="text-label text-content-subtle">Say what's next</span>
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
      {/if}

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
            <Toggle checked={allLanguages} onChange={(v) => (allLanguages = v)} label="Voices in all languages" />
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
          <div onpointerup={tryAfterRelease} onkeyup={tryAfterRelease} role="presentation">
            <RangeSlider value={Math.round(sp.rate * 20)} min={10} max={40} step={1} label="Speaking speed" onchange={(v) => trainingState.setTimerCues({ speech: { rate: v / 20 } })} />
          </div>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center justify-between gap-3">
            <span class="text-body text-content">Pitch</span>
            <span class="text-label text-content-muted tabular-nums">{sp.pitch.toFixed(2).replace(/0$/, '')}×</span>
          </div>
          <div onpointerup={tryAfterRelease} onkeyup={tryAfterRelease} role="presentation">
            <RangeSlider value={Math.round(sp.pitch * 20)} min={10} max={40} step={1} label="Voice pitch" onchange={(v) => trainingState.setTimerCues({ speech: { pitch: v / 20 } })} />
          </div>
        </div>

        <button type="button" onclick={tryIt} class="btn btn-secondary gap-1.5 text-primary">
          <Icon icon="ic:baseline-play-arrow" class="text-lg" /> Try it
        </button>
        <p class="text-caption text-content-subtle">Volume is set under Sound &amp; vibration.</p>
      </div>
    {/if}
  </div>
</div>
