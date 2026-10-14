import { tick } from "svelte";

/** Whether the navigation drawer is open, and the button that opened it (focus goes back there on close). */
class Drawer {
  open = $state(false);
  #opener: HTMLElement | null = null;

  show(opener?: HTMLElement | null) {
    this.#opener = opener ?? (document.activeElement as HTMLElement | null);
    this.open = true;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    const opener = this.#opener;
    this.#opener = null;
    // After the drawer has left the DOM and the dialog layer (lib/ui/dialogLayer, which treats the drawer as a dialog and makes the page behind it inert) has caught up: it does that on a short timer.
    void tick().then(() => setTimeout(() => opener?.focus?.(), 40));
  }
}

export const drawer = new Drawer();
