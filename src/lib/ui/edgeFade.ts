/**
 * Svelte action for a horizontally scrolling row: marks which side still has content hidden
 * (`data-fade-start` / `data-fade-end`), which the `edge-fade-x` style turns into a soft fade.
 */
export function edgeFade(node: HTMLElement) {
  const update = () => {
    const max = node.scrollWidth - node.clientWidth;
    node.toggleAttribute('data-fade-start', node.scrollLeft > 2);
    node.toggleAttribute('data-fade-end', max > 2 && node.scrollLeft < max - 2);
  };
  update();
  node.addEventListener('scroll', update, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
  ro?.observe(node);
  for (const child of Array.from(node.children)) ro?.observe(child);
  return {
    destroy() {
      node.removeEventListener('scroll', update);
      ro?.disconnect();
    }
  };
}
