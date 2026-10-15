/**
 * The colours a phase or an analytics category can take, as the stored Tailwind class and a name people can read out.
 * One list for both editors. The classes are written out in full so Tailwind finds them.
 */
export const COLOR_CHOICES: { value: string; name: string }[] = [
  { value: 'bg-success-hover', name: 'Green' },
  { value: 'bg-tertiary-hover', name: 'Purple' },
  { value: 'bg-indigo-500', name: 'Indigo' },
  { value: 'bg-rose-500', name: 'Rose' },
  { value: 'bg-amber-500', name: 'Amber' },
  { value: 'bg-sky-500', name: 'Sky blue' },
  { value: 'bg-zinc-500', name: 'Grey' },
  { value: 'bg-warning', name: 'Orange' },
  { value: 'bg-cyan-500', name: 'Cyan' },
  { value: 'bg-fuchsia-500', name: 'Fuchsia' },
  { value: 'bg-lime-500', name: 'Lime' },
  { value: 'bg-teal-500', name: 'Teal' },
  { value: 'bg-pink-500', name: 'Pink' },
];

export const DEFAULT_COLOR = COLOR_CHOICES[0].value;
