import { describe, it, expect } from "vitest";
import type { GoalEvent, TrainingBlock } from "../types";
import { blockSegments, goalsInWindow, FALLBACK_BLOCK_COLOR } from "./timeline";
import { toUtcDayIndex } from "../dateUtils";

const block = (id: string, start: string, end: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id, name: id, phaseId: "p", startWeekId: start, endWeekId: end, ...extra,
});

describe("blockSegments", () => {
  const weeks = ["2026-W30", "2026-W31", "2026-W32", "2026-W33", "2026-W34"];

  it("merges consecutive weeks of one block and leaves gaps where there is none", () => {
    const segs = blockSegments([block("str", "2026-W30", "2026-W31"), block("pow", "2026-W33", "2026-W34")], [], weeks);
    expect(segs.map((s) => s.id)).toEqual(["str", "pow"]);
    expect(segs[0].endDay - segs[0].startDay).toBe(13);
    expect(segs[1].startDay).toBe(toUtcDayIndex("2026-08-10"));
  });

  it("uses the block's colour, then its phase's, then the fallback", () => {
    const phases = [{ id: "p", name: "P", color: "bg-blue-500" }];
    expect(blockSegments([block("a", "2026-W30", "2026-W30", { color: "bg-red-500" })], phases, weeks)[0].colorClass).toBe("bg-red-500");
    expect(blockSegments([block("a", "2026-W30", "2026-W30")], phases, weeks)[0].colorClass).toBe("bg-blue-500");
    expect(blockSegments([block("a", "2026-W30", "2026-W30")], [], weeks)[0].colorClass).toBe(FALLBACK_BLOCK_COLOR);
  });

  it("follows priority where blocks overlap", () => {
    const segs = blockSegments([block("base", "2026-W30", "2026-W34"), block("peak", "2026-W32", "2026-W32", { priority: 2 })], [], weeks);
    expect(segs.map((s) => s.id)).toEqual(["base", "peak", "base"]);
  });
});

describe("goalsInWindow", () => {
  const goals: GoalEvent[] = [
    { id: "c", kind: "competition", name: "Nationals", date: "2026-09-12" },
    { id: "t", kind: "trip", name: "Fontainebleau", date: "2026-10-01", endDate: "2026-10-10" },
    { id: "old", kind: "competition", name: "Old", date: "2025-01-01" },
  ];
  it("keeps goals overlapping the window, trips by their whole span", () => {
    const got = goalsInWindow(goals, toUtcDayIndex("2026-09-01"), toUtcDayIndex("2026-10-03"));
    expect(got.map((g) => g.id)).toEqual(["c", "t"]);
    expect(got[1].endDay).toBe(toUtcDayIndex("2026-10-10"));
  });
});
