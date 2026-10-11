/**
 * Svelte action: moves a full-screen overlay to `<body>`. An overlay
 * opened from inside an animated card (Settings slides in, ExerciseForm
 * zooms in) would otherwise be positioned against that card while its
 * transform runs - `position: fixed` stops meaning "the screen" under a
 * transformed ancestor - and show up clipped, under the nav bar.
 */
export function portal(node: HTMLElement) {
  if (typeof document === "undefined") return;
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
