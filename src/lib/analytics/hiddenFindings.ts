/**
 * Findings the user has dismissed ("hide this finding" on an Analytics finding). The preference `hiddenFindings`
 * holds the ids; a finding that returns later under the same id stays hidden until it is restored from the
 * overflow menu ("Hidden findings"). Pure helpers - Analytics reads the list, the store writes it.
 */
import type { Insight } from './insights';

/** More than this many ids is a corrupt list, not a person: the oldest are dropped. */
export const MAX_HIDDEN_FINDINGS = 200;

/** Repairs a stored value into a list of unique non-empty id strings. Never throws. */
export function validateHiddenFindings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) if (typeof id === 'string' && id.length > 0 && id.length <= 120) seen.add(id);
  return [...seen].slice(-MAX_HIDDEN_FINDINGS);
}

/** Adds an id (once). */
export function withHidden(hidden: readonly string[], id: string): string[] {
  return validateHiddenFindings([...hidden.filter((x) => x !== id), id]);
}

/** Removes an id. */
export function withoutHidden(hidden: readonly string[], id: string): string[] {
  return hidden.filter((x) => x !== id);
}

/** The findings still shown, and those that are hidden right now (a hidden id whose rule is quiet today is in neither). */
export function splitFindings(all: Insight[], hidden: readonly string[]): { shown: Insight[]; hidden: Insight[] } {
  const set = new Set(hidden);
  return { shown: all.filter((f) => !set.has(f.id)), hidden: all.filter((f) => set.has(f.id)) };
}
