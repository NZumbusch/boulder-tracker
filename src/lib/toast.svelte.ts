import { onDestroy } from 'svelte';
/**
 * One short message at the bottom of the screen, with an optional action -
 * mostly "Undo" after a delete, so deleting doesn't have to ask first.
 * A new toast replaces the current one. `Toast.svelte` renders it.
 */
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

  show(text: string, opts: { action?: ToastAction; durationMs?: number } = {}): number {
    clearTimeout(this.timer);
    const id = this.nextId++;
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
    this.timer = setTimeout(() => {
      if (this.current?.id === id) this.current = null;
    }, opts.durationMs ?? (action ? 6000 : 3000));
    return id;
  }

  dismiss() {
    clearTimeout(this.timer);
    this.current = null;
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
