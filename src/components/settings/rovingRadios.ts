/**
 * Keyboard behaviour of a radio group built from buttons (`role="radiogroup"` around `role="radio"` buttons): the
 * arrow keys move to the previous or next option and choose it, Home and End jump to the ends. Each button should have
 * `tabindex` 0 when it is the chosen one (or the first one when nothing is chosen) and -1 otherwise, so the group is a
 * single tab stop, as a native radio group is.
 */
export function rovingRadios(node: HTMLElement) {
  function onkeydown(e: KeyboardEvent) {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const radios = [...node.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')];
    if (radios.length === 0) return;
    const at = radios.indexOf(document.activeElement as HTMLElement);
    let next = at;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = at < 0 ? 0 : (at + 1) % radios.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = at < 0 ? radios.length - 1 : (at - 1 + radios.length) % radios.length;
    else if (e.key === 'Home') next = 0;
    else next = radios.length - 1;
    e.preventDefault();
    radios[next].focus();
    radios[next].click();
  }
  node.addEventListener('keydown', onkeydown);
  return { destroy: () => node.removeEventListener('keydown', onkeydown) };
}
