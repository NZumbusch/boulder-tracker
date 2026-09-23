import { parseFontGrade } from "../analytics/grades";
import { normalizeGrade } from "./matching";
import type { GradeScale } from "../units";

/**
 * Font <-> V-scale, using the common conversion chart. Grades are always
 * stored in Font; V is a display scale. Several Font grades share one V
 * grade (6A and 6A+ are both V3), so converting V back to Font picks the
 * lowest Font grade of that band.
 */
const V_BANDS: { v: string; font: string[] }[] = [
  { v: "VB", font: ["3", "3+"] },
  { v: "V0", font: ["4", "4+", "4A", "4A+", "4B", "4B+", "4C", "4C+"] },
  { v: "V1", font: ["5", "5A", "5A+", "5B", "5B+"] },
  { v: "V2", font: ["5+", "5C", "5C+"] },
  { v: "V3", font: ["6A", "6A+"] },
  { v: "V4", font: ["6B", "6B+"] },
  { v: "V5", font: ["6C", "6C+"] },
  { v: "V6", font: ["7A"] },
  { v: "V7", font: ["7A+"] },
  { v: "V8", font: ["7B", "7B+"] },
  { v: "V9", font: ["7C"] },
  { v: "V10", font: ["7C+"] },
  { v: "V11", font: ["8A"] },
  { v: "V12", font: ["8A+"] },
  { v: "V13", font: ["8B"] },
  { v: "V14", font: ["8B+"] },
  { v: "V15", font: ["8C"] },
  { v: "V16", font: ["8C+"] },
  { v: "V17", font: ["9A"] },
];

export const V_SCALE = V_BANDS.map((b) => b.v);

export function fontToV(grade: string): string | undefined {
  const g = normalizeGrade(grade);
  return V_BANDS.find((b) => b.font.includes(g))?.v;
}

/** The lowest Font grade of a V band ("V4" -> "6B"), or undefined. */
export function vToFont(grade: string): string | undefined {
  const g = normalizeGrade(grade);
  return V_BANDS.find((b) => b.v === g)?.font[0];
}

/** Rank of a V grade for ordering (VB lowest). */
export function vRank(grade: string): number | undefined {
  const i = V_SCALE.indexOf(normalizeGrade(grade));
  return i === -1 ? undefined : i;
}

/** A stored grade as it should be shown: in V-scale when chosen and convertible, otherwise as stored. */
export function displayGrade(grade: string, scale: GradeScale): string {
  if (scale !== "v" || parseFontGrade(normalizeGrade(grade)) === undefined) return grade;
  return fontToV(grade) ?? grade;
}

/**
 * A grade as typed, ready to store: a V grade ("v5", "V5") becomes its
 * Font equivalent; anything else is kept as typed (trimmed).
 */
export function gradeFromInput(input: string): string {
  const trimmed = input.trim();
  if (/^v(b|\d{1,2})$/i.test(trimmed)) return vToFont(trimmed) ?? trimmed;
  return trimmed;
}
