import type { OutdoorAscent } from "../types";
import { toUtcDayIndex } from "../dateUtils";
import { normalizeGrade } from "./matching";
import { sendVGrade } from "./gradeHistogram";
import type { GradeScale } from "../units";
import { parseFontGrade } from "../analytics/grades";

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

/**
 * History's filter panel, applied to sends. Search and the date range are
 * shared with the Sessions tab; grade range, style and crag are the Sends
 * tab's own. Empty strings mean "any". Grades are stored Font grades; a
 * grade that can't be placed on the scale drops out of a grade range
 * rather than passing it.
 */
export interface SendFilters {
  search: string;
  /** Inclusive, "YYYY-MM-DD". */
  from: string;
  to: string;
  minGrade: string;
  maxGrade: string;
  style: string;
  crag: string;
}

export const EMPTY_SEND_FILTERS: SendFilters = { search: "", from: "", to: "", minGrade: "", maxGrade: "", style: "", crag: "" };

export function applySendFilters(ascents: OutdoorAscent[], f: SendFilters): OutdoorAscent[] {
  const q = f.search.trim().toLowerCase();
  const min = f.minGrade ? parseFontGrade(f.minGrade) : undefined;
  const max = f.maxGrade ? parseFontGrade(f.maxGrade) : undefined;
  return ascents.filter((a) => {
    const day = a.date?.slice(0, 10) ?? "";
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (min !== undefined || max !== undefined) {
      const rank = parseFontGrade(a.grade);
      if (rank === undefined) return false;
      if (min !== undefined && rank < min) return false;
      if (max !== undefined && rank > max) return false;
    }
    if (f.style && a.style !== f.style) return false;
    if (f.crag && a.crag !== f.crag) return false;
    if (q && ![a.name, a.crag, a.notes].some((t) => t?.toLowerCase().includes(q))) return false;
    return true;
  });
}
