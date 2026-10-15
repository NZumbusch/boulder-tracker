import { onDestroy } from 'svelte';
/**
 * One short message at the bottom of the screen, with an optional action -
 * mostly "Undo" after a delete, so deleting doesn't have to ask first.
 * A new toast replaces the current one, except that a plain message never
 * pushes out one that carries an action (an Undo is the only way back, so it
 * waits its turn instead). The timer stops while a finger or the pointer is on
 * the toast. `Toast.svelte` renders it.
 */
/** How long a message stays: an Undo needs time to be found and tapped. */
export const TOAST_MS = 4000;
export const TOAST_UNDO_MS = 8000;

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Toast {
  id: number;
  text: string;
  action?: ToastAction;
}

class ToastStore {
  current = $state<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;
  private duration = TOAST_MS;
  private deadline = 0;
  private remaining = 0;
  private waiting: { text: string; opts: { action?: ToastAction; durationMs?: number }; id: number }[] = [];

  show(text: string, opts: { action?: ToastAction; durationMs?: number } = {}): number {
    const id = this.nextId++;
    // A plain message waits behind a toast that carries an action.
    if (this.current?.action && !opts.action) {
      this.waiting.push({ text, opts, id });
      return id;
    }
    this.display(id, text, opts);
    return id;
  }

  private display(id: number, text: string, opts: { action?: ToastAction; durationMs?: number }) {
    clearTimeout(this.timer);
    const action = opts.action && {
      label: opts.action.label,
      // Running the action dismisses the toast first, so it can't run twice.
      run: async () => {
        if (this.current?.id !== id) return;
        this.dismiss();
        await opts.action!.run();
      },
    };
    this.current = { id, text, action };
    this.duration = opts.durationMs ?? (action ? TOAST_UNDO_MS : TOAST_MS);
    this.arm(this.duration);
  }

  private arm(ms: number) {
    clearTimeout(this.timer);
    const id = this.current?.id;
    this.remaining = ms;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      if (this.current?.id === id) this.next();
    }, ms);
  }

  private next() {
    this.current = null;
    const queued = this.waiting.shift();
    if (queued) this.display(queued.id, queued.text, queued.opts);
  }

  /** The finger or pointer is on the toast: stop the clock. */
  pause() {
    if (!this.current) return;
    clearTimeout(this.timer);
    this.remaining = Math.max(1500, this.deadline - Date.now());
  }

  /** ...and let go: give it the time that was left (at least 1.5 s). */
  resume() {
    if (!this.current) return;
    this.arm(this.remaining);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.next();
  }
}

export const toast = new ToastStore();

/** "Deleted" with an Undo that restores what was deleted. */
export function showUndo(text: string, restore: () => void | Promise<void>): number {
  return toast.show(text, { action: { label: 'Undo', run: restore } });
}

/**
 * `showUndo` for a delete inside an editor that holds its own draft (a
 * session being edited, Settings' copies of the catalogs): the Undo only
 * makes sense while that editor is open, so its toast goes when the
 * editor does. Call once from a component's script; use what it returns.
 */
export function scopedUndo(): (text: string, restore: () => void | Promise<void>) => void {
  let id: number | null = null;
  onDestroy(() => {
    if (id !== null && toast.current?.id === id) toast.dismiss();
  });
  return (text, restore) => {
    id = showUndo(text, restore);
  };
}
