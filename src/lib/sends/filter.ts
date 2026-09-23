import type { OutdoorAscent } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { normalizeGrade } from "./matching";
import { sendVGrade } from "./gradeHistogram";
import type { GradeScale } from "../units";

export type SendPeriod = "all" | "year";

/**
 * The sends the Sends tab shows: those in `period` (all time, or the last
 * 365 days before `asOf`), and - when a grade is picked on the chart -
 * only that grade (case- and space-insensitive; in V-scale, the whole band).
 */
export function filterSends(
  ascents: OutdoorAscent[],
  period: SendPeriod,
  grade: string | null,
  asOf: Date,
  scale: GradeScale = "font",
): OutdoorAscent[] {
  const today = toUtcDayIndex(asOf.toISOString());
  const wanted = grade ? normalizeGrade(grade) : null;
  return ascents.filter((a) => {
    if (period === "year" && (!a.date || today - toUtcDayIndex(a.date) > 365)) return false;
    if (wanted && (scale === "v" ? sendVGrade(a.grade) : normalizeGrade(a.grade)) !== wanted) return false;
    return true;
  });
}
