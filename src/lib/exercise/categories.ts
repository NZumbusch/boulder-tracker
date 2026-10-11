import type { AnalyticsCategory } from "../types";

/**
 * The built-in analytics categories back as they ship: a missing one is added,
 * a renamed, recoloured or archived one is put back. Categories the user made are
 * left alone - workouts refer to categories by id, so removing one would
 * orphan its history.
 */
export function restoreDefaultCategories(current: AnalyticsCategory[], defaults: AnalyticsCategory[]): AnalyticsCategory[] {
  const builtIn = new Map(defaults.map((d) => [d.id, d]));
  const restored = current.map((c) => {
    const d = builtIn.get(c.id);
    if (!d) return c;
    builtIn.delete(c.id);
    const { archived: _archived, ...rest } = c;
    return { ...rest, name: d.name, color: d.color };
  });
  return [...restored, ...builtIn.values()].map((c) => ({ ...c }));
}
