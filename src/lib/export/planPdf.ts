import type { Content, ContentTable, CustomTableLayout, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";

/**
 * The printable training plan (Settings -> Connections & Exports -> PDF).
 *
 * pdfmake lays out real text, so the PDF is sharp, searchable and small,
 * paginates itself and never splits a session across pages. The previous
 * export photographed the page with html2canvas: one giant image that phone
 * browsers silently render blank past their canvas size limit (a long range
 * came out as dozens of white pages).
 *
 * This module is pure - it turns plain data into a pdfmake document - so it
 * is tested without a browser; `planPdfRender.ts` loads pdfmake to print it.
 *
 * Design: A4, generous margins, one typeface (Roboto, Android's own),
 * greys for structure; colour only means something (a phase's dot, "done").
 */

export interface PlanPdfExercise {
  name: string;
  /** "4 sets · 6 reps · 20 kg" - what it asks for. */
  detail?: string;
  notes?: string;
}

export interface PlanPdfSession {
  /** "Mon 21" - absent for a session without a day. */
  day?: string;
  name: string;
  /** "18:00 · ~90 min · load 620". */
  meta?: string;
  /** Completed: its rated load, shown as "Done · load 929". */
  done?: { load?: number };
  description?: string;
  exercises: PlanPdfExercise[];
}

export interface PlanPdfWeek {
  /** "Week 39". */
  title: string;
  /** "21–27 Sep 2026". */
  dates: string;
  phase?: { name: string; color?: string };
  note?: string;
  sessions: PlanPdfSession[];
  plannedLoad: number;
  /** 0-1+, logged vs planned work (see `planProgress`), when anything is planned. */
  progress?: number;
}

export interface PlanPdfInput {
  /** "21 Sep – 1 Nov 2026". */
  range: string;
  generatedOn: string;
  weeks: PlanPdfWeek[];
  options?: { exercises?: boolean; notes?: boolean };
}

const INK = "#18181b";
const MUTED = "#71717a";
const FAINT = "#a1a1aa";
const RULE = "#e4e4e7";
const DONE = "#16a34a";

/** Tailwind phase colour classes (`bg-emerald-500`...) to a hex for the dot; unknown ones stay grey. */
const PHASE_HEX: Record<string, string> = {
  "bg-success-hover": "#15803d",
  "bg-tertiary-hover": "#7c3aed",
  "bg-indigo-500": "#6366f1",
  "bg-rose-500": "#f43f5e",
  "bg-amber-500": "#f59e0b",
  "bg-sky-500": "#0ea5e9",
  "bg-zinc-500": "#71717a",
  "bg-warning": "#f59e0b",
  "bg-cyan-500": "#06b6d4",
  "bg-fuchsia-500": "#d946ef",
  "bg-lime-500": "#84cc16",
  "bg-teal-500": "#14b8a6",
  "bg-pink-500": "#ec4899",
  "bg-emerald-500": "#10b981",
  "bg-red-500": "#ef4444",
  "bg-orange-500": "#f97316",
  "bg-blue-500": "#3b82f6",
  "bg-purple-500": "#a855f7",
  "bg-violet-500": "#8b5cf6",
  "bg-green-500": "#22c55e",
  "bg-yellow-500": "#eab308",
  "bg-slate-500": "#64748b",
  "bg-gray-500": "#6b7280",
};

export function phaseHex(colorClass: string | undefined): string {
  if (!colorClass) return FAINT;
  if (colorClass.startsWith("#")) return colorClass;
  return PHASE_HEX[colorClass] ?? FAINT;
}

function dot(color: string): Content {
  return { canvas: [{ type: "ellipse", x: 3, y: 5.5, r1: 3, r2: 3, color }], width: 10 } as Content;
}

/** Horizontal hairlines between rows only - the table reads as a list. */
const hairlines: CustomTableLayout = {
  hLineWidth: (i: number, node: ContentTable) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => RULE,
  paddingLeft: (i: number) => (i === 0 ? 0 : 6),
  paddingRight: (i: number, node: ContentTable) => (i === (Array.isArray(node.table.widths) ? node.table.widths.length : 1) - 1 ? 0 : 6),
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

function overview(weeks: PlanPdfWeek[]): Content {
  const head = (text: string, alignment: "left" | "right" = "left"): TableCell => ({ text: text.toUpperCase(), style: "th", alignment });
  const body: TableCell[][] = [
    [head("Week"), head("Dates"), head("Phase"), head("Sessions", "right"), head("Planned load", "right"), head("Done", "right")],
    ...weeks.map((w): TableCell[] => [
      { text: w.title, bold: true },
      { text: w.dates, color: MUTED },
      w.phase ? ({ columns: [dot(phaseHex(w.phase.color)), { text: w.phase.name }], columnGap: 2 } as TableCell) : { text: "–", color: FAINT },
      { text: String(w.sessions.length), alignment: "right" },
      { text: w.plannedLoad ? String(Math.round(w.plannedLoad)) : "–", alignment: "right", color: w.plannedLoad ? INK : FAINT },
      { text: w.progress !== undefined ? `${Math.round(w.progress * 100)} %` : "–", alignment: "right", color: w.progress !== undefined ? INK : FAINT },
    ]),
  ];
  return {
    table: { headerRows: 1, widths: ["auto", "*", "*", "auto", "auto", "auto"], body },
    layout: hairlines,
    fontSize: 9,
    margin: [0, 0, 0, 8],
  };
}

function session(s: PlanPdfSession, opts: Required<NonNullable<PlanPdfInput["options"]>>): Content {
  const right: Content[] = [
    {
      columns: [
        { text: s.name, style: "session", width: "*" },
        s.done
          ? { text: `Done${s.done.load ? ` · load ${Math.round(s.done.load)}` : ""}`, color: DONE, fontSize: 8.5, bold: true, width: "auto", margin: [0, 2, 0, 0] }
          : { text: "", width: "auto" },
      ],
    },
  ];
  if (s.meta) right.push({ text: s.meta, style: "meta" });
  if (opts.notes && s.description) right.push({ text: s.description, style: "note", margin: [0, 3, 0, 0] });
  if (opts.exercises && s.exercises.length) {
    right.push({
      margin: [0, 5, 0, 0],
      table: {
        widths: [12, "*"],
        body: s.exercises.map((e, i): TableCell[] => [
          { text: String(i + 1), color: FAINT, fontSize: 8.5 },
          {
            stack: [
              { text: [{ text: e.name, color: INK }, ...(e.detail ? [{ text: `   ${e.detail}`, color: MUTED }] : [])], fontSize: 9 },
              ...(opts.notes && e.notes ? [{ text: e.notes, style: "note", fontSize: 8 }] : []),
            ],
          },
        ]),
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 1.5, paddingBottom: () => 1.5 },
    });
  }
  return {
    // A session is never split across two pages.
    unbreakable: true,
    margin: [0, 0, 0, 10],
    columns: [
      { text: (s.day ?? "No day").toUpperCase(), style: "day", width: 46 },
      { stack: right, width: "*" },
    ],
  };
}

function week(w: PlanPdfWeek, opts: Required<NonNullable<PlanPdfInput["options"]>>): Content[] {
  const header = {
    // Kept with its first session (see pageBreakBefore in buildPlanPdf).
    headlineLevel: 1,
    margin: [0, 14, 0, 8],
    stack: [
      {
        columns: [
          { text: [{ text: w.title, style: "week" }, { text: `   ${w.dates}`, color: MUTED, fontSize: 10 }], width: "*" },
          (w.phase
            ? { columns: [dot(phaseHex(w.phase.color)), { text: w.phase.name, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] }], width: "auto", columnGap: 2 }
            : { text: "", width: "auto" }) as unknown as Content,
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: RULE }] },
      ...(opts.notes && w.note ? [{ text: w.note, style: "note", margin: [0, 6, 0, 0] } as Content] : []),
    ],
  } as Content;
  if (w.sessions.length === 0) return [header, { text: "Nothing planned.", style: "meta", margin: [46, 0, 0, 6] }];
  return [header, ...w.sessions.map((s) => session(s, opts))];
}

export function buildPlanPdf(input: PlanPdfInput): TDocumentDefinitions {
  const opts = { exercises: input.options?.exercises ?? true, notes: input.options?.notes ?? true };
  return {
    pageSize: "A4",
    pageMargins: [40, 48, 40, 48],
    info: { title: `Training plan · ${input.range}`, creator: "Boulder Tracker" },
    defaultStyle: { font: "Roboto", fontSize: 10, color: INK, lineHeight: 1.2 },
    styles: {
      brand: { fontSize: 7.5, bold: true, color: FAINT, characterSpacing: 1.5 },
      title: { fontSize: 22, bold: true },
      subtitle: { fontSize: 10, color: MUTED },
      th: { fontSize: 7, bold: true, color: FAINT, characterSpacing: 0.6 },
      week: { fontSize: 14, bold: true },
      session: { fontSize: 11, bold: true },
      day: { fontSize: 8, bold: true, color: MUTED, characterSpacing: 0.6, margin: [0, 2.5, 0, 0] },
      meta: { fontSize: 8.5, color: MUTED },
      note: { fontSize: 8.5, italics: true, color: MUTED },
    },
    content: [
      { text: "BOULDER TRACKER", style: "brand" },
      { text: "Training plan", style: "title", margin: [0, 4, 0, 2] },
      { text: `${input.range} · ${input.weeks.length} week${input.weeks.length === 1 ? "" : "s"}`, style: "subtitle", margin: [0, 0, 0, 16] },
      ...(input.weeks.length > 1 ? [overview(input.weeks)] : []),
      ...input.weeks.flatMap((w) => week(w, opts)),
    ],
    // A week heading never sits alone at the bottom of a page.
    pageBreakBefore: (node, nodes) => node.headlineLevel === 1 && nodes.getFollowingNodesOnPage().length === 0,
    footer: (page, pages) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: `Boulder Tracker · generated ${input.generatedOn}`, fontSize: 7.5, color: FAINT },
        { text: `${page} / ${pages}`, fontSize: 7.5, color: FAINT, alignment: "right" },
      ],
    }),
  };
}
