<script lang="ts">
  /**
   * The shareable session card.
   *
   * Two rules the previous version broke, both of which showed up on long
   * sessions:
   *
   * 1. **Nothing is sized in magic pixels.** The body was capped at
   *    `max-h-[140px]`/`max-h-[150px]`, which is taller than the space
   *    actually left inside the square on a narrow phone - so the content
   *    ran past the card, and the "+N more" line (rendered *inside* the
   *    capped box) was itself clipped. The card is now header / body /
   *    footer with the body as the only flexible part, so it takes exactly
   *    the room that is left, whatever the title does.
   * 2. **The count is stated, not implied.** Rather than a "+N more" line
   *    that had to be kept in sync with however much was clipped, the
   *    footer carries the real exercise count and the list fades out. The
   *    card is a summary; it never claims to be the whole session.
   *
   * Everything inside the captured node uses literal hex/rgba rather than
   * theme tokens: html2canvas resolves computed styles, and the card must
   * render the same regardless of the user's theme - a light-theme user
   * sharing a washed-out card was not the intent.
   */
  import { formatWeight } from '../../lib/units';
  import type { ExerciseSlot, Workout } from '../../lib/types';
  import { formatDate } from '../../lib/dateUtils';
  import { showAlert } from '../../lib/utils';
  import { trainingState } from '../../lib/state.svelte';
  import { slotValues, slotTypeName } from '../../lib/exerciseSlot';
  import { sessionDuration } from '../../lib/planning/sessionDuration';
  import { formatMinutes } from '../../lib/session/formatSession';
  import {
    shareImage,
    copyImageToClipboard,
    canCopyImages,
    shareImageFileName,
  } from '../../lib/share/imageShare';
  import html2canvas from 'html2canvas';
  import Icon from '@iconify/svelte';

  let { workout, onClose } = $props<{ workout: Workout, onClose: () => void }>();

  let containerNode: HTMLElement | null = $state(null);
  let styleIndex = $state(0);
  let busy = $state<null | 'copy' | 'share'>(null);

  const styles = ['overview', 'detailed', 'stats'] as const;
  const activeStyle = $derived(styles[styleIndex]);

  const exercises = $derived<ExerciseSlot[]>(workout.exercises ?? []);
  const exerciseCount = $derived(exercises.length);
  const totalSets = $derived(exercises.reduce((acc, e) => acc + (slotValues(e).sets || 0), 0));
  const durationMinutes = $derived(sessionDuration(workout));
  const topExercise = $derived(
    exercises.length > 0
      ? [...exercises].sort((a, b) => (slotValues(b).plannedLoad || 0) - (slotValues(a).plannedLoad || 0))[0]
      : null,
  );

  const title = $derived(workout.notes || 'Training Session');

  /**
   * Shrinks the title instead of letting it wrap indefinitely. A long
   * session name at `text-3xl` ran to three or four lines and pushed the
   * body out of the card; sizing it down keeps the header bounded without
   * `line-clamp`, whose `-webkit-` implementation html2canvas renders
   * unreliably.
   */
  const titleClass = $derived(
    title.length > 40 ? 'text-lg' : title.length > 26 ? 'text-xl' : title.length > 16 ? 'text-2xl' : 'text-3xl',
  );

  function shortValue(slot: ExerciseSlot): string {
    const v = slotValues(slot);
    const base = v.sets && v.reps
      ? `${v.sets}x${v.reps}`
      : v.duration
        ? `${v.duration}m`
        : v.distance
          ? `${v.distance}km`
          : 'Done';
    const load = v.weight ? ` @ ${formatWeight(v.weight, trainingState.units.weight)}` : v.maxWeightPercent ? ` @ ${v.maxWeightPercent}%` : '';
    return base + load;
  }

  // --- Export ---

  /** Renders the card once, as both a Blob (web share/clipboard) and a data URL (native Filesystem). */
  async function render(): Promise<{ blob: Blob; dataUrl: string }> {
    const canvas = await html2canvas(containerNode!, {
      scale: 3,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to create image blob');
    return { blob, dataUrl: canvas.toDataURL('image/png') };
  }

  async function handleCopy() {
    if (!containerNode || busy) return;
    busy = 'copy';
    try {
      const { blob } = await render();
      const outcome = await copyImageToClipboard(blob);
      if (outcome === 'copied') {
        await showAlert('Copied', 'The card is on your clipboard.');
      } else if (outcome === 'unsupported') {
        await showAlert('Not available here', 'This device can\'t copy images to the clipboard. Use Share instead.');
      } else {
        await showAlert('Copy failed', 'The image could not be copied. Use Share instead.');
      }
    } catch (err) {
      console.error('Failed to generate share image:', err);
      await showAlert('Something went wrong', 'The card could not be generated.');
    } finally {
      busy = null;
    }
  }

  async function handleShare() {
    if (!containerNode || busy) return;
    busy = 'share';
    try {
      const { blob, dataUrl } = await render();
      const outcome = await shareImage({
        blob,
        dataUrl,
        fileName: shareImageFileName(workout.date),
        title: title,
        text: `${title} - ${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}, ${formatMinutes(durationMinutes)}`,
      });
      if (outcome === 'downloaded') {
        await showAlert('Saved', 'The card was saved to your downloads.');
      } else if (outcome === 'failed') {
        await showAlert('Share failed', 'The card could not be shared.');
      }
      // "shared" and "dismissed" both speak for themselves - no alert.
    } catch (err) {
      console.error('Failed to generate share image:', err);
      await showAlert('Something went wrong', 'The card could not be generated.');
    } finally {
      busy = null;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in overflow-y-auto no-scrollbar">
  <div class="flex flex-col items-center gap-5 w-full max-w-sm my-auto">

    <!-- Style Selector Gallery -->
    <div class="flex items-center gap-2 w-full overflow-x-auto no-scrollbar pb-1 snap-x">
      {#each styles as style, i}
        <button
          onclick={() => styleIndex = i}
          class="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all snap-center {styleIndex === i ? 'bg-primary text-white shadow-lg scale-105' : 'bg-surface-elevated text-content-subtle hover:text-content'}"
        >
          {style}
        </button>
      {/each}
    </div>

    <!-- The actual card to be exported. header / body / footer, with the
         body as the only flexible row - the square can never be overrun. -->
    <div
      bind:this={containerNode}
      class="w-full aspect-square rounded-[32px] p-7 flex flex-col relative overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.1)]"
      style="background: linear-gradient(to bottom right, #18181b, #000000);"
    >
      <!-- Background decoration. A radial gradient rather than a blurred
           circle: html2canvas doesn't implement CSS `filter`, so
           `blur-[60px]` rendered as a hard-edged blue disc in the exported
           PNG while looking like a soft glow in the preview. This draws the
           same glow in both. -->
      <div
        class="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
        style="background: radial-gradient(circle, rgba(37,99,235,0.38) 0%, rgba(37,99,235,0.12) 45%, rgba(37,99,235,0) 72%);"
      ></div>

      <!-- Header -->
      <div class="relative z-10 shrink-0">
        <div class="flex items-center gap-2 mb-1.5">
          <div class="w-2 h-2 bg-[#2563eb] rounded-full"></div>
          <span class="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.2em]">{formatDate(workout.date)}</span>
        </div>
        <h2 class="{titleClass} font-black text-white tracking-tighter leading-tight break-words">{title}</h2>
      </div>

      <!-- Body: takes exactly what is left between header and footer -->
      <div class="relative z-10 flex-1 min-h-0 overflow-hidden my-4">
        {#if activeStyle === 'overview'}
          <div class="flex flex-wrap gap-2 content-start">
            {#each exercises as exercise}
              <div class="text-[10px] px-3 py-1.5 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white font-bold shrink-0">
                {slotTypeName(exercise, trainingState.exerciseTypes)}
              </div>
            {/each}
          </div>

        {:else if activeStyle === 'detailed'}
          <div class="space-y-2.5">
            {#each exercises as exercise}
              <div class="flex justify-between items-center gap-2 border-b border-[rgba(255,255,255,0.1)] pb-2.5">
                <div class="text-xs font-bold text-[rgba(255,255,255,0.9)] truncate">{slotTypeName(exercise, trainingState.exerciseTypes)}</div>
                <div class="text-[10px] font-mono font-bold text-[rgba(255,255,255,0.7)] bg-[rgba(255,255,255,0.05)] px-2 py-1 rounded-md shrink-0">
                  {shortValue(exercise)}
                </div>
              </div>
            {/each}
          </div>

        {:else if activeStyle === 'stats'}
          <div class="h-full flex flex-col justify-center gap-3">
            <div class="flex gap-3">
              <div class="flex-1 min-w-0 bg-[rgba(255,255,255,0.05)] p-3.5 rounded-2xl border border-[rgba(255,255,255,0.1)]">
                <p class="text-[8px] font-black uppercase tracking-widest text-[#3b82f6] mb-1">Top Focus</p>
                <p class="text-sm font-bold text-white tracking-tight leading-tight truncate">{topExercise ? slotTypeName(topExercise, trainingState.exerciseTypes) : 'Resting'}</p>
              </div>
              <div class="flex-1 min-w-0 bg-[rgba(255,255,255,0.05)] p-3.5 rounded-2xl border border-[rgba(255,255,255,0.1)]">
                <p class="text-[8px] font-black uppercase tracking-widest text-[#3b82f6] mb-1">Volume</p>
                <p class="text-2xl font-black text-white tracking-tighter leading-none">{totalSets} <span class="text-[10px] font-bold uppercase tracking-widest text-[rgba(255,255,255,0.5)]">Sets</span></p>
              </div>
            </div>
            <div class="bg-[rgba(255,255,255,0.05)] p-3.5 rounded-2xl border border-[rgba(255,255,255,0.1)]">
              <p class="text-[8px] font-black uppercase tracking-widest text-[#3b82f6] mb-1">Time</p>
              <p class="text-2xl font-black text-white tracking-tighter leading-none">{formatMinutes(durationMinutes)}</p>
            </div>
          </div>
        {/if}

        <!-- A long list fades rather than being cut mid-row. The footer
             states the real total, so a faded card understates nothing. -->
        {#if activeStyle !== 'stats'}
          <div
            class="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
            style="background: linear-gradient(to bottom, rgba(6,6,7,0), #060607);"
          ></div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="relative z-10 shrink-0 flex justify-between items-end border-t border-[rgba(255,255,255,0.1)] pt-4">
        <div class="flex items-end gap-5">
          <div>
            <p class="text-3xl font-black text-white tracking-tighter leading-none">{Math.round(workout.loadFactor || 0)}</p>
            <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1.5">Total Load</p>
          </div>
          <div>
            <p class="text-3xl font-black text-white tracking-tighter leading-none">{exerciseCount}</p>
            <p class="text-[8px] font-black uppercase text-[#71717a] tracking-[0.2em] mt-1.5">Exercises</p>
          </div>
        </div>

        <div class="text-right">
          <p class="text-[10px] font-black text-[rgba(255,255,255,0.3)] tracking-widest uppercase">Boulder Tracker</p>
        </div>
      </div>
    </div>

    <!-- Controls. Share is primary: it is the one that works everywhere,
         and on a phone the native sheet is the route to Instagram,
         WhatsApp and the rest. Copy only appears where it can succeed. -->
    <div class="flex gap-2.5 w-full">
      <button
        onclick={onClose}
        disabled={busy !== null}
        class="shrink-0 px-5 py-4 bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors border border-border"
      >
        Close
      </button>
      {#if canCopyImages()}
        <button
          onclick={handleCopy}
          disabled={busy !== null}
          class="shrink-0 px-5 py-4 bg-surface hover:bg-surface-elevated disabled:opacity-50 text-content rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors border border-border flex items-center justify-center gap-2"
        >
          <Icon icon="ic:baseline-content-copy" class="text-sm" />
          {busy === 'copy' ? '...' : 'Copy'}
        </button>
      {/if}
      <button
        onclick={handleShare}
        disabled={busy !== null}
        class="flex-1 min-w-0 py-4 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        <Icon icon="ic:baseline-ios-share" class="text-sm" />
        {busy === 'share' ? 'Preparing...' : 'Share'}
      </button>
    </div>
  </div>
</div>
