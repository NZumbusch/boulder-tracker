import type { OutdoorAscent } from "../types";
import { parseFontGrade } from "../analytics/grades";
import { normalizeGrade } from "./matching";
import { V_SCALE, fontToV, vRank } from "./gradeScale";
import type { GradeScale } from "../units";

export interface GradeBar {
  grade: string;
  count: number;
  /** Of `count`, how many were flashed or onsighted. */
  flashed: number;
}

export interface GradeHistogram {
  bars: GradeBar[];
  /** Sends whose grade isn't a Font grade (V-scale, typos) - counted, not charted. */
  unplotted: number;
}

const LETTERS = ["A", "B", "C"];
/** Below 6, Font is usually written without letters (5, 5+) - unless the sends themselves use them (8a.nu writes "5C"). */
const LETTERED_FROM = 6;

/** Every grade step for one number: "6A, 6A+, …, 6C+" or "5, 5+". */
function stepsFor(n: number, lettered: boolean): string[] {
  if (!lettered) return [`${n}`, `${n}+`];
  return LETTERS.flatMap((l) => [`${n}${l}`, `${n}${l}+`]);
}

/**
 * Sends per Font grade for a bar chart: every step from the easiest to the
 * hardest grade sent, plus one step of padding either side, empty steps
 * included - so the gaps in a pyramid show. Grades are matched case- and
 * space-insensitively ("6a+" counts as "6A+").
 */
export function gradeHistogram(ascents: OutdoorAscent[], padding = 1, scale: GradeScale = "font"): GradeHistogram {
  if (scale === "v") return vHistogram(ascents, padding);
  const counts = new Map<string, GradeBar>();
  const letteredNumbers = new Set<number>();
  let unplotted = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const a of ascents) {
    const grade = normalizeGrade(a.grade);
    const rank = parseFontGrade(grade);
    if (rank === undefined) {
      unplotted++;
      continue;
    }
    const n = Math.floor(rank / 100);
    if (/[A-C]/.test(grade)) letteredNumbers.add(n);
    min = Math.min(min, n);
    max = Math.max(max, n);
    const bar = counts.get(grade) ?? { grade, count: 0, flashed: 0 };
    bar.count++;
    if (/^(flash|onsight)$/i.test(a.style ?? "")) bar.flashed++;
    counts.set(grade, bar);
  }
  if (counts.size === 0) return { bars: [], unplotted };

  const ladder: string[] = [];
  for (let n = Math.max(3, min - 1); n <= max + 1; n++) {
    ladder.push(...stepsFor(n, n >= LETTERED_FROM || letteredNumbers.has(n)));
  }
  const rank = (g: string) => parseFontGrade(g)!;
  const lo = Math.min(...[...counts.keys()].map(rank));
  const hi = Math.max(...[...counts.keys()].map(rank));
  // Grades sent that the ladder spells differently (e.g. "5C" when 5 is unlettered) still get a place.
  for (const g of counts.keys()) if (!ladder.includes(g)) ladder.push(g);
  ladder.sort((a, b) => rank(a) - rank(b));

  const first = ladder.findIndex((g) => rank(g) >= lo);
  const last = ladder.length - 1 - [...ladder].reverse().findIndex((g) => rank(g) <= hi);
  const window = ladder.slice(Math.max(0, first - padding), Math.min(ladder.length, last + padding + 1));
  return { bars: window.map((grade) => counts.get(grade) ?? { grade, count: 0, flashed: 0 }), unplotted };
}

/** The V grade a send falls in: its Font grade's band, or its own grade if it was written in V. */
export function sendVGrade(grade: string): string | undefined {
  const g = normalizeGrade(grade);
  return fontToV(g) ?? (vRank(g) !== undefined ? g : undefined);
}

/** As `gradeHistogram`, but one bar per V grade (VB-V17). */
function vHistogram(ascents: OutdoorAscent[], padding: number): GradeHistogram {
  const counts = new Map<string, GradeBar>();
  let unplotted = 0;
  for (const a of ascents) {
    const v = sendVGrade(a.grade);
    if (!v) {
      unplotted++;
      continue;
    }
    const bar = counts.get(v) ?? { grade: v, count: 0, flashed: 0 };
    bar.count++;
    if (/^(flash|onsight)$/i.test(a.style ?? "")) bar.flashed++;
    counts.set(v, bar);
  }
  if (counts.size === 0) return { bars: [], unplotted };
  const ranks = [...counts.keys()].map((v) => vRank(v)!);
  const lo = Math.max(0, Math.min(...ranks) - padding);
  const hi = Math.min(V_SCALE.length - 1, Math.max(...ranks) + padding);
  return { bars: V_SCALE.slice(lo, hi + 1).map((grade) => counts.get(grade) ?? { grade, count: 0, flashed: 0 }), unplotted };
}
