import { describe, expect, it } from "vitest";
import { firstPlanWeek, starterPlanOptions, previewOf } from "./starterPlan";
import { getBlocksForWeek } from "./trainingBlocks";
import { getWeekIdRange } from "../dateUtils";
import { DEFAULT_PHASE_DEFS, DEFAULT_TEMPLATE_LIBRARY } from "../constants";

describe("firstPlanWeek", () => {
  it("starts this week early in the week, next week from Friday on", () => {
    expect(firstPlanWeek(new Date(2026, 9, 5))).toBe("2026-W41"); // Monday
    expect(firstPlanWeek(new Date(2026, 9, 8))).toBe("2026-W41"); // Thursday
    expect(firstPlanWeek(new Date(2026, 9, 9))).toBe("2026-W42"); // Friday
    expect(firstPlanWeek(new Date(2026, 9, 3))).toBe("2026-W41"); // Saturday of W40
    expect(firstPlanWeek(new Date(2026, 9, 4))).toBe("2026-W41"); // Sunday of W40
  });

  it("crosses the year end with true ISO week counts (2026 has 53 weeks)", () => {
    expect(firstPlanWeek(new Date(2026, 11, 27))).toBe("2026-W53");
    expect(firstPlanWeek(new Date(2027, 0, 1))).toBe("2027-W01");
  });
});

describe("starterPlanOptions", () => {
  const options = starterPlanOptions("2026-W41");

  it("offers the 4-week base and the 3 + deload cycle", () => {
    expect(options.map((o) => o.id)).toEqual(["base-4", "base-deload"]);
  });

  it("base-4 is one Capacity block over four weeks, from the first week", () => {
    const [base] = options;
    expect(base.blocks).toHaveLength(1);
    expect(base.blocks[0]).toMatchObject({ phaseId: "phase-capacity", startWeekId: "2026-W41", endWeekId: "2026-W44" });
  });

  it("base + deload covers four weeks with no gap or overlap, deload last", () => {
    const cycle = options[1];
    expect(cycle.blocks.map((b) => b.phaseId)).toEqual(["phase-capacity", "phase-deload"]);
    const blocks = cycle.blocks.map((b, i) => ({ ...b, id: String(i) }));
    for (const week of getWeekIdRange("2026-W41", "2026-W44")) expect(getBlocksForWeek(blocks, week)).toHaveLength(1);
    expect(getBlocksForWeek(blocks, "2026-W44")[0].phaseId).toBe("phase-deload");
    expect(getBlocksForWeek(blocks, "2026-W45")).toEqual([]);
  });

  it("runs across New Year without skipping a week", () => {
    const [base] = starterPlanOptions("2026-W52");
    expect(base.blocks[0].endWeekId).toBe("2027-W02");
  });

  it("only uses phases that exist", () => {
    const ids = new Set(DEFAULT_PHASE_DEFS.map((p) => p.id));
    for (const o of options) for (const b of o.blocks) expect(ids.has(b.phaseId)).toBe(true);
  });
});

describe("previewOf", () => {
  it("lists each block's weeks, phase and the sessions its template gives, for the chosen level", () => {
    for (const set of DEFAULT_TEMPLATE_LIBRARY) {
      const [base] = starterPlanOptions("2026-W41");
      const preview = previewOf(base, set.templates, DEFAULT_PHASE_DEFS);
      expect(preview).toHaveLength(1);
      expect(preview[0].phase).toBe("Capacity");
      expect(preview[0].weeks).toBe(4);
      expect(preview[0].sessions.length).toBeGreaterThan(0);
      expect(preview[0].sessions).not.toContain("Session");
    }
  });

  it("copes with a phase that has no sessions", () => {
    const [base] = starterPlanOptions("2026-W41");
    expect(previewOf(base, {}, DEFAULT_PHASE_DEFS)[0].sessions).toEqual([]);
  });
});
