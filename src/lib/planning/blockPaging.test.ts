import { describe, it, expect } from "vitest";
import {
  sortBlocks,
  classifyBlock,
  currentBlockIndex,
  upcomingWindow,
  pageCount,
  pageForIndex,
  initialPage,
  clampPage,
  pageSlice,
} from "./blockPaging";
import type { TrainingBlock } from "../types";

function block(name: string, startWeekId: string, endWeekId: string): TrainingBlock {
  return { id: name, name, phaseId: "p1", startWeekId, endWeekId };
}

/** W10..W29, one block per two weeks - 10 blocks, with "now" (W20) in the middle. */
const BLOCKS: TrainingBlock[] = Array.from({ length: 10 }, (_, i) => {
  const start = 10 + i * 2;
  return block(`b${i}`, `2026-W${String(start).padStart(2, "0")}`, `2026-W${String(start + 1).padStart(2, "0")}`);
});
const NOW = "2026-W20"; // inside b5 (W20-W21)

describe("sortBlocks", () => {
  it("orders chronologically by start week", () => {
    const sorted = sortBlocks([block("late", "2026-W30", "2026-W31"), block("early", "2026-W02", "2026-W03")]);
    expect(sorted.map((b) => b.name)).toEqual(["early", "late"]);
  });

  it("sorts across a year boundary", () => {
    const sorted = sortBlocks([block("next", "2026-W01", "2026-W02"), block("prev", "2025-W52", "2025-W52")]);
    expect(sorted.map((b) => b.name)).toEqual(["prev", "next"]);
  });

  it("breaks ties on end week, then name, so the order is stable", () => {
    const sorted = sortBlocks([
      block("zulu", "2026-W10", "2026-W12"),
      block("alpha", "2026-W10", "2026-W12"),
      block("short", "2026-W10", "2026-W10"),
    ]);
    expect(sorted.map((b) => b.name)).toEqual(["short", "alpha", "zulu"]);
  });

  it("does not mutate its input", () => {
    const input = [block("b", "2026-W20", "2026-W21"), block("a", "2026-W10", "2026-W11")];
    sortBlocks(input);
    expect(input.map((b) => b.name)).toEqual(["b", "a"]);
  });
});

describe("classifyBlock", () => {
  it("marks a block that has already ended as past", () => {
    expect(classifyBlock(block("x", "2026-W10", "2026-W19"), NOW)).toBe("past");
  });

  it("marks a block covering the current week as current, including on its boundary weeks", () => {
    expect(classifyBlock(block("x", "2026-W18", "2026-W22"), NOW)).toBe("current");
    expect(classifyBlock(block("starts-now", NOW, "2026-W22"), NOW)).toBe("current");
    expect(classifyBlock(block("ends-now", "2026-W18", NOW), NOW)).toBe("current");
  });

  it("marks a block that has not started as upcoming", () => {
    expect(classifyBlock(block("x", "2026-W21", "2026-W25"), NOW)).toBe("upcoming");
  });
});

describe("currentBlockIndex", () => {
  it("finds the block covering the current week", () => {
    expect(currentBlockIndex(BLOCKS, NOW)).toBe(5);
  });

  it("finds the next block when the current week falls in a gap", () => {
    const gapped = [block("a", "2026-W10", "2026-W12"), block("b", "2026-W30", "2026-W32")];
    expect(currentBlockIndex(gapped, NOW)).toBe(1);
  });

  it("anchors on the last block when every block is in the past", () => {
    expect(currentBlockIndex(BLOCKS, "2026-W52")).toBe(BLOCKS.length - 1);
  });

  it("anchors on the first block when every block is still ahead", () => {
    expect(currentBlockIndex(BLOCKS, "2026-W01")).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(currentBlockIndex([], NOW)).toBe(0);
  });
});

describe("upcomingWindow", () => {
  it("returns everything when there are fewer blocks than the limit", () => {
    expect(upcomingWindow(BLOCKS.slice(0, 3), NOW, 10)).toHaveLength(3);
  });

  it("starts at the current block and runs forward", () => {
    const window = upcomingWindow(BLOCKS, NOW, 3);
    expect(window.map((b) => b.name)).toEqual(["b5", "b6", "b7"]);
  });

  it("backfills with earlier blocks rather than returning a short window near the end", () => {
    const window = upcomingWindow(BLOCKS, "2026-W29", 4);
    expect(window).toHaveLength(4);
    expect(window.map((b) => b.name)).toEqual(["b6", "b7", "b8", "b9"]);
  });

  it("still includes the current block when it backfills", () => {
    const window = upcomingWindow(BLOCKS, "2026-W52", 3);
    expect(window.map((b) => b.name)).toContain("b9");
  });

  it("returns nothing for an empty list or a non-positive limit", () => {
    expect(upcomingWindow([], NOW, 10)).toEqual([]);
    expect(upcomingWindow(BLOCKS, NOW, 0)).toEqual([]);
  });
});

describe("paging", () => {
  it("counts pages, never fewer than one", () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });

  it("maps an index to its page", () => {
    expect(pageForIndex(0, 10)).toBe(0);
    expect(pageForIndex(9, 10)).toBe(0);
    expect(pageForIndex(10, 10)).toBe(1);
  });

  it("opens on the page holding the current block, not on page 1", () => {
    expect(initialPage(BLOCKS, NOW, 4)).toBe(1); // index 5 -> page 1
    expect(initialPage(BLOCKS, "2026-W52", 4)).toBe(2); // last block -> last page
  });

  it("clamps a stale page back into range", () => {
    expect(clampPage(9, 12, 10)).toBe(1);
    expect(clampPage(-3, 12, 10)).toBe(0);
  });

  it("slices the page's items", () => {
    expect(pageSlice(BLOCKS, 1, 4).map((b) => b.name)).toEqual(["b4", "b5", "b6", "b7"]);
    expect(pageSlice(BLOCKS, 2, 4).map((b) => b.name)).toEqual(["b8", "b9"]);
  });
});
