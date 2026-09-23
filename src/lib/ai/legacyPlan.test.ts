import { describe, it, expect } from "vitest";
import { parsePlanImport } from "./planImportEntry";

const current = {
  exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: [] }],
  phaseDefs: [{ id: "p", name: "Capacity" }],
};

describe("parsePlanImport", () => {
  it("validates a change set directly, even inside a code fence", () => {
    const r = parsePlanImport('```json\n{"weeks":[{"week":"2026-W40","phase":"Capacity"}]}\n```', current);
    expect(r.result.valid).toBe(true);
    expect(r.legacyFormat).toBeUndefined();
  });

  it("converts an old phase-format plan: typical weeks, ranges, notes, new exercises", () => {
    const r = parsePlanImport(JSON.stringify({
      phases: [
        { phaseName: "Capacity", startWeekId: "2026-W40", endWeekId: "2026-W41", notes: "Base", weekNotes: { "2026-W41": "Test" }, sessions: [{ name: "Board", dayOfWeek: "Monday", exercises: [{ exerciseTypeName: "Max Hangs", categoryName: "Fingers", values: { sets: 5 } }] }] },
        { phaseName: "Power", startWeekId: "2026-W42", endWeekId: "2026-W42", sessions: [] },
      ],
    }), current);
    expect(r.legacyFormat).toBe("phase");
    const set = r.result.data!;
    expect(set.exerciseTypes).toEqual([{ action: "add", name: "Max Hangs", categoryName: "Fingers" }]);
    expect(set.phases.map((p) => `${p.action}:${p.name}`)).toEqual(["edit:Capacity", "add:Power"]);
    expect(set.weeks).toEqual([
      { weekIds: ["2026-W40", "2026-W41"], phase: "Capacity", blockNotes: "Base" },
      { weekIds: ["2026-W41"], notes: "Test" },
      { weekIds: ["2026-W42"], phase: "Power" },
    ]);
  });

  it("converts an old weekly plan, creating phases it doesn't know", () => {
    const r = parsePlanImport(JSON.stringify({ weeks: [{ weekId: "2026-W40", phaseName: "Taper", notes: "Easy", workouts: [{ name: "Light", exercises: [] }] }] }), current);
    const set = r.result.data!;
    expect(set.phases).toEqual([{ action: "add", name: "Taper", sessions: [] }]);
    expect(set.weeks[0]).toMatchObject({ weekIds: ["2026-W40"], phase: "Taper", notes: "Easy", sessions: [{ name: "Light", exercises: [] }] });
  });

  it("reports garbage clearly", () => {
    expect(parsePlanImport("not json", current).result.issues[0].message).toContain("Could not parse");
    expect(parsePlanImport("{}", current).result.valid).toBe(false);
  });
});
