<script lang="ts">
  /**
   * A 1-10 style slider that never brings up the keyboard.
   *
   * The native `<input type="range">` does, on Android: touching it gives
   * it (or the number field above it) focus, the WebView treats that as a
   * text field and the numeric keyboard slides up - after every single
   * slider in the post-session sheet. This is a plain element with pointer
   * handling: it takes no text focus, and a touch on it first closes a
   * keyboard some other field left open.
   *
   * Horizontal drags move the value; vertical ones still scroll the page
   * (`touch-action: pan-y`). Arrow keys work for keyboard users.
   */
  let {
    value = $bindable(),
    min = 1,
    max = 10,
    step = 1,
    id,
    label,
    tone = 'primary',
    onchange,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    id?: string;
    /** Accessible name, when no `<label for>` points at `id`. */
    label?: string;
    tone?: 'primary' | 'success' | 'warning' | 'danger';
    onchange?: (value: number) => void;
  } = $props();

  let track: HTMLDivElement | undefined = $state();
  let dragging = $state(false);

  const clampValue = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  };
  const fraction = $derived(max > min ? (clampValue(value ?? min) - min) / (max - min) : 0);

  function set(next: number) {
    const v = clampValue(next);
    if (v === value) return;
    value = v;
    onchange?.(v);
  }

  function valueAt(clientX: number): number {
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const f = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return min + Math.min(1, Math.max(0, f)) * (max - min);
  }

  function blurTextField() {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.blur();
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    blurTextField();
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    set(valueAt(e.clientX));
  }
  function onpointermove(e: PointerEvent) {
    if (dragging) set(valueAt(e.clientX));
  }
  function stop() {
    dragging = false;
  }

  function onkeydown(e: KeyboardEvent) {
    const big = Math.max(step, (max - min) / 10);
    const moves: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big };
    if (e.key in moves) set(value + moves[e.key]);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else return;
    e.preventDefault();
  }

  const FILL: Record<string, string> = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };
  const RING: Record<string, string> = { primary: 'border-primary', success: 'border-success', warning: 'border-warning', danger: 'border-danger' };
</script>

<div
  {id}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  class="relative h-8 w-full cursor-pointer select-none outline-none group"
  style="touch-action: pan-y; -webkit-tap-highlight-color: transparent;"
  {onpointerdown}
  {onpointermove}
  onpointerup={stop}
  onpointercancel={stop}
  onlostpointercapture={stop}
  {onkeydown}
>
  <!-- Inset by half a thumb, so the thumb stays inside at either end. -->
  <div bind:this={track} class="absolute inset-y-0 inset-x-3">
    <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-control bg-surface-elevated overflow-hidden">
      <div class="h-full {FILL[tone]}" style="width: {fraction * 100}%"></div>
    </div>
    <div
      class="absolute top-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface border-4 {RING[tone]} shadow-card transition-transform group-focus-visible:ring-2 group-focus-visible:ring-primary/50 {dragging ? 'scale-110' : ''}"
      style="left: {fraction * 100}%"
    ></div>
  </div>
</div>
