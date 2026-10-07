import { describe, it, expect } from "vitest";
import { buildPlanPdf, phaseHex, type PlanPdfInput } from "./planPdf";

const input = (over: Partial<PlanPdfInput> = {}): PlanPdfInput => ({
  range: "21 Sep – 4 Oct 2026",
  generatedOn: "27 Sep 2026",
  weeks: [
    {
      title: "Week 39",
      dates: "21–27 Sep 2026",
      phase: { name: "Power", color: "bg-rose-500" },
      note: "Deload after the comp",
      plannedLoad: 1062,
      progress: 0.5,
      sessions: [
        {
          day: "Wed 23",
          name: "Board session",
          meta: "18:30 · ~60 min · load 620",
          description: "Keep it crisp",
          exercises: [{ name: "Limit bouldering", detail: "Duration 45 min", notes: "Rest fully" }],
        },
        { day: "Sat 26", name: "Outdoor", done: { load: 929 }, exercises: [] },
      ],
    },
    { title: "Week 40", dates: "28 Sep – 4 Oct 2026", plannedLoad: 0, sessions: [] },
  ],
  ...over,
});

/** Every string in a pdfmake content tree, in order. */
function texts(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object") {
    const n = node as Record<string, unknown>;
    return ["text", "stack", "columns", "table", "body"].flatMap((k) => (k in n ? texts(n[k]) : []));
  }
  return [];
}

describe("the training plan PDF", () => {
  it("has a title, an overview of the weeks, and each week's sessions", () => {
    const doc = buildPlanPdf(input());
    const all = texts(doc.content).join("\n");
    expect(all).toContain("Training plan");
    expect(all).toContain("21 Sep – 4 Oct 2026 · 2 weeks");
    expect(all).toContain("PLANNED LOAD");
    expect(all).toContain("50 %");
    expect(all).toContain("Board session");
    expect(all).toContain("WED 23");
    expect(all).toContain("Done · load 929");
    expect(all).toContain("Nothing planned.");
  });

  it("never splits a session across pages", () => {
    const doc = buildPlanPdf(input());
    const sessions = (doc.content as { unbreakable?: boolean }[]).filter((c) => c && c.unbreakable);
    expect(sessions).toHaveLength(2);
  });

  it("can leave out exercises and notes", () => {
    const all = texts(buildPlanPdf(input({ options: { exercises: false, notes: false } })).content).join("\n");
    expect(all).not.toContain("Limit bouldering");
    expect(all).not.toContain("Keep it crisp");
    expect(all).not.toContain("Deload after the comp");
    expect(all).toContain("Board session");
  });

  it("skips the overview for a single week, and numbers pages", () => {
    const one = input();
    one.weeks = [one.weeks[0]];
    const doc = buildPlanPdf(one);
    expect(texts(doc.content).join("\n")).not.toContain("PLANNED LOAD");
    const footer = (doc.footer as (p: number, n: number) => unknown)(2, 5);
    expect(texts(footer).join(" ")).toContain("2 / 5");
  });

  it("turns phase colour classes into a colour, grey when unknown", () => {
    expect(phaseHex("bg-rose-500")).toBe("#f43f5e");
    expect(phaseHex("#123456")).toBe("#123456");
    expect(phaseHex("bg-made-up")).toBe("#a1a1aa");
  });
});

describe("circuits in the PDF", () => {
  it("names a circuit above its members and indents them", () => {
    const doc = JSON.stringify(
      buildPlanPdf({
        range: "x", generatedOn: "x",
        weeks: [{ title: "Week 1", dates: "d", plannedLoad: 0, sessions: [{ name: "S", exercises: [
          { name: "Warm-up" },
          { name: "Plank", circuit: "Core A · 3 rounds · 15 s between", member: true },
          { name: "Push-ups", member: true },
        ] }] }],
      }),
    );
    expect(doc).toContain("CORE A · 3 ROUNDS · 15 S BETWEEN");
    expect(doc.indexOf("CORE A")).toBeGreaterThan(doc.indexOf("Warm-up"));
    expect(doc.indexOf("CORE A")).toBeLessThan(doc.indexOf("Plank"));
  });
});
