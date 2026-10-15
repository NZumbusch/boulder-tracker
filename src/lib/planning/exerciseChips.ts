/*
 * The exercise chips on a calendar session card. A session's exercises are often the same category several times
 * ("Core Training" three times) or repeat the session's own title; as chips that is half a card of nothing new.
 * `groupChips` folds identical names into one chip with a count and drops one that only repeats the title.
 */

export interface ChipGroup<T extends { name: string }> {
  /** The first exercise of this name - its colour and id are the chip's. */
  first: T;
  name: string;
  count: number;
  /** "Core Training ×3", or just the name for one. */
  label: string;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The chips for `exercises`, in order of first appearance; a name equal to the session's `title` is left out. */
export function groupChips<T extends { name: string }>(exercises: readonly T[], title: string): ChipGroup<T>[] {
  const groups: ChipGroup<T>[] = [];
  for (const ex of exercises) {
    if (!ex.name.trim() || same(ex.name, title)) continue;
    const found = groups.find((g) => same(g.name, ex.name));
    if (found) {
      found.count += 1;
      found.label = `${found.name} ×${found.count}`;
    } else {
      groups.push({ first: ex, name: ex.name, count: 1, label: ex.name });
    }
  }
  return groups;
}
