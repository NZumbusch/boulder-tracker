import type { OutdoorAscent } from "../types";
import { toUtcDayIndex } from "../dateUtils";

/**
 * Problem-name matching that survives the ways the same boulder gets
 * written down: case, accents ("Tremplin" vs "Trémplin"), punctuation and
 * spacing ("Kamelkante" vs "Kamel-Kante"), and small typos. Used by the
 * 8a.nu import's duplicate check and by trip projects.
 */

/** Lower-case, accents stripped, punctuation dropped, whitespace collapsed. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(name: string): string {
  return normalizeName(name).replace(/ /g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Similarity at or above which two different spellings are "probably the same problem". */
export const SIMILAR_NAME_RATIO = 0.8;
/** Names shorter than this (compacted) are too short to fuzzy-match safely. */
const MIN_FUZZY_LENGTH = 4;

export type NameMatch = "same" | "similar" | "different";

/**
 * "same": identical once normalised and spaces ignored. "similar": a small
 * edit apart, or one name is the other plus extra words ("Big Boss" /
 * "Big Boss sit") - worth asking about, not assuming. Missing names never match.
 */
export function matchNames(a: string | undefined, b: string | undefined): NameMatch {
  if (!a?.trim() || !b?.trim()) return "different";
  const ca = compact(a);
  const cb = compact(b);
  if (!ca || !cb) return "different";
  if (ca === cb) return "same";
  if (Math.min(ca.length, cb.length) < MIN_FUZZY_LENGTH) return "different";
  const ratio = 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length);
  if (ratio >= SIMILAR_NAME_RATIO) return "similar";
  const ta = normalizeName(a).split(" ");
  const tb = normalizeName(b).split(" ");
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.join("").length >= MIN_FUZZY_LENGTH && shorter.every((t) => longer.includes(t))) return "similar";
  return "different";
}

export function normalizeGrade(grade: string | undefined): string {
  return (grade ?? "").replace(/\s+/g, "").toUpperCase();
}

export function sameGrade(a: string | undefined, b: string | undefined): boolean {
  return normalizeGrade(a) !== "" && normalizeGrade(a) === normalizeGrade(b);
}

export function daysApart(a: string, b: string): number {
  return Math.abs(toUtcDayIndex(a) - toUtcDayIndex(b));
}

export type ImportStatus = "new" | "maybe" | "duplicate";

export interface ImportRow {
  ascent: OutdoorAscent;
  status: ImportStatus;
  /** The already-logged (or earlier in the same file) send it matched. */
  match?: OutdoorAscent;
}

/** How a candidate send relates to one existing send. */
function compare(candidate: OutdoorAscent, existing: OutdoorAscent): ImportStatus {
  const days = daysApart(candidate.date, existing.date);
  if (days > 1) return "new";
  const names = matchNames(candidate.name, existing.name);
  const grades = sameGrade(candidate.grade, existing.grade);
  if (candidate.name?.trim() && existing.name?.trim()) {
    if (names === "same" && grades && days === 0) return "duplicate";
    if (names !== "different") return "maybe";
    return "new";
  }
  // Unnamed on either side: fall back to day + grade + crag.
  if (days === 0 && grades) {
    const sameCrag = matchNames(candidate.crag, existing.crag) === "same";
    return sameCrag && (candidate.style ?? "") === (existing.style ?? "") ? "duplicate" : "maybe";
  }
  return "new";
}

/**
 * Sorts incoming sends into new / maybe (a likely duplicate the user
 * should decide on) / duplicate (already logged - discarded). Rows are
 * also checked against earlier rows of the same import, so a file that
 * lists a send twice doesn't import it twice.
 */
export function classifyImport(incoming: OutdoorAscent[], existing: OutdoorAscent[]): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const ascent of incoming) {
    let best: ImportRow = { ascent, status: "new" };
    const pool = [...existing, ...rows.filter((r) => r.status !== "duplicate").map((r) => r.ascent)];
    for (const other of pool) {
      const status = compare(ascent, other);
      if (status === "duplicate") {
        best = { ascent, status, match: other };
        break;
      }
      if (status === "maybe" && best.status === "new") best = { ascent, status, match: other };
    }
    rows.push(best);
  }
  return rows;
}
