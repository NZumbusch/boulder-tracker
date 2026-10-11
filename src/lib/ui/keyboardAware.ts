/**
 * Svelte action for a bottom sheet's panel: keeps the field being typed in
 * visible while the on-screen keyboard is up.
 *
 * The keyboard leaves only a sliver of the screen, and a sheet with a sticky
 * footer spends most of it on that footer. While a field has focus the panel
 * gets `data-typing`, which the footer uses (`group-data-[typing]:static`)
 * to scroll away with the content, and the focused field is scrolled to the
 * middle once the keyboard has finished opening.
 */
export function keyboardAware(node: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const isField = (t: EventTarget | null): t is HTMLElement =>
    t instanceof HTMLElement && (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && !["checkbox", "radio", "range", "button"].includes(t.type)));

  const onFocusIn = (e: FocusEvent) => {
    if (!isField(e.target)) return;
    node.dataset.typing = "";
    const field = e.target;
    clearTimeout(timer);
    timer = setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
  };
  const onFocusOut = () => {
    // Focus moving between fields passes through a gap: only clear if nothing took it.
    setTimeout(() => { if (!isField(document.activeElement) || !node.contains(document.activeElement)) delete node.dataset.typing; }, 50);
  };

  node.addEventListener("focusin", onFocusIn);
  node.addEventListener("focusout", onFocusOut);
  return {
    destroy() {
      clearTimeout(timer);
      node.removeEventListener("focusin", onFocusIn);
      node.removeEventListener("focusout", onFocusOut);
    },
  };
}
