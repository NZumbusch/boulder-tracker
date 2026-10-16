import { onDestroy, getContext, setContext } from 'svelte';
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

  /**
   * Swaps what the Undo on toast `id` does (if it is still showing) and
   * gives it a fresh full-length clock. A failing action says so instead of
   * leaving the person with a button that did nothing.
   */
  rebind(id: number, run: () => void | Promise<void>): boolean {
    const cur = this.current;
    if (!cur || cur.id !== id || !cur.action) return false;
    this.current = {
      ...cur,
      action: {
        label: cur.action.label,
        run: async () => {
          if (this.current?.id !== id) return;
          this.dismiss();
          try {
            await run();
          } catch {
            this.show("Could not undo - it has changed since.");
          }
        },
      },
    };
    this.arm(TOAST_UNDO_MS);
    return true;
  }
}

export const toast = new ToastStore();

/** "Deleted" with an Undo that restores what was deleted. */
export function showUndo(text: string, restore: () => void | Promise<void>): number {
  return toast.show(text, { action: { label: 'Undo', run: restore } });
}

/**
 * `showUndo` for a delete inside an editor that holds its own draft (a
 * session being edited, Settings' copies of the catalogs). While that
 * editor is open the Undo puts the thing back into the draft. When the
 * editor closes:
 *   - without saving, the draft is gone and so is the toast;
 *   - saving (`commit()`), the change is in the store, so a toast that
 *     was given a `late` restore stays and runs that one against the
 *     stored data instead. Without a `late` it goes, as before.
 */
export interface UndoScope {
  undoable: (text: string, restore: () => void | Promise<void>, late?: () => void | Promise<void>) => void;
  /** The draft was saved: an Undo may outlive the editor. */
  commit: () => void;
  /** The editor is closing. */
  close: () => void;
}

export function createUndoScope(): UndoScope {
  let id: number | null = null;
  let late: (() => void | Promise<void>) | undefined;
  let committed = false;
  return {
    undoable(text, restore, lateRestore) {
      id = showUndo(text, restore);
      late = lateRestore;
    },
    commit() {
      committed = true;
    },
    close() {
      if (id === null || toast.current?.id !== id) return;
      if (committed && late && toast.rebind(id, late)) return;
      toast.dismiss();
    },
  };
}

const OWNER_SCOPE = Symbol('undo-scope');

/**
 * A page that saves its drafts by itself (Settings) calls this once; the
 * `scopedUndo()` of its child editors then shares the page's lifetime, and
 * leaving the page counts as saved.
 */
export function provideUndoScope(): UndoScope {
  const scope = createUndoScope();
  setContext(OWNER_SCOPE, scope);
  onDestroy(() => {
    scope.commit();
    scope.close();
  });
  return scope;
}

/**
 * Call once from a component's script. Uses the owner's scope when an
 * ancestor provided one (`provideUndoScope`), otherwise this component's own,
 * closed when the component is destroyed.
 */
export function scopedUndo(): UndoScope['undoable'] & { commit: () => void } {
  const owner = getContext<UndoScope | undefined>(OWNER_SCOPE);
  const scope = owner ?? createUndoScope();
  if (!owner) onDestroy(() => scope.close());
  return Object.assign((text: string, restore: () => void | Promise<void>, late?: () => void | Promise<void>) => scope.undoable(text, restore, late), {
    commit: () => scope.commit(),
  });
}
